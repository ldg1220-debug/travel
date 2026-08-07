/**
 * "AI 추천 동선"의 선택적 LLM 큐레이션 레이어.
 *
 * 추천 route(src/app/api/course/recommend)는 도시명으로 Google/Kakao를
 * 라이브 검색해 슬롯별 후보 풀을 만든다. LLM_API_KEY가 설정돼 있으면 이
 * 모듈이 그 후보들을 Claude에게 넘겨 하루 동선으로서 가장 자연스러운
 * 조합을 고르고(중복·왕복 최소화), 각 장소에 한 줄 추천 이유까지 붙인다.
 * 키가 없거나 호출이 실패하면 null을 돌려주고, route는 기존 결정론적
 * 랭킹(평점×리뷰 − 거리 페널티)으로 그대로 폴백한다 — src/server/pipeline/
 * llmVerifier.ts와 완전히 같은 "키 있으면 진짜 AI, 없으면 휴리스틱" 구조.
 */

/** 한 후보 장소 — LLM에 넘기는 최소 정보. */
export interface CourseCandidate {
  id: string;
  name: string;
  rating?: number;
  reviews?: number;
  category?: string;
}

/** 한 슬롯(시간대)과 그 후보 풀. */
export interface CourseSlotCandidates {
  slotKey: string;
  slotLabel: string;
  candidates: CourseCandidate[];
}

/** LLM이 슬롯별로 고른 결과. */
export interface LlmCoursePick {
  slotKey: string;
  id: string;
  reason: string;
}

// 날짜 스냅샷 없는 "claude-haiku-4-5"는 존재하지 않는 모델 id라 매 호출이
// 즉시 실패했었다(실측으로 확인됨) — 아래 !res.ok가 그 실패를 조용히
// 삼켜서(return null, 로그 없음) 이 기능이 처음부터 한 번도 실제로 LLM을
// 탄 적이 없었을 가능성이 크다.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_REASON_LENGTH = 40;

function buildPrompt(city: string, themeLabel: string, slots: CourseSlotCandidates[]): string {
  const slotBlocks = slots
    .map((slot) => {
      const lines = slot.candidates
        .map((c) => {
          const meta = [c.rating != null ? `평점 ${c.rating.toFixed(1)}` : null, c.reviews != null ? `리뷰 ${c.reviews}` : null, c.category]
            .filter(Boolean)
            .join(", ");
          return `  - id=${c.id} | ${c.name}${meta ? ` (${meta})` : ""}`;
        })
        .join("\n");
      return `[${slot.slotKey}] ${slot.slotLabel}\n${lines}`;
    })
    .join("\n\n");

  return `당신은 한국인 여행 코스 큐레이터입니다. 도시: ${city}. 테마: ${themeLabel}.
아래는 시간대(슬롯)별 후보 장소입니다. 각 슬롯마다 후보 중 하나만 골라, 하루 동안 자연스럽게 이어지는(같은 장소·브랜드 중복 없이, 이동 동선이 왔다갔다 하지 않게) 코스를 완성하세요. 평점과 리뷰 수, 테마 적합도를 고려하세요.
각 선택에 대해 30자 이내의 짧은 한국어 추천 이유를 함께 쓰세요.

반드시 아래 형식의 JSON만 출력하세요(다른 텍스트 없이):
{"picks":[{"slot":"<슬롯 key>","id":"<후보 id>","reason":"<추천 이유>"}]}

슬롯별 후보:
${slotBlocks}`;
}

/** ```json ... ``` 코드펜스나 잡텍스트에 감싸여 와도 첫 번째 JSON 오브젝트만 뽑아낸다. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function curateCourseWithLlm(
  city: string,
  themeLabel: string,
  slots: CourseSlotCandidates[],
): Promise<LlmCoursePick[] | null> {
  if (!process.env.LLM_API_KEY) return null;
  // 후보가 하나도 없는 슬롯만 있으면 LLM을 부를 이유가 없다.
  if (slots.every((s) => s.candidates.length === 0)) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.LLM_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        // 실측(오사카)에서 해외 장소명(영문+현지어 혼용)이 길어 1024로는
        // 응답이 중간에 잘려 JSON 파싱 자체가 실패하는 사례가 확인됨.
        max_tokens: 2048,
        messages: [{ role: "user", content: buildPrompt(city, themeLabel, slots) }],
      }),
    });
    if (!res.ok) {
      // 이전엔 여기서 그냥 return null이라 실패가 로그에 전혀 안 남았다
      // (모델 id 오타를 몇 달째 못 알아챈 원인) — 상태코드+본문을 남긴다.
      console.error(`[courseLlm] anthropic ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data?.content?.[0]?.text ?? "";
    const parsed = extractJson(text) as { picks?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.picks)) {
      console.error(`[courseLlm] unparseable/empty picks in response: ${text.slice(0, 200)}`);
      return null;
    }

    // 각 pick이 실제 존재하는 슬롯 key와 그 슬롯 안의 후보 id를 가리키는지 검증.
    const bySlot = new Map(slots.map((s) => [s.slotKey, new Set(s.candidates.map((c) => c.id))]));
    const picks: LlmCoursePick[] = [];
    for (const raw of parsed.picks as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const { slot, id, reason } = raw as { slot?: unknown; id?: unknown; reason?: unknown };
      if (typeof slot !== "string" || typeof id !== "string") continue;
      if (!bySlot.get(slot)?.has(id)) continue;
      picks.push({
        slotKey: slot,
        id,
        reason: typeof reason === "string" ? reason.trim().slice(0, MAX_REASON_LENGTH) : "",
      });
    }
    return picks.length > 0 ? picks : null;
  } catch (err) {
    console.error("[courseLlm] curateCourseWithLlm threw:", err);
    return null;
  }
}
