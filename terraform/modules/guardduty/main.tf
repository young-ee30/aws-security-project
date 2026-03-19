resource "aws_guardduty_detector" "this" {
  enable = var.enabled

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-guardduty"
  })
}
