// src/lib/server/courseRoute.ts
//
// 동선 조립 전담 모듈 (역할 분리: LLM=취향, 알고리즘=지리) — Fable 검토·설계.
//
// 슬롯을 시간순 "레이어"로 보고, 각 레이어에서 후보 1개씩 골라
//   Σ(취향점수) − Σ(인접 슬롯 간 이동 페널티)
// 를 전역 최대화하는 경로를 DP(Viterbi)로 찾는다.
// 슬롯 7개 × 후보 3개면 상태 수가 작아 비용은 사실상 0이다.
//
// 기존(v1) pickDeterministic/proximityScore(그리디) 및 LLM 반경 사후검증
// 로직은 이 모듈로 대체되지만, v1은 courseRecommend.ts에 그대로 남아 있다
// — courseRecommendV2.ts가 COURSE_PIPELINE=v2일 때만 이 모듈을 쓴다.

export interface RouteCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 취향/품질 점수. LLM 순위 매핑 또는 결정론적 점수. 0~10 스케일 권장 */
  taste: number;
  /** LLM이 준 추천 이유. 없으면 조립 후 템플릿으로 채움 */
  reason?: string;
}

export interface SlotPool {
  slotKey: string; // THEME_SLOTS의 슬롯 식별자
  candidates: RouteCandidate[]; // 쇼트리스트 (최대 SHORTLIST_SIZE)
}

export const SHORTLIST_SIZE = 3;

/** 기존(v1) proximityScore와 동일 스케일 유지 — km당 감점, 최대 4점 캡. */
const KM_PENALTY = 0.35;
const KM_PENALTY_CAP = 4;
/** 재생성 다양성: 취향점수에 ±JITTER 균등 노이즈 */
const JITTER = 0.5;

// ---------------------------------------------------------------- geometry

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function edgePenalty(a: RouteCandidate, b: RouteCandidate): number {
  return Math.min(haversineKm(a, b) * KM_PENALTY, KM_PENALTY_CAP);
}

// ---------------------------------------------------------------- core DP

/**
 * 반경(radiusKm) 하드 제약 하에서 전역 최적 경로를 찾는다.
 * 제약을 만족하는 경로가 없으면 null (호출부가 반경 확장).
 *
 * @param pools    시간순 슬롯별 쇼트리스트. candidates가 빈 슬롯은 건너뜀
 * @param radiusKm 인접 스팟 간 최대 거리. null이면 무제한
 * @param jitter   true면 취향점수에 노이즈를 섞어 재생성마다 결과가 달라짐
 */
export function assembleRoute(pools: SlotPool[], radiusKm: number | null, jitter = true): Map<string, RouteCandidate> | null {
  const layers = pools.filter((p) => p.candidates.length > 0);
  if (layers.length === 0) return new Map();

  const noise = () => (jitter ? (Math.random() * 2 - 1) * JITTER : 0);

  // score[i][j] = 슬롯 i에서 후보 j를 골랐을 때까지의 최대 누적 점수
  // back[i][j]  = 그 경로에서 슬롯 i-1의 후보 인덱스
  const score: number[][] = [];
  const back: number[][] = [];

  score[0] = layers[0].candidates.map((c) => c.taste + noise());
  back[0] = layers[0].candidates.map(() => -1);

  for (let i = 1; i < layers.length; i++) {
    score[i] = [];
    back[i] = [];
    for (let j = 0; j < layers[i].candidates.length; j++) {
      const cur = layers[i].candidates[j];
      let best = -Infinity;
      let bestPrev = -1;
      for (let k = 0; k < layers[i - 1].candidates.length; k++) {
        if (score[i - 1][k] === -Infinity) continue;
        const prev = layers[i - 1].candidates[k];
        if (radiusKm !== null && haversineKm(prev, cur) > radiusKm) continue;
        const s = score[i - 1][k] - edgePenalty(prev, cur);
        if (s > best) {
          best = s;
          bestPrev = k;
        }
      }
      score[i][j] = best === -Infinity ? -Infinity : best + cur.taste + noise();
      back[i][j] = bestPrev;
    }
    // 이 레이어의 모든 후보가 도달 불가 → 반경 내 경로 없음
    if (score[i].every((s) => s === -Infinity)) return null;
  }

  // 역추적
  const last = layers.length - 1;
  let j = score[last].indexOf(Math.max(...score[last]));
  const picked = new Map<string, RouteCandidate>();
  for (let i = last; i >= 0; i--) {
    picked.set(layers[i].slotKey, layers[i].candidates[j]);
    j = back[i][j];
  }
  return picked;
}

/**
 * 반경 단계 확장 폴백.
 * 요청 반경에서 실패하면 다음 단계로 넓혀가며 재시도한다.
 * (v1의 "반경 내 0개면 무제한 폴백"보다 안전 — 15분 요청이 갑자기
 *  도시 반대편으로 튀지 않는다)
 *
 * ⚠️ radiusStepsKm은 반드시 courseRecommend.ts의 radiusKmFor() 환산값을
 * 그대로 써야 한다 — 임의 스텝을 넣으면 UI 라벨("15분")과 실제 반경이
 * 어긋나는 회귀가 생긴다. courseRecommendV2.ts가 이를 보장한다.
 *
 * @returns 실제 사용된 반경 인덱스와 결과. usedStep > 요청 인덱스면
 *          UI에 "이동 반경을 넓혀 찾았어요" 안내 가능
 */
export function assembleRouteWithEscalation(
  pools: SlotPool[],
  radiusStepsKm: (number | null)[],
  startStep = 0,
  jitter = true,
): { picked: Map<string, RouteCandidate>; usedStep: number } | null {
  for (let s = startStep; s < radiusStepsKm.length; s++) {
    const picked = assembleRoute(pools, radiusStepsKm[s], jitter);
    if (picked) return { picked, usedStep: s };
  }
  return null;
}

// ---------------------------------------------------------------- reroll

/**
 * 개별 슬롯 리롤. 이웃(직전/직후 확정 스팟)과의 거리를 반영해
 * 해당 슬롯 쇼트리스트에서 다음 최적 후보를 고른다.
 * 풀이 고갈됐으면 null → 호출부가 courseTaste.ts의 expandShortlist()로
 * 예비 후보를 보충한 뒤 재시도.
 */
export function rerollSlot(
  pool: SlotPool,
  opts: {
    prev?: RouteCandidate;
    next?: RouteCandidate;
    excludeIds: Set<string>; // 현재 선택 + 이미 리롤로 보여준 것들
    radiusKm: number | null;
  },
): RouteCandidate | null {
  const feasible = pool.candidates.filter((c) => {
    if (opts.excludeIds.has(c.id)) return false;
    if (opts.radiusKm !== null) {
      if (opts.prev && haversineKm(opts.prev, c) > opts.radiusKm) return false;
      if (opts.next && haversineKm(c, opts.next) > opts.radiusKm) return false;
    }
    return true;
  });
  if (feasible.length === 0) return null;

  let best: RouteCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of feasible) {
    let s = c.taste;
    if (opts.prev) s -= edgePenalty(opts.prev, c);
    if (opts.next) s -= edgePenalty(c, opts.next);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------- post-DP duplicate resolution

/**
 * Last-line-of-defense safety net, run AFTER the DP produces its final
 * picks. dedupePoolsByBrand narrows candidates before the DP runs, but its
 * own "never fully empty a slot" fallback can hand two different slots a
 * RouteCandidate for the *same place* (real case found in live testing:
 * lunch/dinner both search "맛집" with near-identical raw results, so when
 * dinner's pick already claimed lunch's only candidate during dedup, lunch
 * fell back to restoring that exact same candidate) — the DP itself has no
 * cross-slot "already used" constraint (adding one would blow up its state
 * space for little benefit), so nothing upstream catches this. Left
 * unfixed, the user sees "eat lunch at X, then eat dinner at X again."
 *
 * Walks `order` (slot sequence) and, for each pick that collides (by
 * sameShop) with an earlier slot's already-confirmed pick, swaps in the
 * next distinct candidate from that slot's own shortlist; if the shortlist
 * is exhausted too, `rawPoolFor` supplies a same-slot fallback (typically
 * its full, taste-sorted raw search pool) to draw from instead. A slot with
 * truly no distinct option left is dropped from the course — better than
 * showing a duplicate, and no worse than v1's existing "nothing fit this
 * slot" outcome.
 */
export function resolveDuplicatePicks(
  order: string[],
  picked: Map<string, RouteCandidate>,
  pools: SlotPool[],
  rawPoolFor: (slotKey: string) => RouteCandidate[],
  sameShop: (a: string, b: string) => boolean,
): Map<string, RouteCandidate> {
  const resolved = new Map(picked);
  const usedNames: string[] = [];

  for (const slotKey of order) {
    let cand = resolved.get(slotKey);
    if (cand && usedNames.some((n) => sameShop(n, cand!.name))) {
      const shortlist = pools.find((p) => p.slotKey === slotKey)?.candidates ?? [];
      const altFromShortlist = shortlist.find((c) => !usedNames.some((n) => sameShop(n, c.name)));
      const altFromRaw = altFromShortlist ? undefined : rawPoolFor(slotKey).find((c) => !usedNames.some((n) => sameShop(n, c.name)));
      cand = altFromShortlist ?? altFromRaw;
      if (cand) resolved.set(slotKey, cand);
      else resolved.delete(slotKey);
    }
    if (cand) usedNames.push(cand.name);
  }

  return resolved;
}

// ---------------------------------------------------------------- dedupe

/**
 * DP 전 브랜드 중복 사전 제거.
 * 같은 브랜드가 여러 슬롯 풀에 있으면 taste가 가장 높은 슬롯에만 남긴다.
 * (DP는 직전 상태만 기억하므로 비인접 슬롯 간 중복을 못 막는다 — 사전
 *  제거가 가장 단순하고 확실한 해법)
 *
 * @param sameShop v1 courseRecommend.ts의 sameShop 그대로 주입
 */
export function dedupePoolsByBrand(pools: SlotPool[], sameShop: (a: string, b: string) => boolean): SlotPool[] {
  type Entry = { poolIdx: number; cand: RouteCandidate };
  const kept: Entry[] = [];

  for (let pi = 0; pi < pools.length; pi++) {
    for (const cand of pools[pi].candidates) {
      const dup = kept.find((e) => sameShop(e.cand.name, cand.name));
      if (!dup) {
        kept.push({ poolIdx: pi, cand });
      } else if (cand.taste > dup.cand.taste) {
        dup.poolIdx = pi;
        dup.cand = cand;
      }
    }
  }

  const result = pools.map((p, pi) => ({
    slotKey: p.slotKey,
    candidates: kept.filter((e) => e.poolIdx === pi).map((e) => e.cand),
  }));

  // 실측(서울/부산/강릉/오사카)에서 확인된 버그: 두 슬롯의 원본 후보 풀이
  // 거의/완전히 겹치면(예: lunch·dinner가 똑같이 "맛집" 키워드로 검색,
  // am-sight·pm-sight가 둘 다 일반 관광명소 검색) 나중 슬롯의 후보 전부가
  // "중복"으로 판정돼 그 슬롯이 통째로 사라졌다(같은 장소 두 번 추천되는
  // 것보다 슬롯 자체가 없어지는 게 훨씬 나쁜 결과). 원래 후보가 있던
  // 슬롯은 dedupe 이후에도 최소 1개(자기 풀에서 가장 taste 높은 것)는
  // 반드시 남긴다 — 드물게 같은 장소가 두 슬롯에 겹쳐 보일 수는 있지만,
  // 슬롯이 통째로 빠지는 것보다는 훨씬 안전하다.
  for (let pi = 0; pi < pools.length; pi++) {
    if (pools[pi].candidates.length > 0 && result[pi].candidates.length === 0) {
      const best = pools[pi].candidates.reduce((a, b) => (b.taste > a.taste ? b : a));
      result[pi].candidates.push(best);
    }
  }

  return result;
}
