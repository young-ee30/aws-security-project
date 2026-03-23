# Policy With LLM

`/policy` 페이지의 현재 구현 기준 설명 문서다.

이 폴더의 핵심 전제는 다음과 같다.

- PDF 내용 추출은 코드가 한다.
- 통제 항목 분리도 코드가 한다.
- Terraform 적용 가능성 분류도 코드가 한다.
- Gemini는 정책 `definition` 생성에만 사용한다.
- Gemini에는 PDF 원문 전체를 넘기지 않고, 서버가 만든 compact JSON만 넘긴다.

## 현재 파이프라인

정책 생성 흐름은 아래 순서로 동작한다.

1. `PolicyPage.tsx`가 PDF를 base64로 변환해 `POST /api/policies/generate`를 호출한다.
2. `controlplane/api/src/policy/generate.ts`의 `generatePolicyFromPdf()`가 PDF를 받는다.
3. `extractPdfText()`가 `pdf-parse`로 텍스트를 추출한다.
4. `extractSourcePolicies()`가 문서를 `CA-07`, `CA-08` 같은 원문 정책 단위로 분리한다.
5. `extractPolicySections()`와 `extractPolicySignals()`가 섹션과 신호를 뽑는다.
6. `classifySourcePolicyLocally()`가 로컬 규칙으로 `convertible / not convertible`을 판정한다.
7. `buildNormalizedControl()`이 Gemini에 넘길 compact JSON을 만든다.
8. `generateWithLlm()`이 Gemini에 compact JSON만 보내 `definition`과 `guideline`을 생성한다.
9. `validateGeneratedDefinitionDraft()`가 응답을 검증한다.
10. 검증을 통과한 결과만 `buildCustomPolicyYaml()`로 YAML로 직렬화한다.

## AI가 보는 입력

Gemini는 PDF 원문을 직접 보지 않는다.

Gemini가 받는 입력은 `buildNormalizedControl()`이 만든 JSON 한 덩어리다. 구조는 대략 아래와 같다.

```json
{
  "control_id": "CA-08",
  "title": "가상 네트워크 리소스 관리",
  "source_severity": "MEDIUM",
  "provider": "aws",
  "target_format": "checkov_yaml",
  "terraform_applicability": "partial",
  "coverage_mode": "partial",
  "control_objective": "내부 서비스 리소스에 공인 IP를 제거한다.",
  "pass_conditions": ["..."],
  "fail_conditions": ["..."],
  "implementation_examples": ["..."],
  "resource_candidates": ["aws_db_instance", "aws_security_group"],
  "check_dimensions": ["public_exposure", "access_control"],
  "enforceable_conditions": ["internal resources must not expose public IPs"],
  "non_enforceable_conditions": ["appropriate authorization assignment"],
  "generation_constraints": {
    "disallow_hardcoded_resource_names": true,
    "must_report_uncovered_conditions": true,
    "must_not_guess_missing_provider_details": true
  }
}
```

즉 Gemini는 다음만 담당한다.

- 로컬 코드가 이미 뽑아 둔 의미를 바탕으로 Checkov `definition` 생성
- 필요한 경우 `guideline` 생성
- `partial`인 경우 커버하지 못한 조건을 JSON으로 반환

## 로컬 코드가 담당하는 것

현재 구조에서 중요한 판단은 AI가 아니라 코드가 한다.

- 문서 텍스트 추출
- 원문 정책 단위 분리
- 섹션 추출
- AWS Terraform 리소스 타입 후보 추론
- 정적 분석 가능한 조건 추론
- 비정형 운영/절차성 요구 탐지
- `terraform_applicability`와 `coverage_mode` 판정

예를 들어 아래 성격의 요구는 로컬 코드가 `partial` 또는 `not convertible` 쪽으로 밀어낸다.

- 적절한 권한 부여
- 관리자 승인
- 주기 점검
- 절차 수립
- 운영 중 상태 확인

반대로 아래 성격은 정적 Terraform 검사 대상으로 본다.

- public IP 노출
- security group ingress
- route / gateway 구성
- encryption
- logging
- backup / retention

## 검증 규칙

Gemini 출력은 그대로 신뢰하지 않는다.

`validateGeneratedDefinitionDraft()`에서 아래를 검사한다.

- `status`가 `ok` 또는 `cannot_generate`인지
- `definition`이 실제 object인지
- `aws_*` `resource_types`가 들어 있는지
- `aws_security_group.main` 같은 하드코딩된 Terraform 로컬 이름이 없는지
- 로컬 코드가 추론한 `resource_candidates` 범위를 벗어나지 않는지

검증 실패 시 그 정책은 생성 결과에 포함하지 않고 `skippedPolicies`로 내려간다.

## 현재 동작에서 중요한 점

- Gemini가 `convertible / not_convertible`을 뒤집지 않는다.
- Gemini는 PDF 전체 문맥을 보지 않는다.
- Gemini 실패 시 현재는 로컬 fallback YAML을 자동 생성하지 않는다.
- 즉 로컬 판정상 변환 가능하더라도 Gemini가 유효한 `definition`을 못 만들면 그 항목은 `skip`된다.

## 왜 이렇게 바꿨는가

이 구조의 목적은 세 가지다.

- 토큰 절감: 원문 PDF 대신 compact JSON만 보내므로 입력이 훨씬 짧다.
- 예측 가능성: 분류 기준이 프롬프트가 아니라 코드에 있다.
- 통제 가능성: 왜 skip 되었는지 로컬 규칙 기준으로 설명할 수 있다.

## 관련 파일

- `controlplane/web/src/pages/PolicyPage.tsx`
- `controlplane/api/src/routes/policy.ts`
- `controlplane/api/src/policy/generate.ts`
- `controlplane/api/src/policy/apply.ts`
- `controlplane/api/src/policy/remove.ts`
- `controlplane/api/src/policy/registry.ts`
- `controlplane/api/src/llm/client.ts`

## GitHub 반영 흐름

정책 preview가 registry에 저장된 뒤 사용자가 정책을 활성화하면:

- `POST /api/policies/apply`
- 기본 브랜치에 YAML 직접 커밋

비활성화하면:

- `POST /api/policies/deactivate`
- GitHub 기본 브랜치에서 YAML 삭제
- 대시보드 registry 항목은 유지

완전 삭제하면:

- 확인 후 registry에서도 제거
- GitHub 기본 브랜치에서도 파일 삭제

## 참고

- 상세 화면/API 설명은 `policy-page-technical-guide.md`
- 실제 정책 생성 로직의 기준 구현은 `controlplane/api/src/policy/generate.ts`
