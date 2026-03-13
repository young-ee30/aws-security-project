variable "aws_region" { type = string }
variable "name_prefix" { type = string }
variable "vpc_cidr" { type = string }
variable "azs" { type = list(string) }
variable "public_subnet_cidrs" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }
variable "ecr_repositories" { type = list(string) }
variable "services" {
  type = map(object({
    cpu            = number
    memory         = number
    container_port = number
    desired_count  = number
    image          = string
    environment    = map(string)
    command        = optional(list(string))
    priority       = number
    path_patterns  = list(string)
    health_check   = string
  }))
}
variable "tags" {
  type    = map(string)
  default = {}
}
