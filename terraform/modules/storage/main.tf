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

resource "aws_efs_file_system" "shared" {
  creation_token = "${var.name_prefix}-efs"
  encrypted      = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-efs" })
}

resource "aws_efs_mount_target" "this" {
  for_each = toset(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.shared.id
  subnet_id       = each.value
  security_groups = [var.ecs_sg_id]
}
