# =============================================================
# modules/rds/main.tf
# 목적: 백엔드 서비스 공용 MySQL RDS 인스턴스 생성
#
# - 하나의 RDS 인스턴스에 서비스별 DB 이름만 다르게 사용
#   (ecommerce_node / ecommerce_python / ecommerce_spring)
# - ECS 보안그룹에서만 3306 접근 허용 (외부 접근 차단)
# - dev 환경: db.t3.micro, 멀티AZ 없음 (비용 절감)
# =============================================================

# RDS를 private 서브넷에 배치하기 위한 서브넷 그룹
resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, { Name = "${var.name_prefix}-db-subnet-group" })
}

# ECS → RDS 3306 포트 허용 전용 보안그룹
resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Allow MySQL access from ECS containers only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "MySQL from ECS"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [var.ecs_sg_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-rds-sg" })
}

# MySQL RDS 인스턴스
resource "aws_db_instance" "this" {
  identifier        = "${var.name_prefix}-mysql"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = var.instance_class
  allocated_storage = 20
  storage_encrypted = true

  # 초기 DB 이름 (서비스별 DB는 앱 기동 시 자동 생성)
  db_name  = "ecommerce"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # dev 환경 설정 (비용 절감)
  multi_az            = false
  publicly_accessible = false
  skip_final_snapshot = true
  deletion_protection = false

  tags = merge(var.tags, { Name = "${var.name_prefix}-mysql" })
}
