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

# WAF for CloudFront은 반드시 us-east-1에 생성해야 하는 AWS 제약사항
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
