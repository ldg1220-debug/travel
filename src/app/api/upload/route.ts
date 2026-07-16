import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB per photo

/**
 * Uploads one or more review photos to Vercel Blob and returns their public
 * URLs. Needs either `BLOB_READ_WRITE_TOKEN` (the classic manual token) or
 * `BLOB_STORE_ID` (auto-added when a Blob store is connected via Vercel's
 * newer integration flow — `put()` then authenticates automatically via
 * Vercel's own OIDC token at runtime, no manual token required). Without
 * either, this degrades to a clear "업로드를 사용할 수 없어요" error instead
 * of a bare 500, matching how other optional API keys in this app fail
 * gracefully.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: "사진 업로드가 아직 설정되지 않았어요" }, { status: 503 });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `사진은 최대 ${MAX_FILES}장까지 첨부할 수 있어요` }, { status: 400 });
  }
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 첨부할 수 있어요" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "사진 용량은 8MB 이하로 올려주세요" }, { status: 400 });
    }
  }

  try {
    const uploaded = await Promise.all(
      files.map((file) => put(`reviews/${session.user.id}/${Date.now()}-${file.name}`, file, { access: "public" })),
    );
    return NextResponse.json({ urls: uploaded.map((r) => r.url) });
  } catch (err) {
    console.error("Blob upload failed", err);
    return NextResponse.json({ error: "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요" }, { status: 502 });
  }
}
