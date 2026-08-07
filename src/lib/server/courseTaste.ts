// src/lib/server/courseTaste.ts
//
// v1의 courseLlm.ts와 나란히 존재하는 "취향 큐레이션" 모듈(COURSE_PIPELINE=v2
// 전용). 기존과 다른 핵심: LLM에게 동선/거리/중복 책임을 전부 제거하고,
// 슬롯별로 "그 슬롯 목적에 맞는 상위 3곳 + 이유"만 요구한다.
// 지리·중복·반경은 courseRoute.ts가 처리.

import type { RouteCandidate, SlotPool } from "./courseRoute";
import { SHORTLIST_SIZE } from "./courseRoute";

/** LLM 순위 → taste 점수 매핑 (결정론적 점수와 같은 0~13 스케일대) */
const RANK_TASTE = [10, 8.5, 7];

/** LLM에 넘기는 후보 (좌표는 의도적으로 제외 — 거리 추론 시키지 않음) */
export interface TasteCandidate {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  reviews: number | null;
}

export interface TasteSlotInput {
  slotKey: string;
  /** 슬롯 목적 설명: 키워드 + 시간대. 예: "감성 카페 · 15:30 오후 휴식" */
  slotLabel: string;
  candidates: TasteCandidate[];
}

// ---------------------------------------------------------------- prompt

function buildPrompt(city: string, theme: string, slots: TasteSlotInput[]): string {
  const slotBlocks = slots
    .map((s) => {
      const lines = s.candidates
        .map(
          (c) =>
            `  - id:${c.id} | ${c.name} | ${c.category}` +
            (c.rating != null ? ` | 평점 ${c.rating}` : "") +
            (c.reviews != null ? ` | 리뷰 ${c.reviews}` : ""),
        )
        .join("\n");
      return `[슬롯 ${s.slotKey}] ${s.slotLabel}\n${lines}`;
    })
    .join("\n\n");

  return `당신은 ${city} 여행 큐레이터입니다. 테마는 "${theme}"입니다.

각 슬롯의 후보 중, 그 슬롯의 목적과 시간대에 가장 잘 맞는 곳을 최대 ${SHORTLIST_SIZE}개, 좋은 순서대로 고르세요.

규칙:
- 이동 거리·동선·다른 슬롯과의 위치 관계는 절대 고려하지 마세요. 별도 알고리즘이 처리합니다.
- 오직 "이 슬롯 목적에 얼마나 좋은 곳인가"(취향 적합도, 품질, 관광객 함정 여부)만 판단하세요.
- 평점이 높아도 리뷰가 매우 적으면 신중하게, 리뷰가 많은데 평점이 낮으면 관광객 함정을 의심하세요.
- 각 선택에 25자 이내의 구체적인 추천 이유를 붙이세요. ("맛있어요" 같은 일반론 금지)
- 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트 금지.

{"slots":[{"slot":"슬롯키","picks":[{"id":"후보id","reason":"이유"}]}]}

후보 목록:

${slotBlocks}`;
}

// ---------------------------------------------------------------- call + validate

interface RawPick {
  id?: unknown;
  reason?: unknown;
}
interface RawSlot {
  slot?: unknown;
  picks?: unknown;
}

/**
 * LLM 큐레이션. 슬롯별 쇼트리스트(SlotPool)를 반환.
 * - 존재하지 않는 slot/id는 버림 (할루시네이션 방어, v1과 동일 원칙)
 * - 특정 슬롯의 유효 pick이 0개면 그 슬롯만 결정론적 쇼트리스트로 채움
 * - 호출 실패/키 없음 → null 반환, 호출부가 전체 결정론 폴백
 *
 * @param resolve  id → 좌표 포함 원본 후보 조회 (호출부의 후보 풀에서)
 */
export async function curateTaste(
  city: string,
  theme: string,
  slots: TasteSlotInput[],
  resolve: (slotKey: string, id: string) => RouteCandidate | undefined,
  callLlm: (prompt: string) => Promise<string>,
): Promise<SlotPool[] | null> {
  let raw: string;
  try {
    raw = await callLlm(buildPrompt(city, theme, slots));
  } catch (err) {
    // callLlm(=courseRecommendV2.ts의 callHaiku)이 이미 상세를 로그로
    // 남기지만, 이 함수만 따로 단위테스트되기도 하므로 여기서도 한 번 더
    // 남겨 어느 단계에서 null로 떨어졌는지 항상 알 수 있게 한다.
    console.error("[courseTaste] callLlm failed:", err);
    return null;
  }

  let parsed: { slots?: RawSlot[] };
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    console.error(`[courseTaste] unparseable LLM response: ${raw.slice(0, 200)}`);
    return null;
  }
  if (!Array.isArray(parsed.slots)) {
    console.error(`[courseTaste] response has no "slots" array: ${raw.slice(0, 200)}`);
    return null;
  }

  const bySlot = new Map<string, RawPick[]>();
  for (const s of parsed.slots) {
    if (typeof s.slot === "string" && Array.isArray(s.picks)) {
      bySlot.set(s.slot, s.picks as RawPick[]);
    }
  }

  return slots.map((slot) => {
    const rawPicks = bySlot.get(slot.slotKey) ?? [];
    const seen = new Set<string>();
    const candidates: RouteCandidate[] = [];

    for (const p of rawPicks) {
      if (candidates.length >= SHORTLIST_SIZE) break;
      if (typeof p.id !== "string" || seen.has(p.id)) continue;
      const cand = resolve(slot.slotKey, p.id); // 존재 검증
      if (!cand) continue;
      seen.add(p.id);
      candidates.push({
        ...cand,
        taste: RANK_TASTE[candidates.length],
        reason: typeof p.reason === "string" && p.reason.trim() ? p.reason.trim().slice(0, 40) : undefined,
      });
    }

    // 이 슬롯만 LLM이 실패 → 결정론 폴백으로 채움
    if (candidates.length === 0) {
      return deterministicShortlistForSlot(slot, resolve);
    }
    return { slotKey: slot.slotKey, candidates };
  });
}

// ---------------------------------------------------------------- deterministic fallback

/**
 * 결정론적 취향 점수.
 * 주의: v1 랭커의 거리 페널티 항은 여기 없음(거리는 DP가 처리).
 *
 * rating/reviews가 없는 경우(국내 Kakao Local은 평점 미제공 — v1의
 * score()가 이 경우 무조건 0을 반환해 국내 랭킹이 사실상 거리로만
 * 결정되던 문제의 원인):
 * 검색 결과 순서를 인기 신호로 사용해 순위 기반 점수를 준다.
 * TODO: 자체 신호(유저 저장 수·일정 추가 수)가 쌓이면 여기에 가산.
 */
export function deterministicTaste(c: TasteCandidate, searchRankIndex: number): number {
  if (c.rating != null && c.reviews != null) {
    return c.rating * Math.log10(c.reviews + 10);
  }
  // 카카오 검색 순위 기반: 1위 10점, 이후 완만히 감소
  return Math.max(10 - searchRankIndex * 1.2, 1);
}

export function deterministicShortlistForSlot(
  slot: TasteSlotInput,
  resolve: (slotKey: string, id: string) => RouteCandidate | undefined,
): SlotPool {
  const scored = slot.candidates
    .map((c, i) => ({ c, taste: deterministicTaste(c, i) }))
    .sort((a, b) => b.taste - a.taste)
    .slice(0, SHORTLIST_SIZE);

  return {
    slotKey: slot.slotKey,
    candidates: scored.flatMap(({ c, taste }) => {
      const full = resolve(slot.slotKey, c.id);
      return full ? [{ ...full, taste, reason: templateReason(c) }] : [];
    }),
  };
}

// ---------------------------------------------------------------- reroll pool expansion

/**
 * 리롤 풀 고갈 시 보충 (풀 지연 확장).
 *
 * 병합 규칙: 이미 보여준 id 제외, 기존 풀과 브랜드 중복 제외,
 * 결정론 점수로 정렬해 상위 addCount개 추가. LLM 재호출 없음(리롤은
 * 즉시성이 중요). 보충 후보의 taste는 기존 쇼트리스트보다 살짝 낮게
 * 캡해서(6.5) "리롤할수록 상위 후보→차선 후보" 순서가 유지되게 한다.
 */
export function expandShortlist(
  pool: SlotPool,
  freshCandidates: TasteCandidate[],
  resolve: (slotKey: string, id: string) => RouteCandidate | undefined,
  shownIds: Set<string>,
  sameShop: (a: string, b: string) => boolean,
  addCount = SHORTLIST_SIZE,
): SlotPool {
  const existingNames = pool.candidates.map((c) => c.name);
  const TASTE_CAP = 6.5;

  const additions = freshCandidates
    .map((c, i) => ({ c, taste: Math.min(deterministicTaste(c, i), TASTE_CAP) }))
    .filter(({ c }) => !shownIds.has(c.id) && !pool.candidates.some((p) => p.id === c.id) && !existingNames.some((n) => sameShop(n, c.name)))
    .sort((a, b) => b.taste - a.taste)
    .slice(0, addCount)
    .flatMap(({ c, taste }) => {
      const full = resolve(pool.slotKey, c.id);
      return full ? [{ ...full, taste, reason: templateReason(c) }] : [];
    });

  return {
    slotKey: pool.slotKey,
    candidates: [...pool.candidates, ...additions],
  };
}

/** 폴백 경로에서도 UI 이유 칸이 비지 않게 하는 템플릿 */
export function templateReason(c: TasteCandidate): string {
  if (c.rating != null && c.reviews != null) {
    const rv = c.reviews >= 1000 ? `${(c.reviews / 1000).toFixed(1)}k` : `${c.reviews}`;
    return `평점 ${c.rating} · 리뷰 ${rv}`;
  }
  return "이 지역 인기 검색 결과";
}
