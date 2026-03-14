terraform {
  backend "s3" {
    # bucket은 여기에 직접 쓰지 않습니다.
    # scripts/setup.sh 실행 시 자동으로 backend.hcl 파일이 생성되고
    # terraform init -backend-config=backend.hcl 로 주입됩니다.
    # (backend.hcl은 .gitignore에 추가되어 있습니다)

    key          = "prod/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
