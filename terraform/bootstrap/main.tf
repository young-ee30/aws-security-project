# =============================================================
# terraform/bootstrap/main.tf
# 목적: Terraform state를 저장할 S3 버킷을 단 한 번만 생성
#
# 실행 순서:
#   1) cd terraform/bootstrap/
#   2) terraform init
#   3) terraform apply
#   4) 출력된 s3_bucket_name 복사
#   5) envs/dev/backend.tf, envs/prod/backend.tf의
#      bucket = "CHANGE_ME_..." 부분에 붙여넣기
#   6) cd ../envs/dev && terraform init
# =============================================================

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # bootstrap은 로컬 state 사용 (S3 버킷이 아직 없기 때문)
  backend "local" {}
}

provider "aws" {
  region = var.aws_region
}

# 버킷 이름 충돌 방지용 랜덤 suffix
resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  bucket_name = "${var.project_name}-tfstate-${random_id.suffix.hex}"
}

# S3 버킷
resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name      = "Terraform State Bucket"
    Project   = var.project_name
    ManagedBy = "terraform-bootstrap"
  }
}

# 버저닝 활성화 (S3 native lockfile 동작에 필수)
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

# 서버사이드 암호화
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 퍼블릭 액세스 완전 차단
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_caller_identity" "current" {}
