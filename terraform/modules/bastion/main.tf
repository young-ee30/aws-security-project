data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["137112412989"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── SSM Session Manager 용 IAM 역할 ─────────────────────────────────────────
# SSH 키 없이도 AWS 콘솔/CLI 에서 세션을 열고 MySQL 포트포워딩 가능
resource "aws_iam_role" "bastion" {
  name = "${var.name_prefix}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })

  tags = merge(var.tags, { Name = "${var.name_prefix}-bastion-role" })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.name_prefix}-bastion-instance-profile"
  role = aws_iam_role.bastion.name
}

# ─── 보안 그룹 ────────────────────────────────────────────────────────────────
# SSH 룰은 allowed_ssh_cidrs 가 지정된 경우에만 생성 (빈 목록이면 SSH 포트 닫힘)
resource "aws_security_group" "bastion" {
  name        = "${var.name_prefix}-bastion-sg"
  description = "Bastion security group"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = length(var.allowed_ssh_cidrs) > 0 ? [1] : []
    content {
      description = "SSH from trusted IPs"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.allowed_ssh_cidrs
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-bastion-sg" })
}

# ─── Elastic IP ───────────────────────────────────────────────────────────────
# 재시작해도 IP 가 변하지 않도록 고정 퍼블릭 IP 할당
resource "aws_eip" "bastion" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name_prefix}-bastion-eip" })
}

resource "aws_eip_association" "bastion" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.bastion.id
}

# ─── EC2 인스턴스 ─────────────────────────────────────────────────────────────
resource "aws_instance" "this" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = true
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.bastion.name

  # MySQL 클라이언트 자동 설치 (RDS 직접 접속 테스트용)
  user_data = base64encode(<<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y mysql
    echo "Bastion host ready. MySQL client installed." >> /var/log/bastion-init.log
  EOF
  )

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-bastion" })
}