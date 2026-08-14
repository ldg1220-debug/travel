import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { logFeatureEvent } from "@/lib/server/featureEvents";
import { FEATURE_EVENT_NAMES, FEATURE_EVENT_SURFACES } from "@/lib/featureEvents";

// 임의 문자열이 그대로 컬럼에 들어가므로(event/surface는 자유 텍스트가
// 아니라 코드에서 정해둔 값이어야 집계가 의미 있다), 클라이언트가 뭘
// 보내든 서버가 이 목록으로 한 번 걸러낸다.
const ALLOWED_EVENTS = new Set<string>(FEATURE_EVENT_NAMES);
const ALLOWED_SURFACES = new Set<string>(FEATURE_EVENT_SURFACES);

const PROPS_MAX_BYTES = 2000;

interface FeatureEventBody {
  event: string;
  sessionId: string;
  surface?: string;
  props?: Record<string, unknown>;
}

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = (await request.json()) as Partial<FeatureEventBody>;
  if (!body.event || !ALLOWED_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }
  if (!body.sessionId || typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "missing sessionId" }, { status: 400 });
  }
  if (body.surface != null && !ALLOWED_SURFACES.has(body.surface)) {
    return NextResponse.json({ error: "invalid surface" }, { status: 400 });
  }
  // props는 자유 형식이라 크기만 제한 — 실수로(혹은 악의적으로) 큰
  // 페이로드를 계속 적재하는 걸 막는다.
  const propsJson = JSON.stringify(body.props ?? {});
  if (propsJson.length > PROPS_MAX_BYTES) {
    return NextResponse.json({ error: "props too large" }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id != null ? Number(session.user.id) : null;

  // lodging-cta와 같은 이유의 최소한의 오남용 방지 — 세션당이라
  // 여러 기기/탭에서 동시 사용하는 정상 사용자를 과하게 막지 않는다.
  if (!(await checkRateLimit(`feature-event:${body.sessionId}`, 60, 3600))) {
    return NextResponse.json({ ok: true });
  }

  await logFeatureEvent({
    userId,
    sessionId: body.sessionId.slice(0, 64),
    event: body.event,
    surface: body.surface ?? null,
    props: body.props ?? {},
  });
  return NextResponse.json({ ok: true });
});
