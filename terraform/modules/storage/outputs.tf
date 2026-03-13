output "artifact_bucket_name" { value = aws_s3_bucket.artifacts.bucket }
output "efs_id" { value = aws_efs_file_system.shared.id }
