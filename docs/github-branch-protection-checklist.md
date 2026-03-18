# GitHub Branch Protection Checklist

이 문서는 이 저장소를 "기업형 운영 흐름"으로 바꾸기 위해 GitHub 저장소 설정에서 무엇을 켜야 하는지 정리한 체크리스트입니다.

목표:

- `main` 직접 push 차단
- PR을 통해서만 `main` 반영
- 보안/검사 실패 시 merge 차단
- `main` 반영 후에만 Terraform `apply`와 배포 허용

## 먼저 알아둘 점

코드에서 강제할 수 있는 것과 GitHub 웹 설정에서만 강제할 수 있는 것은 다릅니다.

코드에서 이미/또는 추가로 강제하는 것:

- Checkov 정책 위반 시 workflow 실패
- Terraform fmt 실패 시 workflow 실패
- 배포 단계 Trivy 이미지 스캔 실패 시 배포 중단

GitHub 웹 설정에서만 강제할 수 있는 것:

- `main` 직접 push 차단
- PR merge만 허용
- required status checks 통과 전 merge 차단
- 관리자 포함 우회 금지

## 권장 운영 흐름

1. 작업 브랜치에서 수정
2. 작업 브랜치에 push
3. PR 생성
4. PR에서 보안 스캔과 Terraform 검사 확인
5. 승인 후 PR merge
6. `main` 업데이트
7. `main` 기준 workflow가 `apply`와 배포 수행

즉:

- `PR` = 검토/검사
- `main` = 실제 반영

## GitHub에서 설정할 것

GitHub 저장소에서:

`Settings -> Branches -> Add branch protection rule`

대상 브랜치:

- `main`

### 1. Require a pull request before merging

반드시 켜기.

의미:

- `main`에 직접 push하지 못하고
- PR merge를 통해서만 `main`이 바뀌게 함

권장 옵션:

- `Require approvals`
- 최소 승인 1명 이상
- 가능하면 `Dismiss stale pull request approvals when new commits are pushed`
- 가능하면 `Require conversation resolution before merging`

### 2. Restrict who can push to matching branches

반드시 켜기.

의미:

- 일부 관리자/자동화 계정만 예외적으로 push 가능
- 일반 개발자는 `main` 직접 push 금지

기업형 운영에서는 이 옵션이 사실상 핵심입니다.

### 3. Require status checks to pass before merging

반드시 켜기.

의미:

- GitHub Actions 체크가 성공하기 전에는 merge 불가

### 4. Do not allow bypassing the above settings

가능하면 켜기.

의미:

- 예외 없이 규칙을 지키게 함

### 5. Include administrators

가능하면 켜기.

의미:

- 관리자도 실수로 규칙을 우회하지 못하게 함

## Required checks로 추천하는 항목

PR에서 항상 실행되는 보안 workflow 기준으로 먼저 거는 것을 추천합니다.

우선 추천:

- `Gitleaks Secret Scan`
- `Trivy IaC Scan`
- `Trivy SCA Scan (Node.js)`
- `Checkov IaC Scan`

이 4개는 [pull-request-security-scans.yml](/c:/Users/User/Desktop/aws-security-project/.github/workflows/pull-request-security-scans.yml) 에서 실행됩니다.

## Terraform Plan 체크는 바로 required로 걸어도 되나?

주의가 필요합니다.

현재 [terraform-dev-plan-apply.yml](/c:/Users/User/Desktop/aws-security-project/.github/workflows/terraform-dev-plan-apply.yml) 의 PR 트리거는 아래 경로에만 반응합니다.

- `terraform/**`
- `.github/workflows/**`

즉:

- Terraform 관련 PR에서는 `Terraform Plan & Security Scan` 체크가 뜸
- 문서 전용 PR에서는 이 체크가 아예 안 뜰 수 있음

그래서 branch protection에서 `Terraform Plan & Security Scan`을 required check로 바로 걸면, Terraform과 무관한 PR이 막힐 수 있습니다.

권장 방식은 둘 중 하나입니다.

### 옵션 A. 지금 바로 적용할 현실적 방식

required checks에는 PR 보안 workflow 4개만 먼저 등록

장점:

- 바로 적용 가능
- 문서 PR가 불필요하게 막히지 않음

단점:

- Terraform 변경 PR에서 `plan`이 반드시 required는 아님

### 옵션 B. 더 엄격한 기업형 방식

Terraform PR workflow를 "항상 체크가 보이도록" 구조를 바꾼 뒤,
`Terraform Plan & Security Scan`도 required check로 등록

장점:

- Terraform 변경에 더 엄격함

단점:

- workflow 구조를 추가로 손봐야 함

현재 저장소 상태에서는 먼저 옵션 A로 가고, 이후 옵션 B로 고도화하는 것을 추천합니다.

## 자동으로 main에 반영되게 해야 하나?

권장하지 않습니다.

보안 검사 통과 후에도 자동으로 `main`에 반영되게 하지 말고,
사람이 PR을 확인하고 merge하는 흐름이 더 안전합니다.

특히 Terraform은 실제 AWS 리소스를 바꾸기 때문에,
"검사 통과 = 자동 merge"는 운영 환경에서는 위험할 수 있습니다.

권장:

- 보안/검사 통과
- 사람 승인
- 사람이 merge

비권장:

- 검사 통과 즉시 자동 merge

## 이 저장소에서 이미 코드로 바꾼 부분

다음 항목은 workflow 파일에서 강화했습니다.

- Checkov `soft_fail: false`
- Terraform fmt 실패 시 workflow 실패
- 배포용 Trivy 이미지 스캔 `exit-code: 1`

즉, 이제 정책/취약점이 발견되면 이전보다 훨씬 강하게 pipeline이 멈춥니다.

## 최종 목표 상태

이 체크리스트를 다 적용하면 흐름은 아래처럼 됩니다.

1. 작업 브랜치 수정
2. PR 생성
3. 보안/검사 실패 시 merge 차단
4. 승인된 PR만 merge 가능
5. `main` 반영
6. `main`에서만 Terraform `apply`와 배포 진행

한 줄 요약:

`문제 있는 변경은 PR에서 막고, 검토된 변경만 main에 들어가서 실제 배포되게 만드는 구조`
