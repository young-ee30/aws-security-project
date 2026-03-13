variable "name_prefix" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "ecs_sg_id" { type = string }
variable "target_group_arns" { type = map(string) }
variable "ecs_task_execution_role_arn" { type = string }
variable "ecs_task_role_arn" { type = string }
variable "log_group_names" { type = map(string) }
variable "aws_region" { type = string }
variable "services" {
  type = map(object({
    cpu            = number
    memory         = number
    container_port = number
    desired_count  = number
    image          = string
    environment    = map(string)
    command        = optional(list(string), null)
  }))
}
variable "tags" {
  type    = map(string)
  default = {}
}
