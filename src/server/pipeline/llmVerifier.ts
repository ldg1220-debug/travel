import type { RawSnsPost } from "./types";

export interface LlmVerificationResult {
  isGenuine: boolean;
  reason: string;
}

/**
 * Step 3 — LLM verification.
 *
 * The regex pass is cheap but noisy (bots stuff "내돈내산" into ad copy too).
 * A lightweight LLM call is the final judge of whether a caption reads like
 * a real personal review. Point LLM_API_KEY at a small/cheap model (e.g.
 * Claude Haiku) to wire up the real check; without it we fall back to a
 * conservative heuristic so the pipeline still runs end to end locally.
 */
export async function verifyReviewIsAuthentic(post: RawSnsPost): Promise<LlmVerificationResult> {
  if (process.env.LLM_API_KEY) {
    return callConfiguredLlm(post);
  }
  return heuristicVerify(post);
}

function heuristicVerify(post: RawSnsPost): LlmVerificationResult {
  const detailed = post.caption.length >= 20;
  const hasContext = post.hashtags.length > 0 && post.placeNameGuess !== "Unknown Spot";
  const isGenuine = detailed && hasContext;
  return {
    isGenuine,
    reason: isGenuine
      ? "heuristic: detailed, place-specific caption"
      : "heuristic: too short or missing place context",
  };
}

async function callConfiguredLlm(post: RawSnsPost): Promise<LlmVerificationResult> {
  const prompt = `Is this social post a genuine, self-paid review (not an ad)? Reply with just "yes" or "no".\n\n${post.caption}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.LLM_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 5,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return { isGenuine: false, reason: `llm call failed: ${res.status}` };
  const data = await res.json();
  const text = (data?.content?.[0]?.text ?? "").toLowerCase();
  return { isGenuine: text.includes("yes"), reason: `llm: ${text.trim()}` };
}
