# [Cowork 지시서] 색인 코스 장소 이름 — 한글 이름 뒤 한자·일본어 꼬리 4건(하노이·타이베이·도쿄), 하노이는 검색 설명(meta)에도 노출 · 표시 이름에서 떼기

- 근거(2026-11-28 실측): 하노이/3박4일 `탕롱황성(昇龍皇城)`(화면 4곳 + meta description), 타이베이/2박3일 `인성원 (鄰聖苑)`·`성수동석갈비 聖水洞韓式豬排 seongsudong stone grilled pork`, 도쿄/2박3일 `한국요리 돈키호테 (韓国料理 豚キホーテ)`.
- 할 것: `placeDisplayName.ts` 에 한글 이름 뒤 한자·가나 꼬리 정리(괄호 꼬리 · 공백 뒤 꼬리, 결과 2글자 미만이면 원래 이름, 한글 없는 이름·괄호 안 한글은 그대로)를 추가해 `stripNameTail` 경로(coursePages·coursePageIndex·course page)에 연결. 테스트 추가. `requiredLandmarkNames` 매칭 확인.
- 확인(배포 후): 하노이/3박4일 `昇龍` 0 · meta 가 `탕롱황성.` 로 끝남, 타이베이 `鄰聖苑`·`聖水洞` 0, 도쿄 `豚キホーテ` 0, 12개 색인 코스 200, `/api/health` ok · courseBuild.currentVersion 52.
- 하지 말 것: COURSE_ALGO_VERSION 올리기, 저장 데이터 변경, 새 Google 호출, 특정 호텔 추천, 비밀값·환경변수·claude.yml 변경.
