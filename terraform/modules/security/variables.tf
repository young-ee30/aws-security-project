variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "alb_ingress_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
variable "app_port" {
  type    = number
  default = 3000
}
variable "tags" {
  type    = map(string)
  default = {}
}
