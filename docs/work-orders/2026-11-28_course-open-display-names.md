# [Cowork 지시서] "이 코스로 내 일정 만들기" 후 계획 화면 장소 이름이 원문 그대로 (이슈 #451)

- `/api/content/course-open` 이 스팟 이름을 코스 페이지와 같은 표시 이름으로 넣는다: `stripNameTail` + `place_display_names` **저장된** 한글 표기(`formatKoreanDisplay`). 원문은 `originalName`.
- 새 한글 표기 생성(LLM) 금지 — 저장분만 읽는다. 없으면 꼬리 정리만.
- place_id·좌표·체류시간·순서 그대로. 이미 만들어진 사용자 계획은 바꾸지 않는다.
- 테스트: 저장분 있음 → `한글 (원문)`, 없음 → 꼬리 정리만, 한글 이름은 그대로.
- 확인: 타이베이/2박3일 `인성원 (鄰聖苑)` · `聖水洞` 없음 · 도쿄/2박3일 `한국요리 돈키호테 (韓国料理 豚キホーテ)` · /api/health 정상, courseBuild 52 그대로.
- 금지: COURSE_ALGO_VERSION 변경, DB 데이터 변경, 새 Google/LLM 호출, 비밀값·claude.yml 변경.
