@AGENTS.md
@docs/cowork-rules.md

## 지시서 규칙 (GitHub 이슈 자동 작업)

- Cowork 가 올리는 이슈 본문이 작업 지시서다. 지시서 §0 을 따른다:
  `docs/work-orders/{날짜}_{이름}.md` 로 저장 · 완료분은 오래된 것부터 지워 10개 유지 · 본 작업과 같은 PR.
- tsc · eslint · vitest · next build 통과 확인 후 PR 을 연다.
- PR 본문은 작업 보고 형식(`docs/cowork-rules.md` 규칙 4): 처리 표 · 지시서와 다르게 한 것 ★ · 검증한 것/못한 것 · Cowork가 확인할 것. 이슈에도 같은 보고를 댓글로 남긴다.
- CI 통과 후 병합은 기존 방식대로. 자동 병합이 안 되면 PR 링크만 이슈에 남긴다(규칙 5).
- 비밀값·환경변수·결제 설정은 건드리지 않는다. 필요하면 이슈에 "동근님 할 일" 로 남긴다.
- `.github/workflows/claude.yml` 은 Cowork 가 커밋한 파일이므로 건드리지 않는다.
