# Docs README

`docs/` 폴더는 주제별로 문서를 나눠 두는 인덱스 공간이다.  
현재는 `git_actions_with_app`, `policy-with-llm` 두 묶음으로 정리되어 있다.

## 이번 작업에서 만든/수정한 Markdown

아래는 이번에 내가 직접 만든 문서 또는 크게 정리한 문서들이다.

- [`../README.md`](../README.md)
  저장소 전체 폴더 트리를 정리한 메인 README다. 루트 기준 구조와 각 폴더/파일 역할을 짧게 설명한다.

- [`git_actions_with_app/start_git_app.md`](./git_actions_with_app/start_git_app.md)
  GitHub App 기반 대시보드를 로컬 MVP에서 AWS 구조로 확장하는 방향을 설명한 가이드다.

- [`git_actions_with_app/git-actions-page-technical-guide.md`](./git_actions_with_app/git-actions-page-technical-guide.md)
  GitHub Actions 로그 페이지의 프론트, 백엔드, AI, PR 생성 흐름을 기술적으로 설명한 문서다.

- [`policy-with-llm/policy-page-technical-guide.md`](./policy-with-llm/policy-page-technical-guide.md)
  정책 페이지의 PDF 업로드, LLM 분석, Checkov YAML 생성, registry 저장, GitHub 반영 흐름을 설명한 문서다.

## 구조

```text
docs/
├─ git_actions_with_app/
│  ├─ git-actions-page-technical-guide.md
│  └─ start_git_app.md
├─ policy-with-llm/
│  └─ policy-page-technical-guide.md
└─ README.md
```

## 폴더별 안내

### `git_actions_with_app/`

GitHub App 기반으로 GitHub Actions 실행 상태를 대시보드에서 보고, 실패 로그를 분석하고, AI 수정 제안과 PR 생성까지 이어지는 흐름을 설명하는 문서 모음이다.

- [`git_actions_with_app/start_git_app.md`](./git_actions_with_app/start_git_app.md)
  로컬 MVP에서 시작해서 AWS 배포 구조로 확장하는 방향을 설명한 문서다. 어떤 범위까지 구현할지, `controlplane/web`와 `controlplane/api`를 어떻게 나눌지, GitHub App과 polling 기반 MVP를 어떻게 잡을지 정리되어 있다.

- [`git_actions_with_app/git-actions-page-technical-guide.md`](./git_actions_with_app/git-actions-page-technical-guide.md)
  `/git-actions` 페이지 구현 상세 문서다. 프론트 화면 구조, 백엔드 API, GitHub App 인증, 로그 수집, AI 분석, 수정 제안, PR 생성 흐름까지 포함한다.

### `policy-with-llm/`

PDF 보안 가이드를 LLM으로 분석해서 Checkov custom policy로 만드는 정책 페이지 관련 문서 모음이다.

- [`policy-with-llm/policy-page-technical-guide.md`](./policy-with-llm/policy-page-technical-guide.md)
  `/policy` 페이지 구현 상세 문서다. PDF 업로드, 텍스트 추출, 정책 항목 분리, Gemini 기반 YAML 생성, registry 저장, GitHub 반영 흐름을 설명한다. 현재 구현은 PR 생성이 아니라 GitHub 기본 브랜치 직접 커밋이라는 점도 정리되어 있다.

## 추천 읽는 순서

1. [`../README.md`](../README.md)
2. [`git_actions_with_app/start_git_app.md`](./git_actions_with_app/start_git_app.md)
3. [`git_actions_with_app/git-actions-page-technical-guide.md`](./git_actions_with_app/git-actions-page-technical-guide.md)
4. [`policy-with-llm/policy-page-technical-guide.md`](./policy-with-llm/policy-page-technical-guide.md)

## 메모

- `git_actions_with_app/`는 GitHub Actions 관제와 GitHub App 연동 축이다.
- `policy-with-llm/`는 PDF -> LLM -> Checkov policy 생성 축이다.
- 이후 문서가 늘어나면 같은 방식으로 기능별 폴더를 추가하고 이 인덱스에 링크를 붙이면 된다.
