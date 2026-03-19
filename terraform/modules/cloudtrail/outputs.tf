output "trail_arn" {
  description = "CloudTrail ARN"
  value       = aws_cloudtrail.this.arn
}

output "s3_bucket_name" {
  description = "CloudTrail 로그 저장 S3 버킷명"
  value       = aws_s3_bucket.cloudtrail.id
}
