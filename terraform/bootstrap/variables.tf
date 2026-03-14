variable "aws_region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "프로젝트 이름 (버킷 이름 prefix)"
  type        = string
  default     = "devsecops"
}
