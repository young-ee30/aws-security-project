variable "name_prefix" {
  description = "리소스 이름 접두사"
  type        = string
}

variable "aws_region" {
  description = "AWS 리전"
  type        = string
}

variable "cluster_name" {
  description = "ECS 클러스터 이름"
  type        = string
}

variable "private_subnet_ids" {
  description = "ECS 서비스가 배치될 프라이빗 서브넷 ID 목록"
  type        = list(string)
}

variable "ecs_sg_id" {
  description = "ECS 서비스 보안 그룹 ID (Prometheus가 같은 SG 사용)"
  type        = string
}

variable "artifact_bucket_name" {
  description = "prometheus.yml 설정 파일을 저장할 S3 버킷 이름"
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
