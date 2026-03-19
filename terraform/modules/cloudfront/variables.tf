variable "name_prefix" {
  description = "리소스 이름 접두사"
  type        = string
}

variable "alb_dns_name" {
  description = "CloudFront Origin으로 사용할 ALB DNS 이름"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
