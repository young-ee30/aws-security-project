resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, { Name = "${var.name_prefix}-db-subnet-group" })
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Allow MySQL from ECS (app) and Bastion (admin only)"
  vpc_id      = var.vpc_id

  # 애플리케이션 접근: ECS 컨테이너 → RDS (VPC 내부 트래픽)
  ingress {
    description     = "MySQL from ECS (application)"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [var.ecs_sg_id]
  }

  # 관리자 접근: Bastion → RDS (SSH 터널 또는 SSM 포트포워딩 경유)
  # Bastion이 배포된 경우에만 활성화 (optional)
  dynamic "ingress" {
    for_each = var.bastion_sg_id == null ? [] : [var.bastion_sg_id]
    content {
      description     = "MySQL from Bastion (admin access only)"
      from_port       = 3306
      to_port         = 3306
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-rds-sg" })
}

resource "aws_db_instance" "this" {
  identifier        = "${var.name_prefix}-mysql"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = var.instance_class
  allocated_storage = 20
  storage_encrypted = true

  db_name  = "ecommerce"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false
  skip_final_snapshot = true
  deletion_protection = false

  tags = merge(var.tags, { Name = "${var.name_prefix}-mysql" })
}
