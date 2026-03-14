output "s3_bucket_name" {
  value       = aws_s3_bucket.tfstate.bucket
  description = "Terraform state 저장용 S3 버킷 이름"
}

output "next_steps" {
  value = <<-EOT

    ✅ Bootstrap 완료!

    terraform/scripts/setup.sh 가 이 값을 자동으로 읽어서 backend.hcl을 만들어줍니다.
    수동으로 하려면:

      # dev 환경 backend.hcl 생성
      echo 'bucket = "${aws_s3_bucket.tfstate.bucket}"' > ../../envs/dev/backend.hcl

      # terraform init (bucket 자동 주입)
      cd ../../envs/dev
      terraform init -backend-config=backend.hcl
  EOT
}
