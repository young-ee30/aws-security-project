resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = merge(var.tags, { Name = "${var.name_prefix}-alerts" })
}

resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  for_each = toset(var.service_names)

  alarm_name          = "${each.value}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "High CPU for ECS service ${each.value}"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = each.value
  }

  tags = var.tags
}
