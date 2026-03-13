output "alb_dns_name" { value = aws_lb.this.dns_name }
output "alb_arn" { value = aws_lb.this.arn }
output "target_group_arns" {
  value = {
    for name, tg in aws_lb_target_group.service : name => tg.arn
  }
}
