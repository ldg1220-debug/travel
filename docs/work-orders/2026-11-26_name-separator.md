# [Cowork 지시서] 장소 이름 "ㅣ" 이어붙이기

- 대상: `/course/다낭/3박4일` — `다낭 맛집 한식당ㅣ독도(dokdo)`, `국제시장 다낭 맛집ㅣKOREAN BBQㅣNhà hàng Chợ Hàn Quốc`
- 할 것: `src/lib/placeDisplayName.ts` 표시 이름 정리에 `ㅣ`·`|`·`｜` 구분자 처리(일반어 조각 버리고 첫 조각 사용, 2글자 미만이면 원래 이름). 표시 단계에서만 적용, 원본 캐시 불변, `originalName` 유지.
- 테스트: 위 2개 예, 구분자 없는 이름 불변.
- 하지 말 것: `COURSE_ALGO_VERSION` 변경, 장소 선택 변경, 비밀값·workflows 변경, 유료 API 추가.
