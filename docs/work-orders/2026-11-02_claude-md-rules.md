# 작업 지시서 — CLAUDE.md에 "지시서 규칙" 섹션 추가

작성: 2026-11-02 · Cowork · 이슈 #352 (이슈→자동 PR 첫 시험)

## 0. 먼저
1. 이 이슈 본문을 `docs/work-orders/2026-11-02_claude-md-rules.md` 로 저장
2. 완료된 지시서 중 오래된 것부터 지워 10개 유지
3. 본 작업과 같은 PR

## 1. 할 것
CLAUDE.md 에 "지시서 규칙(GitHub 이슈 자동 작업)" 섹션을 추가:
- Cowork 가 올리는 이슈 본문이 작업 지시서다. §0(docs/work-orders 저장 · 완료분 10개 유지 · 같은 PR) 를 따른다
- tsc · eslint · vitest · next build 통과 확인 후 PR
- PR 본문 = 작업 보고 형식: 처리 표 · 지시서와 다르게 한 것 ★ · 검증한 것/못한 것 · Cowork가 확인할 것 — 이슈에도 같은 보고를 댓글로
- CI 통과 후 병합은 기존 방식대로(자동 병합이 안 되면 PR 링크만 이슈에)
- 비밀값·환경변수·결제 설정은 건드리지 않는다 — 필요하면 이슈에 "동근님 할 일" 로
- .github/workflows/claude.yml 은 이미 커밋됨(Cowork) — 건드리지 말 것

## 2. Cowork 이 확인할 것
- 이 이슈에서 Action 실행 → PR 생성 → CI 실행 → 보고 형식
