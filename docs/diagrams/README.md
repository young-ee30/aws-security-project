# Diagrams-Based Terraform Visualization

이 디렉터리는 `mingrammer/diagrams` 를 사용해서 현재 Terraform 구조를 코드로 시각화하기 위한 파일들을 담고 있다.

## Generated files

스크립트를 실행하면 아래 PNG 파일들이 `generated/` 아래에 생성된다.

- `terraform_end_to_end_overview.png`
- `terraform_module_map.png`
- `terraform_runtime_and_security_flow.png`

## How to run

공식 문서 기준으로 `diagrams` 는 Python 과 Graphviz 가 필요하다.

1. Graphviz 설치

```powershell
winget install Graphviz.Graphviz -i
```

또는

```powershell
choco install graphviz
```

2. Python 환경에서 `diagrams` 설치

```powershell
pip install diagrams
```

3. 다이어그램 생성

```powershell
python docs/diagrams/generate_terraform_architecture_diagrams.py
```

## What the script reflects

- `terraform/bootstrap` 기반 Terraform state bucket 흐름
- `terraform/envs/dev/main.tf` 기준 모듈 조립 구조
- `network`, `security`, `bastion`, `alb`, `ecs`, `storage`, `dynamodb`, `rds`, `monitoring` 관계
- 고객 요청 흐름과 Bastion 기반 운영자 접근 흐름
- 현재 코드 기준 `ALB -> ECS -> RDS / S3 / DynamoDB` 연결

## Notes

- 현재 이 저장소의 Terraform 실제 상태를 설명하는 문서화용 다이어그램이다.
- AWS 리소스를 생성하거나 Terraform 코드를 바꾸지는 않는다.
- 현재 코드 기준으로 Bastion은 optional 구성이라, 다이어그램에서도 optional 로 표기했다.
- 현재 ALB 리스너는 `80`만 쓰지만, ALB SG는 코드상 `443`도 열려 있어 그 상태를 그대로 반영했다.

## Sources

- GitHub README: https://github.com/mingrammer/diagrams
- Installation docs: https://diagrams.mingrammer.com/docs/getting-started/installation
