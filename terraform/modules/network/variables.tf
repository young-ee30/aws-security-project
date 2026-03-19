variable "name_prefix" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "azs" {
  type = list(string)
}

variable "public_subnet_cidrs" {
  type = list(string)
}

variable "private_subnet_cidrs" {
  type = list(string)
}

variable "flow_log_retention_in_days" {
  description = "VPC Flow Log CloudWatch 보관 주기 (일). 비용 절감을 위해 짧게 유지"
  type        = number
  default     = 14
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "bastion_ingress_cidrs" {
  description = "Bastion SSH 허용 CIDR (Public NACL 인바운드 22번). Bastion 모듈과 동일 값 권장."
  type        = list(string)
  default     = []
}

variable "app_ports" {
  description = "Private NACL에서 VPC 내부(ALB→ECS)로 허용할 컨테이너 TCP 포트 목록"
  type        = list(number)
  default     = [3000]
}
