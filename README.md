<p align="center">
  <img src="controlplane/web/public/icon.svg" alt="aws-devsecops-controlplane-terraform" width="88" />
</p>

<h1 align="center">AWS Security Project</h1>

<p align="center">
  GitHub Actions, AWS 보안 관제, Checkov 정책 자동화를 하나로 묶은 DevSecOps Control Plane
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Node.js-API-339933?logo=node.js&logoColor=white" alt="Node.js API" />
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white" alt="FastAPI Python" />
  <img src="https://img.shields.io/badge/Spring_Boot-3.2-6DB33F?logo=springboot&logoColor=white" alt="Spring Boot 3.2" />
  <img src="https://img.shields.io/badge/Terraform-1.11-844FBA?logo=terraform&logoColor=white" alt="Terraform 1.11" />
  <img src="https://img.shields.io/badge/GitHub_Actions-CI%2FCD-2088FF?logo=githubactions&logoColor=white" alt="GitHub Actions" />
  <img src="https://img.shields.io/badge/AWS-ECS%20%7C%20ECR%20%7C%20RDS-FF9900?logo=amazonaws&logoColor=white" alt="AWS" />
</p>

---

## 프로젝트 개요

`aws-devsecops-controlplane-terraform`는 단순한 샘플 애플리케이션 저장소가 아니라, 애플리케이션 개발, 인프라 provisioning, 배포 자동화, 보안 점검, 운영 관제를 하나의 저장소 안에서 함께 다루는 DevSecOps 통합 실습 프로젝트입니다.

이 저장소에는 다음이 함께 들어 있습니다.

- 전자상거래 예제 서비스를 구현한 3개의 백엔드
- 사용자용 React 프론트엔드
- GitHub Actions와 AWS 상태를 통합해서 보여주는 control plane
- AWS 인프라를 코드로 관리하는 Terraform
- PR 보안 스캔과 ECS 배포를 자동화하는 GitHub Actions
- PDF 기반 Checkov custom policy 생성 및 반영 흐름

루트 README는 `.gitignore`에 걸리는 비밀정보, 빌드 산출물, 로컬 런타임 파일을 제외한 추적 대상 파일만 기준으로 작성했습니다.

---

## 이 프로젝트가 하는 일

### 1. GitHub Actions 운영 대시보드

- GitHub App 상태 확인
- workflow run, jobs, logs, annotations 조회
- rerun, dispatch, PR merge/close 같은 운영 액션
- 실패 로그 요약과 수정 제안 흐름 제공

### 2. 보안 정책 자동화

- PDF 문서를 입력으로 받아 Checkov custom policy YAML 생성
- 생성한 정책을 `security/checkov/custom_policies/*.yaml`로 반영
- 정책 registry 저장 및 상태 관리
- PR 및 Terraform workflow에서 Checkov 정책 재사용

### 3. AWS 보안 관제와 가시화

- CloudWatch Logs / Metrics
- CloudTrail 이벤트
- GuardDuty finding
- ECS 서비스 상태
- RDS / ALB / WAF 지표
- Prometheus 메트릭 프록시

### 4. 다중 백엔드 서비스 실험

같은 도메인 기능을 세 가지 런타임으로 구현합니다.

- `api-node`: Node.js + Express
- `api-python`: FastAPI
- `api-spring`: Spring Boot

Terraform과 배포 workflow는 이 중 하나를 `active_backend`로 선택해서 서비스 경로와 desired count를 조정합니다.

### 5. DevSecOps 배포 자동화

- Terraform state bucket bootstrap
- dev 환경 plan/apply
- 변경된 서비스만 선택 배포
- PR 보안 스캔
- 이미지 빌드, 스캔, ECR push, ECS 배포까지 workflow로 연결

---

## 시스템 구성

```text
Browser
  -> controlplane/web (React + Vite)
  -> services/frontend/ecommerce-app-frontend/frontend (React + Vite)

controlplane/web
  -> controlplane/api (Express + TypeScript)

controlplane/api
  -> GitHub App / GitHub Actions API
  -> AWS APIs (CloudWatch, CloudTrail, GuardDuty, ECS, RDS, ALB)
  -> LLM-backed policy generation flow

Terraform + GitHub Actions
  -> ECS / ECR / ALB / RDS / S3 / DynamoDB / CloudFront / GuardDuty

Application Services
  -> api-node
  -> api-python
  -> api-spring
  -> frontend
  -> controlplane-api
```

---

## 저장소 구조

### `controlplane/`

- `api/`
  Express + TypeScript 기반 운영 API입니다. GitHub 연동, 로그 조회, 정책 생성/반영, AWS 메트릭 수집과 프록시 역할을 담당합니다.
- `web/`
  React + Vite 기반 운영 대시보드입니다. GitHub Actions 로그, 정책, 관제, 침해 분석 화면을 제공합니다.

### `services/`

- `ecommerce-app-node/api-server/`
  Node.js + Express 백엔드입니다. 로컬 SQLite 또는 MySQL 기반으로 동작하고 Prometheus 메트릭도 제공합니다.
- `ecommerce-app-fastapi/api-server-fastapi/`
  FastAPI 백엔드입니다. Python 기반 API와 저장소 추상화가 들어 있습니다.
- `ecommerce-app-spring/api-server-spring/`
  Spring Boot 백엔드입니다. H2 또는 MySQL, AWS SDK 기반 연동을 포함합니다.
- `frontend/ecommerce-app-frontend/frontend/`
  사용자용 쇼핑몰 프론트엔드입니다.

### `terraform/`

- `bootstrap/`
  remote state S3 버킷을 초기화합니다.
- `envs/dev`, `envs/prod`
  환경별 루트 모듈입니다.
- `modules/`
  `network`, `security`, `ecr`, `alb`, `ecs`, `rds`, `storage`, `logging`, `monitoring`, `dynamodb`, `cloudtrail`, `guardduty`, `cloudfront`, `bastion` 모듈로 구성됩니다.

### `.github/`

- `workflows/`
  bootstrap, Terraform, ECS deploy, PR security scan workflow가 들어 있습니다.
- `actions/deploy-ecs-service/`
  단일 서비스 기준 Docker build, 이미지 스캔, ECR push, ECS 배포를 처리하는 composite action입니다.

### 기타

- `security/checkov/custom_policies/`
  Checkov custom policy 저장 위치
- `docs/`
  GitHub App 연동, 정책 생성, controlplane 배포 체크리스트 등 기술 문서
- `scripts/`
  로컬에서 수동 실행하는 보조 스크립트

---

## 기술 스택

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts

### Backend

- Express + TypeScript
- Node.js
- FastAPI
- Spring Boot 3
- Octokit
- AWS SDK

### Infra / DevOps

- Terraform
- GitHub Actions
- AWS ECS / ECR / ALB / RDS / S3 / DynamoDB / CloudWatch / CloudTrail / GuardDuty / CloudFront
- Gitleaks
- Trivy
- Checkov

---

## 빠른 시작

### 1. 환경 파일 준비

루트 `.env`는 사용하지 않고 각 서브프로젝트의 예시 파일을 복사해서 씁니다.

```bash
cp controlplane/api/.env.example controlplane/api/.env
cp controlplane/web/.env.example controlplane/web/.env
cp services/ecommerce-app-node/api-server/.env.example services/ecommerce-app-node/api-server/.env
cp services/ecommerce-app-fastapi/api-server-fastapi/.env.example services/ecommerce-app-fastapi/api-server-fastapi/.env
```

`controlplane/api/.env`에는 최소한 아래 값들이 필요합니다.

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `LLM_API_KEY` 또는 `GEMINI_API_KEY`

### 2. Control Plane 실행

터미널 1:

```bash
cd controlplane/api
npm install
npm run dev
```

터미널 2:

```bash
cd controlplane/web
npm install
npm run dev
```

기본 주소:

- Control Plane API: `http://localhost:4000`
- Control Plane Web: `http://localhost:5173`

### 3. 샘플 애플리케이션 실행

가장 빠른 로컬 확인 경로는 Node.js API + 쇼핑몰 프론트엔드 조합입니다.

백엔드:

```bash
cd services/ecommerce-app-node/api-server
npm install
npm run seed
npm run dev
```

프론트엔드:

```bash
cd services/frontend/ecommerce-app-frontend/frontend
npm install
npm run dev
```

이 프론트엔드는 로컬에서 `/api`, `/uploads`를 기본적으로 `http://localhost:5000`으로 프록시합니다.

---

## 배포 흐름

### 1. Terraform State Bootstrap

- workflow: `.github/workflows/bootstrap-terraform-state.yml`
- Terraform remote state용 S3 버킷을 생성하거나 재사용합니다.

### 2. Terraform Plan / Apply

- workflow: `.github/workflows/terraform-dev-plan-apply.yml`
- `fmt`, `validate`, `Checkov`, `plan`, 조건 충족 시 `apply`를 수행합니다.

### 3. 선택적 ECS 배포

- workflow: `.github/workflows/ex-ecs-deploy.yml`
- 변경 파일과 `active_backend`를 기준으로 필요한 서비스만 배포합니다.

### 4. PR 보안 스캔

- workflow: `.github/workflows/pull-request-security-scans.yml`
- Gitleaks, Trivy, Checkov를 실행합니다.

---

## 문서 바로가기

- [`controlplane/README.md`](controlplane/README.md)
- [`terraform/README.md`](terraform/README.md)
- [`.github/README.md`](.github/README.md)
- [`docs/README.md`](docs/README.md)
- [`docs/git_actions_with_app/start_git_app.md`](docs/git_actions_with_app/start_git_app.md)
- [`docs/git_actions_with_app/git-actions-page-technical-guide.md`](docs/git_actions_with_app/git-actions-page-technical-guide.md)
- [`docs/policy-with-llm/policy-page-technical-guide.md`](docs/policy-with-llm/policy-page-technical-guide.md)
- [`docs/controlplane-api-aws-deploy-checklist.md`](docs/controlplane-api-aws-deploy-checklist.md)

---

<p align="center">
  <sub>GitHub Actions 운영, AWS 보안 가시화, Checkov 정책 자동화를 한 저장소에서 실험하는 DevSecOps 통합 프로젝트</sub>
</p>
