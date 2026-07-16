import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

/**
 * Serves a private Vercel Blob (an uploaded review/trip-post photo) through
 * our own server. This project's Blob store is configured for private
 * access, so the raw `*.blob.vercel-storage.com` URL 401s for a browser —
 * every reader has to go through a route that fetches it server-side
 * (where our Vercel credentials are available) instead. `/api/upload`
 * returns URLs pointing here rather than the raw Blob URL.
 *
 * No auth gate of its own — a pathname is an unguessable, per-upload
 * timestamped string, the same "long opaque URL" security model the old
 * public Blob URLs had, and these photos back reviews/trip posts that are
 * meant to be viewable by anyone with the link once published.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathname = path.join("/");

  const result = await get(pathname, { access: "private" });
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "content-type": result.blob.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
