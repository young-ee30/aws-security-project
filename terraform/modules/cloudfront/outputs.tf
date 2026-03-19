output "cloudfront_domain_name" {
  description = "CloudFront 배포 도메인 (서비스 접속 주소)"
  value       = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront 배포 ID (캐시 무효화 등에 사용)"
  value       = aws_cloudfront_distribution.this.id
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.this.arn
}
