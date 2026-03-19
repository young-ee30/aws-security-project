data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── CloudTrail 전용 S3 버킷 ──────────────────────────────────────────────────
# 기존 버킷과 완전히 분리된 독립 금고 — CloudTrail 로그 전용
resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${var.name_prefix}-cloudtrail-logs"
  force_destroy = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-cloudtrail-logs" })
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── S3 버킷 정책 ─────────────────────────────────────────────────────────────
# CloudTrail 서비스가 이 버킷에 로그를 쓸 수 있도록 출입증 발급
resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  # public access block이 먼저 적용된 후 정책 부착
  depends_on = [aws_s3_bucket_public_access_block.cloudtrail]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${var.name_prefix}-trail"
          }
        }
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "AWS:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${var.name_prefix}-trail"
          }
        }
      }
    ]
  })
}

# ─── CloudTrail 본체 ──────────────────────────────────────────────────────────
# 전 리전(multi_region) API 호출을 빠짐없이 수집
# 누가/언제/어디서/무엇을 — Terraform apply, IAM 변경, S3 삭제 등 모든 기록
resource "aws_cloudtrail" "this" {
  name                          = "${var.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true # IAM, STS 등 글로벌 서비스 포함
  is_multi_region_trail         = true # 모든 리전 커버
  enable_log_file_validation    = true # 로그 위변조 감지

  tags = merge(var.tags, { Name = "${var.name_prefix}-trail" })

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}
