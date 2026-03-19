# ─── prometheus.yml → S3 업로드 ──────────────────────────────────────────────
# Terraform templatefile로 클러스터 이름/리전을 주입한 후 artifacts 버킷에 저장
resource "aws_s3_object" "config" {
  bucket  = var.artifact_bucket_name
  key     = "prometheus/prometheus.yml"
  content = templatefile("${path.module}/prometheus.yml.tpl", {
    region      = var.aws_region
    name_prefix = var.name_prefix
  })

  content_type = "text/plain"
  tags         = merge(var.tags, { Name = "prometheus-config" })
}

# ─── IAM ─────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution Role: ECR pull + CloudWatch Logs 쓰기
resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-prometheus-exec-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role: ECS Service Discovery + S3(prometheus.yml) 읽기
resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-prometheus-task-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "task" {
  name = "${var.name_prefix}-prometheus-task-policy"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECS Service Discovery — 모든 태스크 IP 조회
      {
        Sid    = "ECSServiceDiscovery"
        Effect = "Allow"
        Action = [
          "ecs:ListClusters",
          "ecs:ListServices",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeContainerInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeInstances"
        ]
        Resource = "*"
      },
      # S3에서 prometheus.yml 다운로드 (init 컨테이너)
      {
        Sid    = "PrometheusConfigRead"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.artifact_bucket_name}/prometheus/*"
      }
    ]
  })
}

# ─── CloudWatch Log Group ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "prometheus" {
  name              = "/ecs/${var.name_prefix}-prometheus"
  retention_in_days = 7
  tags              = merge(var.tags, { Name = "${var.name_prefix}-prometheus-logs" })
}

# ─── ECS Task Definition ──────────────────────────────────────────────────────
# init 컨테이너(aws-cli)가 S3에서 prometheus.yml을 받아 공유 볼륨에 저장
# prometheus 컨테이너가 init 완료 후 해당 볼륨을 마운트해서 기동
resource "aws_ecs_task_definition" "prometheus" {
  family                   = "${var.name_prefix}-prometheus"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  # init-config 컨테이너와 prometheus 컨테이너가 공유하는 임시 볼륨
  volume {
    name = "prometheus-config"
  }

  container_definitions = jsonencode([
    # ── Step 1: S3에서 prometheus.yml 다운로드 ──────────────────────────────
    {
      name      = "init-config"
      image     = "public.ecr.aws/aws-cli/aws-cli:latest"
      essential = false
      command = [
        "s3", "cp",
        "s3://${var.artifact_bucket_name}/prometheus/prometheus.yml",
        "/etc/prometheus/prometheus.yml"
      ]
      mountPoints = [
        {
          sourceVolume  = "prometheus-config"
          containerPath = "/etc/prometheus"
          readOnly      = false
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.prometheus.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "init"
        }
      }
    },

    # ── Step 2: Prometheus 본체 ─────────────────────────────────────────────
    {
      name      = "prometheus"
      image     = "prom/prometheus:v2.51.2"
      essential = true
      dependsOn = [
        { containerName = "init-config", condition = "SUCCESS" }
      ]
      portMappings = [
        { containerPort = 9090, hostPort = 9090, protocol = "tcp" }
      ]
      mountPoints = [
        {
          sourceVolume  = "prometheus-config"
          containerPath = "/etc/prometheus"
          readOnly      = true
        }
      ]
      command = [
        "--config.file=/etc/prometheus/prometheus.yml",
        "--storage.tsdb.path=/prometheus",
        "--storage.tsdb.retention.time=7d",
        "--web.enable-lifecycle",
        "--web.console.libraries=/usr/share/prometheus/console_libraries",
        "--web.console.templates=/usr/share/prometheus/consoles"
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.prometheus.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "prometheus"
        }
      }
    }
  ])

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-prometheus" })
}

# ─── ECS Service ──────────────────────────────────────────────────────────────
resource "aws_ecs_service" "prometheus" {
  name            = "${var.name_prefix}-prometheus"
  cluster         = var.cluster_name
  task_definition = aws_ecs_task_definition.prometheus.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_sg_id]
    assign_public_ip = false
  }

  # prometheus.yml 변경 시 S3 오브젝트가 먼저 업로드된 후 서비스 재배포
  depends_on = [aws_s3_object.config]

  tags = merge(var.tags, { Name = "${var.name_prefix}-prometheus" })
}
