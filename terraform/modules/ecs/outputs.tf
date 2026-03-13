output "cluster_name" { value = aws_ecs_cluster.this.name }
output "service_names" {
  value = [for svc in aws_ecs_service.service : svc.name]
}
