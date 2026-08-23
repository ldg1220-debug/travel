/**
 * 대가성(제휴 수수료) 고지 — 공정위 추천·보증 심사지침 대상, 표시 누락은
 * 과태료 사유(작업지시서 2026-08-23 "Drive 설정 확정 후 제휴 링크·고지
 * 정리" 4장). 숙소 예약 버튼을 렌더하는 세 곳(DiscoverClient·
 * PlannerBoard·CourseClient)이 전부 bookingProviders()를 호출하고 전부
 * 같은 문구가 필요해 공용 컴포넌트로 뺐다 — CourseClient가 이미 쓰고
 * 있던 문구를 그대로 표준으로 삼는다(새 문구를 만들지 않음).
 *
 * 호출부가 `hasAffiliateLink(providers)`로 감싸서, 실제 커미션이 붙는
 * 링크가 하나도 없을 때(전부 미승인이거나 네이버 대체 링크만 남았을
 * 때)는 렌더하지 않는다 — 수수료가 없는데 있다고 표시하는 것도
 * 부정확하다는 작업지시서 지적 그대로.
 */
export function AffiliateDisclosureNote({ className = "text-[11px] text-slate-400" }: { className?: string }) {
  return <p className={className}>일부 링크는 제휴 링크로, 예약 시 트레쥴에 수수료가 지급될 수 있어요.</p>;
}
