terraform {
  backend "s3" {
    # bucket은 여기에 직접 쓰지 않습니다.
    # 로컬: terraform/scripts/setup.sh 실행 시 backend.hcl 자동 생성
    # CI:   GitHub Secret(TF_STATE_BUCKET)으로 backend.hcl 자동 생성
    # terraform init -backend-config=backend.hcl 로 주입됩니다.
    # (backend.hcl은 .gitignore에 추가되어 있습니다)

    key          = "dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
