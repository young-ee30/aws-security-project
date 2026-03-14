variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "alb_ingress_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
variable "app_ports" {
  description = "ECS 컨테이너 포트 목록 (ALB → ECS 인바운드 허용)"
  type        = list(number)
  default     = [3000]
}
variable "tags" {
  type    = map(string)
  default = {}
}
