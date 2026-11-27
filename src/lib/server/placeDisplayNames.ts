import { pool } from "./db";
import { formatKoreanDisplay, needsKoreanName, stripNameTail } from "@/lib/placeDisplayName";
import { isLiveGooglePlaceId } from "./courseBrief";
import type { CourseBriefSpot } from "./courseBrief";

/**
 * 장소 표시 이름 — 작업지시서 2026-11-22 "첫 화면 장소 이름" ①②.
 * 코스 캐시(최종 브리프)는 건드리지 않고(COURSE_ALGO_VERSION 불변) 화면에 내보내기 직전에 이름만 바꾼다.
 *  ② " - " 뒤 설명 꼬리를 자른다(원문은 originalName).
 *  ① 한글이 없는 이름은 place_id 기준 한글 표기를 한 번만 만들어 place_display_names 에 저장·재사용하고 "한글 (원문)" 으로 병기한다.
 * 한글 표기 생성은 LLM_API_KEY 가 있을 때만, 한 번에 한 묶음만 호출한다. 실패하면 저장하지 않고 원문을 그대로 쓴다(다음 요청이 재시도).
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_PER_CALL = 40;
const TIMEOUT_MS = 8000;

interface NameItem {
  placeId: string;
  name: string;
}

async function loadSaved(placeIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (placeIds.length === 0) return out;
  try {
    const r = await pool.query<{ place_id: string; name_ko: string }>(`select place_id, name_ko from place_display_names where place_id = any($1::text[])`, [placeIds]);
    for (const row of r.rows) out.set(row.place_id, row.name_ko);
  } catch (err) {
    console.error("[placeDisplayNames] load failed:", err);
  }
  return out;
}

async function transliterate(items: NameItem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!process.env.LLM_API_KEY || items.length === 0) return out;
  const batch = items.slice(0, MAX_PER_CALL);
  const prompt = `해외 장소 이름을 한국 여행자가 읽는 한글 표기로 바꾸세요. 한국에서 통용되는 이름이 있으면 그걸 쓰고(예: 五四广场 → 5·4광장, Hoang's Restaurant → 호앙스 레스토랑), 없으면 발음대로 적습니다. 설명·번역 덧붙임 없이 이름만, 원문 괄호 병기는 하지 마세요.
반드시 아래 형식의 JSON만 출력하세요: {"names":[{"i":0,"ko":"…"}]}

${batch.map((b, i) => `${i}: ${b.name}`).join("\n")}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "content-type": "application/json", "x-api-key": process.env.LLM_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      console.error(`[placeDisplayNames] anthropic ${res.status}`);
      return out;
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data?.content?.[0]?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) return out;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { names?: { i?: unknown; ko?: unknown }[] };
    for (const n of parsed.names ?? []) {
      if (typeof n.i !== "number" || typeof n.ko !== "string") continue;
      const item = batch[n.i];
      const ko = n.ko.trim();
      // 한글이 실제로 들어 있는 결과만 받는다(모델이 원문을 그대로 돌려주면 저장하지 않는다).
      if (item && ko.length > 0 && ko.length <= 80 && !needsKoreanName(ko)) out.set(item.placeId, ko);
    }
  } catch (err) {
    console.error("[placeDisplayNames] transliterate failed:", err);
  }
  return out;
}

/** place_id → 한글 표기. 저장분은 재사용하고, 없는 것만 한 번에 만들어 저장한다. */
export async function resolveKoreanNames(items: NameItem[]): Promise<Map<string, string>> {
  const unique = new Map<string, NameItem>();
  for (const it of items) if (isLiveGooglePlaceId(it.placeId) && needsKoreanName(it.name)) unique.set(it.placeId, it);
  const saved = await loadSaved([...unique.keys()]);
  const missing = [...unique.values()].filter((it) => !saved.has(it.placeId));
  if (missing.length > 0) {
    const made = await transliterate(missing);
    for (const [placeId, ko] of made) {
      saved.set(placeId, ko);
      await pool.query(`insert into place_display_names (place_id, name_ko) values ($1, $2) on conflict (place_id) do nothing`, [placeId, ko]).catch((err) => console.error("[placeDisplayNames] save failed:", err));
    }
  }
  return saved;
}

/** 이름만 바꾼 스팟 사본 — 바뀌면 원문을 originalName 에 둔다(이미 있으면 유지). 한글 표기(ko)가 없으면 꼬리 정리만. */
export function displaySpot<S extends Pick<CourseBriefSpot, "name" | "originalName">>(spot: S, ko: string | undefined): S {
  const stripped = stripNameTail(spot.name);
  const name = formatKoreanDisplay(ko, stripped);
  if (name === spot.name) return spot;
  return { ...spot, name, originalName: spot.originalName ?? spot.name };
}

/** 코스 브리프의 스팟 이름을 표시용으로 바꾼다(캐시 원본은 그대로). */
export async function applyDisplayNames<T extends { spots: CourseBriefSpot[] }>(brief: T): Promise<T> {
  const items = brief.spots.map((s) => ({ placeId: s.placeId ?? "", name: stripNameTail(s.name) }));
  const ko = await resolveKoreanNames(items);
  return { ...brief, spots: brief.spots.map((s) => displaySpot(s, s.placeId ? ko.get(s.placeId) : undefined)) };
}

/**
 * 생성 없이 읽기만 하는 표시 이름 — 저장된 한글 표기(place_display_names)가 있으면 병기하고, 없으면 꼬리 정리만 한다.
 * LLM·Google 호출과 저장(insert)이 없다(작업지시서 2026-11-28 course-open 표시 이름).
 */
export async function applyDisplayNamesReadOnly<T extends { spots: CourseBriefSpot[] }>(brief: T): Promise<T> {
  const ids = [...new Set(brief.spots.filter((s) => s.placeId && isLiveGooglePlaceId(s.placeId) && needsKoreanName(stripNameTail(s.name))).map((s) => s.placeId as string))];
  const saved = await loadSaved(ids);
  return { ...brief, spots: brief.spots.map((s) => displaySpot(s, s.placeId ? saved.get(s.placeId) : undefined)) };
}
