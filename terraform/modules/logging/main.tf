resource "aws_cloudwatch_log_group" "service" {
  for_each = toset(var.services)

  name              = "/ecs/${var.name_prefix}/${each.value}"
  retention_in_days = var.retention_in_days

  tags = merge(var.tags, {
    Name = "/ecs/${var.name_prefix}/${each.value}"
  })
}
