variable "name_prefix" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "services" {
  type = map(object({
    priority      = number
    path_patterns = list(string)
    health_check  = string
    port          = number
  }))
}
variable "tags" {
  type    = map(string)
  default = {}
}
