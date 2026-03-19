variable "name_prefix" {
  type = string
}

variable "enabled" {
  description = "GuardDuty detector enable/disable"
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
