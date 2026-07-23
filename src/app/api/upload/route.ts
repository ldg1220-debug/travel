import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { sniffImageType } from "@/lib/server/imageSniff";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withApiErrorHandling } from "@/lib/server/apiHandler";

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB per photo

/**
 * Uploads one or more review photos to Vercel Blob and returns URLs for
 * them. Needs either `BLOB_READ_WRITE_TOKEN` (the classic manual token) or
 * `BLOB_STORE_ID` (auto-added when a Blob store is connected via Vercel's
 * newer integration flow — `put()` then authenticates automatically via
 * Vercel's own OIDC token at runtime, no manual token required). Without
 * either, this degrades to a clear "업로드를 사용할 수 없어요" error instead
 * of a bare 500, matching how other optional API keys in this app fail
 * gracefully.
 *
 * This project's Blob store is configured for **private** access (Vercel's
 * current default for newly-created stores — there was no public/private
 * choice at creation time), so uploads use `access: "private"` and the
 * returned "urls" actually point at our own `/api/blob/[...path]` proxy
 * rather than the raw `*.blob.vercel-storage.com` URL — a private blob's
 * real URL 401s for a browser with no Vercel auth header, so every reader
 * (including anonymous visitors of a public review/trip post) has to go
 * through a route that fetches it server-side instead.
 */
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: "사진 업로드가 아직 설정되지 않았어요" }, { status: 503 });
  }
  if (!(await checkRateLimit(`upload:${session.user.id}`, 20, 600))) {
    return NextResponse.json({ error: "사진을 너무 많이 올렸어요. 잠시 후 다시 시도해주세요" }, { status: 429 });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `사진은 최대 ${MAX_FILES}장까지 첨부할 수 있어요` }, { status: 400 });
  }
  // Sniffs each file's actual magic bytes rather than trusting the
  // client-supplied `file.type` (or filename extension) — either can be
  // spoofed to smuggle e.g. an `image/svg+xml` payload past a naive
  // "starts with image/" check, and Blob would otherwise serve it back
  // same-origin with that same (attacker-chosen) content-type, which is a
  // stored-XSS vector for a format that can carry a <script>.
  const sniffed: { file: File; buffer: ArrayBuffer; contentType: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "사진 용량은 8MB 이하로 올려주세요" }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    const contentType = sniffImageType(new Uint8Array(buffer));
    if (!contentType) {
      return NextResponse.json({ error: "이미지 파일만 첨부할 수 있어요 (JPEG/PNG/WebP/GIF)" }, { status: 400 });
    }
    sniffed.push({ file, buffer, contentType });
  }

  try {
    const urls = await Promise.all(
      sniffed.map(async ({ file, buffer, contentType }) => {
        const pathname = `reviews/${session.user.id}/${Date.now()}-${file.name}`;
        await put(pathname, buffer, { access: "private", contentType });
        return `/api/blob/${pathname.split("/").map(encodeURIComponent).join("/")}`;
      }),
    );
    return NextResponse.json({ urls });
  } catch (err) {
    console.error("Blob upload failed", err);
    return NextResponse.json({ error: "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요" }, { status: 502 });
  }
});
