import type { RawSnsPost } from "./types";

/**
 * Step 2 — Regex filter.
 *
 * Keep posts that read like a genuine paid-by-the-author review, drop
 * anything carrying a sponsorship disclosure keyword — even if it also
 * contains an "authentic" phrase (agencies routinely stuff both in).
 */
const AUTHENTIC_PATTERNS = [/내\s*돈\s*내\s*산/, /영수증\s*리뷰/];

const AD_PATTERNS = [/협찬/, /소정의\s*원고료/, /디너의\s*여왕/, /제공\s*받아/, /광고\s*문구/];

export function isLikelyAuthenticReview(caption: string): boolean {
  const hasAuthenticSignal = AUTHENTIC_PATTERNS.some((re) => re.test(caption));
  const hasAdSignal = AD_PATTERNS.some((re) => re.test(caption));
  return hasAuthenticSignal && !hasAdSignal;
}

export function filterAuthenticPosts(posts: RawSnsPost[]): RawSnsPost[] {
  return posts.filter((post) => isLikelyAuthenticReview(post.caption));
}
