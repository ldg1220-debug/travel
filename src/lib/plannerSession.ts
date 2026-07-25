/**
 * PlannerBoard runs a one-time-per-tab-session correction: if `activeDate`
 * is stuck in the past on its first mount, it jumps to today — meant for
 * "app left open for days, forgotten" recovery, not for "user just
 * deliberately navigated to a past-dated plan" (AppBar's 저장된 계획
 * 미리보기, a trip post's "일정 보기", Home's "진행 중인 계획"). Since
 * that correction only ever fires once per session anyway, every entry
 * point that intentionally sets `activeDate` to a specific (possibly past)
 * date before routing into /planner must call
 * `suppressStaleActiveDateCorrection()` first, so PlannerBoard's own
 * mount-time check doesn't immediately undo the jump. Lives in its own
 * tiny module (rather than being exported from PlannerBoard.tsx itself) so
 * pages that only need to call this don't pull PlannerBoard's whole
 * component tree (dnd-kit, map providers, …) into their bundle.
 */
let staleActiveDateCorrectedThisSession = false;

export function hasStaleActiveDateCorrectionRun(): boolean {
  return staleActiveDateCorrectedThisSession;
}

export function suppressStaleActiveDateCorrection(): void {
  staleActiveDateCorrectedThisSession = true;
}
