output "service_name" {
  description = "Prometheus ECS 서비스 이름"
  value       = aws_ecs_service.prometheus.name
}

output "log_group_name" {
  description = "Prometheus CloudWatch 로그 그룹"
  value       = aws_cloudwatch_log_group.prometheus.name
}
