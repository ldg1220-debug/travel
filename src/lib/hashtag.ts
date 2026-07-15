/** A hashtag-friendly slug for a place name — spaces stripped so "#쿠로몬 시장" (which a raw "#" would otherwise cut off at the space) becomes one contiguous token "#쿠로몬시장". */
export function hashtagSlug(name: string): string {
  return name.replace(/\s+/g, "");
}
