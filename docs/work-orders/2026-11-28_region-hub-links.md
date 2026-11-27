# [Cowork 지시서] 지역 허브 12개(/course/{지역})가 코스 링크 1개뿐인 얇은 페이지 — 같은 나라·다른 여행지 코스 링크와 대표 명소 설명 보강

- 근거(2026-11-28 실측): 허브 12개 본문이 코스 카드 1개 + "← 전체 코스 모음" 뿐(`/course/` 링크 2개). meta description 12개가 같은 틀(`부산 여행 코스 1개(1박2일): …`)이라 대표 명소가 없음. 코스 페이지는 이미 `pickRelatedCourseLinks()` 로 관련 링크를 가짐.
- 할 것: (1) 허브 카드 아래 "같은 나라·지역의 다른 코스"(국내는 같은 광역)·부족하면 "다른 여행지 코스" 링크 — `pickRelatedCourseLinks()`+`parentOfRegion()` 재사용(대표 일수 기준), confirmed 만. (2) 허브 meta·openGraph description 에 대표 명소(`info.reps`)와 곳 수(reps 없으면 기존 문구). (3) `fetchConfirmedCoursePages()` 결과만 사용 — 새 DB·Google·LLM·Static Maps 호출 없음. (4) 코스 페이지 같은 섹션과 같은 스타일. (5) 테스트: 링크 선택·description.
- 확인(배포 후): `/course/부산`·`/course/도쿄` 링크 200; 12개 허브 description 에 대표 명소·서로 다름; JSON-LD·canonical 그대로; `/api/health` ok · 경고 0 · courseBuild.currentVersion 52 · maps 사용량 증가 없음.
- 하지 말 것: COURSE_ALGO_VERSION·DB 데이터 변경, 호텔 추천·새 제휴 링크, 새 지역·색인 코스, 큰 디자인 변경, 비밀값·claude.yml, robots·사이트맵 변경.
