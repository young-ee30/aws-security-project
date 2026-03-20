# Policy Registry DynamoDB Migration Guide

## 목적

현재 정책 목록은 백엔드 파일 저장소 `controlplane/api/data/policy-registry.json` 에 저장된다.
이 방식은 로컬 개발에는 충분하지만, AWS에 백엔드를 배포한 뒤 여러 사용자가 같은 정책 목록을 보려면 적합하지 않다.

이 문서는 현재 파일 기반 policy registry를 DynamoDB 기반으로 전환하는 방법을 정리한다.

## 현재 구조

정책 목록 저장 책임은 아래 파일들에 나뉘어 있다.

- `controlplane/api/src/policy/registry.ts`
  - 정책 목록 조회
  - 정책 등록
  - 정책 수정
  - 정책 삭제
- `controlplane/api/src/routes/policy.ts`
  - `GET /api/policies/registry`
  - `POST /api/policies/registry`
  - `PATCH /api/policies/registry/:id`
  - `DELETE /api/policies/registry/:id`
- `controlplane/web/src/pages/PolicyPage.tsx`
  - 페이지 진입 시 registry 조회
  - 정책 등록/상태변경/삭제/PR 반영 시 registry API 호출

즉, 프론트는 이미 백엔드 API를 기준으로 움직이고 있고, 실제 저장 구현만 `registry.ts` 에 묶여 있다.
그래서 AWS 전환 시에는 `registry.ts` 를 DynamoDB 버전으로 교체하는 것이 핵심이다.

## 왜 JSON 파일 저장이 AWS 운영에 부적합한가

- 컨테이너 재시작 시 로컬 파일이 유실될 수 있다.
- ECS/App Runner처럼 여러 인스턴스가 뜨면 인스턴스마다 파일이 달라질 수 있다.
- 동시 수정 충돌을 제어하기 어렵다.
- 백업, 감사, 권한 제어가 약하다.

## 권장 목표 구조

- 프론트엔드: 로컬 또는 별도 정적 호스팅
- 백엔드: AWS에 배포된 API 서버
- 정책 목록 저장소: DynamoDB

이 구조가 되면:

- 같은 백엔드를 보는 모든 사용자가 같은 정책 목록을 본다.
- 컨테이너를 재배포해도 정책 목록이 유지된다.
- 추후 권한 제어, 감사, 다중 사용자 기능 확장이 쉬워진다.

## DynamoDB 테이블 설계

권장 테이블명:

- `controlplane-policy-registry`

권장 키 설계:

- Partition Key: `id` (String)

현재 정책 데이터 구조상 단일 정책 조회/수정/삭제는 모두 `id` 기준이라 단순 PK 구조로 충분하다.

필드 예시:

- `id`
- `name`
- `description`
- `source`
- `checks`
- `status`
- `lastUpdated`
- `yaml`
- `policyPath`
- `provider`
- `policyId`
- `category`
- `severity`
- `targetProvider`
- `appliedPullRequest`
- `sourcePolicyId`
- `sourcePolicyTitle`

추가로 고려할 수 있는 보조 인덱스:

- GSI on `status`
  - 활성 정책만 빠르게 조회하고 싶을 때
- GSI on `policyPath`
  - 경로 기준 중복 검사나 조회가 필요할 때

지금 기능만으로는 필수는 아니다.

## 권장 환경 변수

`controlplane/api/src/config/env.ts` 에 아래 변수를 추가하는 방식이 자연스럽다.

- `AWS_REGION`
- `POLICY_REGISTRY_BACKEND`
  - 값 예시: `file` | `dynamodb`
- `POLICY_REGISTRY_TABLE`
  - 값 예시: `controlplane-policy-registry`

개발/운영 예시:

```env
POLICY_REGISTRY_BACKEND=dynamodb
AWS_REGION=ap-northeast-2
POLICY_REGISTRY_TABLE=controlplane-policy-registry
```

로컬 개발용 예시:

```env
POLICY_REGISTRY_BACKEND=file
```

## 구현 방향

가장 깔끔한 방법은 `registry.ts` 안에서 파일 저장과 DynamoDB 저장을 섞는 것이 아니라, 저장소 인터페이스를 분리하는 것이다.

권장 구조:

- `controlplane/api/src/policy/registry/types.ts`
- `controlplane/api/src/policy/registry/file-store.ts`
- `controlplane/api/src/policy/registry/dynamodb-store.ts`
- `controlplane/api/src/policy/registry/index.ts`

예시 역할:

- `types.ts`
  - `RegistryPolicy`
  - `RegistryPullRequest`
  - 저장소 인터페이스 정의
- `file-store.ts`
  - 현재 JSON 파일 저장 구현
- `dynamodb-store.ts`
  - DynamoDB 구현
- `index.ts`
  - 환경 변수에 따라 구현 선택

## 추천 인터페이스 예시

```ts
export interface PolicyRegistryStore {
  listPolicies(): Promise<RegistryPolicy[]>
  createPolicies(input: RegistryPolicy[]): Promise<RegistryPolicy[]>
  updatePolicy(id: string, patch: Partial<RegistryPolicy>): Promise<RegistryPolicy | null>
  deletePolicy(id: string): Promise<boolean>
}
```

현재 `registry.ts` 의 exported function 들은 이 인터페이스로 거의 그대로 옮길 수 있다.

## DynamoDB 구현 시 추천 방식

Node.js AWS SDK v3 사용 권장.

추가 dependency 예시:

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

권장 구현 개요:

1. `DynamoDBClient` 생성
2. `DynamoDBDocumentClient.from(client)` 사용
3. CRUD를 아래처럼 매핑

- 목록 조회: `ScanCommand`
- 생성: `PutCommand`
- 수정: `UpdateCommand`
- 삭제: `DeleteCommand`

정책 수가 매우 커지지 않는 현재 단계에서는 `ScanCommand` 로도 충분하다.
나중에 규모가 커지면 조회 패턴에 맞춰 GSI나 Query 중심으로 바꾸면 된다.

## DynamoDB 저장 예시 스케치

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: env.awsRegion })
const doc = DynamoDBDocumentClient.from(client)

export async function listPolicies() {
  const result = await doc.send(new ScanCommand({
    TableName: env.policyRegistryTable,
  }))

  return Array.isArray(result.Items) ? (result.Items as RegistryPolicy[]) : []
}
```

## 중복 처리 권장 사항

현재 파일 저장 구현은 `id` 가 같으면 무시한다.
이 정책은 DynamoDB에서도 유지하는 편이 안전하다.

추천 방법:

- `PutCommand` 에 `ConditionExpression attribute_not_exists(id)` 추가

이렇게 하면 같은 `id` 로 중복 등록되는 것을 막을 수 있다.

## 수정 처리 권장 사항

`PATCH /api/policies/registry/:id` 는 현재 다음 필드 정도만 갱신한다.

- `status`
- `lastUpdated`
- `appliedPullRequest`

하지만 추후를 생각하면 일반 patch 구조를 유지해도 된다.
단, 아래 필드는 수정 금지로 두는 것이 안전하다.

- `id`
- `policyId`
- `policyPath`

## 마이그레이션 순서

### 1. DynamoDB 테이블 생성

- 테이블명: `controlplane-policy-registry`
- PK: `id` (String)

### 2. 백엔드 환경 변수 추가

- `AWS_REGION`
- `POLICY_REGISTRY_BACKEND=dynamodb`
- `POLICY_REGISTRY_TABLE`

### 3. AWS SDK 추가

`controlplane/api/package.json` 에 AWS SDK v3 패키지 추가

### 4. 저장소 구현 분리

현재 `controlplane/api/src/policy/registry.ts` 를 아래처럼 분리

- file store
- dynamodb store
- store selector

### 5. 기존 JSON 데이터 이관

기존 `controlplane/api/data/policy-registry.json` 파일을 읽어서 DynamoDB에 넣는 일회성 스크립트 작성

권장 순서:

1. JSON 파일 읽기
2. 정책 배열 순회
3. DynamoDB에 `PutCommand` 실행
4. 결과 로깅

### 6. 백엔드 재배포

AWS에 백엔드를 배포하고 registry API가 DynamoDB를 사용하도록 전환

### 7. 프론트 검증

다른 브라우저/다른 사용자에서 같은 정책 목록이 보이는지 확인

## 일회성 마이그레이션 스크립트 예시 흐름

스크립트 파일 예시:

- `controlplane/api/scripts/migrate-policy-registry-to-dynamodb.ts`

해야 할 일:

```ts
1. JSON 파일 읽기
2. parse
3. validate
4. each policy -> PutCommand
5. 성공/실패 로그 출력
```

## 운영 시 체크리스트

- 백엔드 실행 Role에 DynamoDB 권한 부여
- 최소 권한 정책 적용
  - `dynamodb:Scan`
  - `dynamodb:GetItem`
  - `dynamodb:PutItem`
  - `dynamodb:UpdateItem`
  - `dynamodb:DeleteItem`
- 테이블 백업 정책 확인
- CloudWatch 로그 확인
- 여러 사용자 동시 수정 시 마지막 write wins 정책을 받아들일지 검토

## IAM 권한 예시 개념

리소스 범위는 실제 테이블 ARN으로 제한하는 것이 맞다.

허용 작업:

- `dynamodb:Scan`
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`

## 추천 후속 작업

파일 저장에서 DynamoDB로 넘어갈 때 같이 하면 좋은 것:

- `createdAt`, `updatedAt` 필드 분리
- `createdBy` 필드 추가
- soft delete 여부 검토
- 정책 변경 이력 테이블 분리 검토
- 정책 잠금 또는 optimistic locking 필요 여부 검토

## 지금 기준 최단 전환 플랜

가장 빠른 전환은 아래 순서다.

1. `registry.ts` 를 file/dynamodb 이중 구현으로 분리
2. DynamoDB 테이블 생성
3. JSON 파일 데이터를 DynamoDB로 이관
4. AWS에 백엔드 배포
5. `POLICY_REGISTRY_BACKEND=dynamodb` 적용

이렇게 하면 프론트는 거의 손대지 않고 공용 정책 목록으로 넘어갈 수 있다.
