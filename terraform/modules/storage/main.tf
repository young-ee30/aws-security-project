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

resource "aws_s3_bucket_ownership_controls" "reviews" {
  bucket = aws_s3_bucket.reviews.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "reviews" {
  bucket                  = aws_s3_bucket.reviews.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "reviews_public_read" {
  statement {
    sid    = "PublicReadUploads"
    effect = "Allow"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:GetObject"]

    resources = [
      "${aws_s3_bucket.reviews.arn}/uploads/*",
    ]
  }
}

resource "aws_s3_bucket_acl" "reviews" {
  bucket = aws_s3_bucket.reviews.id
  acl    = "public-read"

  depends_on = [
    aws_s3_bucket_ownership_controls.reviews,
    aws_s3_bucket_public_access_block.reviews,
  ]
}

resource "aws_s3_bucket_policy" "reviews_public_read" {
  bucket = aws_s3_bucket.reviews.id
  policy = data.aws_iam_policy_document.reviews_public_read.json

  depends_on = [
    aws_s3_bucket_public_access_block.reviews,
  ]
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
  # Keep static subnet keys and use apply-time subnet IDs only as values.
  for_each = var.private_subnet_keys

  file_system_id  = aws_efs_file_system.shared.id
  subnet_id       = var.private_subnet_ids_by_key[each.key]
  security_groups = [var.ecs_sg_id]
}
