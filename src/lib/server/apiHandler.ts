import { NextResponse } from "next/server";

/**
 * Next.js signals internal control flow (bailing a route from static to
 * dynamic rendering because it read `searchParams`, `redirect()`,
 * `notFound()`, etc.) by throwing an error tagged with a `digest`. Those
 * must propagate untouched — swallowing one here would turn a normal
 * static/dynamic bailout during build or ISR into a bogus JSON 500.
 */
function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest === "DYNAMIC_SERVER_USAGE" || digest.startsWith("NEXT_"));
}

/**
 * Wraps a route handler so an unexpected throw (a DB error, a bad
 * `await request.json()` on malformed input, etc.) returns a plain JSON
 * 500 instead of Next's default HTML error page — most of this app's API
 * routes call `pool.query` directly with no try/catch, so any query
 * failure would otherwise surface as an unstyled framework error page to
 * a client expecting `{ error: string }` JSON.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (isNextControlFlowError(err)) {
        throw err;
      }
      console.error("Unhandled API error:", err);
      return NextResponse.json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요" }, { status: 500 });
    }
  };
}
