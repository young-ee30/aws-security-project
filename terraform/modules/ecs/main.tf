resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-cluster" })
}

resource "aws_ecs_task_definition" "service" {
  for_each = var.services

  family                   = "${var.name_prefix}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = each.value.image
      essential = true
      portMappings = [
        {
          containerPort = each.value.container_port
          hostPort      = each.value.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        for k, v in each.value.environment : {
          name  = k
          value = v
        }
      ]
      command = each.value.command
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_names[each.key]
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = each.key
        }
      }
    }
  ])

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-${each.key}-taskdef" })
}

resource "aws_ecs_service" "service" {
  for_each = var.services

  name            = "${var.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  launch_type     = "FARGATE"
  desired_count   = each.value.desired_count

  network_configuration {
    assign_public_ip = false
    security_groups  = [var.ecs_sg_id]
    subnets          = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = var.target_group_arns[each.key]
    container_name   = each.key
    container_port   = each.value.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # GitHub Actions 배포 워크플로우가 task_definition과 desired_count를 독립적으로 관리.
  # terraform apply가 이 값들을 덮어쓰지 않도록 무시.
  # - task_definition: Deploy Selected Services to ECS 워크플로우가 최신 이미지로 갱신
  # - desired_count:   Scale from zero 로직이 서비스 기동 후 조정
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_ecs_task_definition.service]

  tags = merge(var.tags, { Name = "${var.name_prefix}-${each.key}-svc" })
}
