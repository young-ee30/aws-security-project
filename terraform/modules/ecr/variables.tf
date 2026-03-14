variable "repositories" {
  type = list(string)
}

variable "name_prefix" {
  type = string
}

variable "force_delete" {
  description = "true: 이미지 있어도 destroy 가능 (dev) / false: 이미지 있으면 destroy 차단 (prod)"
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
