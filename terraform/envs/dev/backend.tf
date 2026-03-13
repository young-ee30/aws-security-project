terraform {
  backend "s3" {
    bucket         = "CHANGE_ME_TERRAFORM_STATE_BUCKET"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "CHANGE_ME_TERRAFORM_LOCKS"
    encrypt        = true
  }
}
