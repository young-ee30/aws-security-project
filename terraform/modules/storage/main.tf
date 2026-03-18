resource "aws_s3_bucket" "artifacts" {
  bucket = lower(replace("${var.name_prefix}-artifacts", "_", "-"))

  tags = merge(var.tags, { Name = "${var.name_prefix}-artifacts" })
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "reviews" {
  bucket = lower(replace("${var.name_prefix}-reviews", "_", "-"))

  tags = merge(var.tags, { Name = "${var.name_prefix}-reviews" })
}

resource "aws_s3_bucket_public_access_block" "reviews" {
  bucket                  = aws_s3_bucket.reviews.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reviews" {
  bucket = aws_s3_bucket.reviews.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "reviews" {
  bucket = aws_s3_bucket.reviews.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

resource "aws_efs_file_system" "shared" {
  creation_token = "${var.name_prefix}-efs"
  encrypted      = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-efs" })
}

resource "aws_efs_mount_target" "this" {
  # for_each 대신 count 사용
  # for_each는 키값이 plan 시점에 확정돼야 하는데
  # 서브넷 ID는 apply 후에야 생기는 값이라 에러 발생
  # count는 개수(숫자)만 쓰므로 plan 시점에도 문제없음
  count = length(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.shared.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [var.ecs_sg_id]
}
