# Scripts

`scripts/` 폴더의 보조 실행 스크립트 정리 문서입니다.

## Files

- `setup.sh`: 초기 Terraform/bootstrap 및 기본 인프라 준비용 스크립트
- `deploy.sh`: 배포 보조 스크립트
- `destroy.sh`: dev 환경 AWS 리소스 정리 스크립트
- `ecr-push-test.sh`: ECR 이미지 푸시 테스트 스크립트

## `destroy.sh`

현재 GitHub Actions가 `terraform/envs/dev` 기준으로 Terraform을 적용하고, 이후 ECS 배포 workflow가 사용하는 dev 환경 리소스를 정리합니다.

### 기본 실행

```bash
./scripts/destroy.sh
```

기본 실행 시 삭제 대상:

- VPC, public/private subnet, route table, Internet Gateway, NAT Gateway, NAT EIP
- ALB와 target group들
- ECS cluster `devsecops-dev-cluster`
- ECS service
  - `devsecops-dev-api-node`
  - `devsecops-dev-api-python`
  - `devsecops-dev-api-spring`
  - `devsecops-dev-frontend`
- ECS task definition family들의 revision 전부 deregister
- ECR repository와 이미지
  - `devsecops-dev/api-node`
  - `devsecops-dev/api-python`
  - `devsecops-dev/api-spring`
  - `devsecops-dev/frontend`
- CloudWatch log group
  - `/ecs/devsecops-dev/api-node`
  - `/ecs/devsecops-dev/api-python`
  - `/ecs/devsecops-dev/api-spring`
  - `/ecs/devsecops-dev/frontend`
- CloudWatch alarm
  - `devsecops-dev-api-node-high-cpu`
  - `devsecops-dev-api-python-high-cpu`
  - `devsecops-dev-api-spring-high-cpu`
  - `devsecops-dev-frontend-high-cpu`
- SNS topic `devsecops-dev-alerts`
- RDS instance `devsecops-dev-mysql`
- DB subnet group `devsecops-dev-db-subnet-group`
- EFS file system `devsecops-dev-efs`와 mount target들
- DynamoDB table `devsecops-dev-reviews`
- S3 bucket
  - `devsecops-dev-artifacts`
  - `devsecops-dev-reviews`
- IAM role/policy
  - `devsecops-dev-ecs-task-execution-role`
  - `devsecops-dev-ecs-task-role`
  - `devsecops-dev-ecs-task-reviews-policy`
- Security group
  - `devsecops-dev-rds-sg`
  - `devsecops-dev-bastion-sg`
  - `devsecops-dev-ecs-sg`
  - `devsecops-dev-alb-sg`
- Bastion EC2 `devsecops-dev-bastion`이 있으면 종료

### 기본 실행에서 남겨두는 것

- Terraform bootstrap state bucket
  - 예: `devsecops-tfstate-<account_id>-ap-northeast-2`

이 bucket은 GitHub Actions의 bootstrap workflow가 재사용하는 remote state bucket이므로 기본 실행에서는 보존합니다.

### state bucket까지 포함해서 전부 삭제

```bash
./scripts/destroy.sh --delete-state-bucket
```

이 옵션까지 주면 마지막 단계에서 bootstrap용 Terraform state S3 bucket도 비우고 삭제합니다.

### 동작 방식

- 먼저 Terraform state bucket을 찾아 `terraform destroy`를 시도합니다.
- 중간에 Terraform destroy가 실패해도 best-effort cleanup을 계속 진행합니다.
- GitHub Actions가 추가로 만든 ECS task definition revision, ECR 이미지, log group 같은 리소스도 함께 정리합니다.
