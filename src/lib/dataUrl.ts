/**
 * Decodes a `data:` URL into a Blob without going through `fetch()` —
 * this project's CSP `connect-src` only allowlists `'self'` and specific
 * map API hosts, not the `data:` scheme, so `fetch(dataUrl)` is silently
 * blocked by the browser in production (works fine in local dev without
 * the CSP header, which is what made this easy to miss). Only base64
 * data URLs are supported (what `canvas.toDataURL()`/html-to-image's
 * `toPng()` produce) — a percent-encoded data URL would need `decodeURIComponent`
 * instead of `atob`.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/^data:(.*?);base64$/);
  if (!mimeMatch || base64 === undefined) throw new Error("data: URL이 아니거나 base64 인코딩이 아니에요");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeMatch[1] || "application/octet-stream" });
}
