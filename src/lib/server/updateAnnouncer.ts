/**
 * 배포 시 자동 업데이트 공지의 LLM 요약 레이어.
 *
 * GitHub Actions가 main에 push될 때마다(≈배포 시) 그 push에 포함된 커밋
 * 메시지 목록을 POST /api/cron/announce-update로 넘긴다. 이 모듈은
 * LLM_API_KEY가 설정돼 있으면 그 메시지들(개발자용 문구, 그대로 노출하면
 * 안 됨)을 Claude에게 넘겨 "사용자가 체감할 만한 변경인지"를 판단시키고,
 * 맞다면 짧은 한국어 공지 문구로 다시 쓰게 한다. 내부 리팩터링·테스트·CI
 * 설정 같은 사용자 무관 변경뿐이면 notify:false를 돌려받아 공지를 만들지
 * 않는다. 키가 없거나 호출이 실패하면 null을 돌려주고, 라우트는 공지를
 * 건너뛴다 — src/lib/server/courseLlm.ts와 같은 "키 있으면 AI, 없으면
 * 안전하게 스킵" 구조.
 */

const MODEL = "claude-haiku-4-5";
const MAX_MESSAGE_LENGTH = 200;

export interface UpdateAnnouncementResult {
  notify: boolean;
  message: string;
}

function buildPrompt(commitSubjects: string[]): string {
  const lines = commitSubjects.map((s) => `- ${s}`).join("\n");
  return `당신은 여행 일정 앱 "트레쥴"의 사용자 공지를 작성하는 담당자입니다.
아래는 방금 배포된 변경사항의 커밋 메시지 목록입니다(개발자용 문구라 사용자에게 그대로 보여주면 안 됩니다).

${lines}

이 중 실제로 일반 사용자가 체감할 수 있는 새 기능·개선·버그 수정이 있다면, 그것만 골라
${MAX_MESSAGE_LENGTH}자 이내의 친근한 한국어 공지 문구 하나로 요약하세요(존댓말, 느낌표 남용 금지).
내부 리팩터링·테스트·CI·문서·의존성 업데이트처럼 사용자와 무관한 변경뿐이라면 공지를 만들지 마세요.

반드시 아래 JSON 형식으로만 답하세요(다른 텍스트 없이):
{"notify": true 또는 false, "message": "<notify가 true일 때만 채우고, false면 빈 문자열>"}`;
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

export async function summarizeUpdateForAnnouncement(commitSubjects: string[]): Promise<UpdateAnnouncementResult | null> {
  if (!process.env.LLM_API_KEY) return null;
  if (commitSubjects.length === 0) return null;

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
        max_tokens: 512,
        messages: [{ role: "user", content: buildPrompt(commitSubjects) }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data?.content?.[0]?.text ?? "";
    const parsed = extractJson(text) as { notify?: unknown; message?: unknown } | null;
    if (!parsed || typeof parsed.notify !== "boolean") return null;
    if (!parsed.notify) return { notify: false, message: "" };
    if (typeof parsed.message !== "string" || !parsed.message.trim()) return null;
    return { notify: true, message: parsed.message.trim().slice(0, MAX_MESSAGE_LENGTH) };
  } catch {
    return null;
  }
}
