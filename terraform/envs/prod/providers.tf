terraform {
  required_version = ">= 1.10.0" # S3 native lockfile 지원 최소 버전

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
