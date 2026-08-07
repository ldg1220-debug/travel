import { pool } from "@/lib/server/db";

/**
 * `generateMetadata` for a shared-link landing page (trip/[id],
 * community/[id]) — these are the pages people actually forward via
 * KakaoTalk, so the OG title/description/image KakaoTalk's link-unfurl
 * reads determine whether the shared card looks like real content or the
 * site's generic fallback. Runs with no viewer session (crawlers/link
 * bots are always anonymous), so it can ONLY ever surface content for a
 * post whose visibility is literally "public" — anything else (친구공개/
 * 특정인공개/비공개) must fall back to the generic title, never leak the
 * real title/content into an unauthenticated response.
 */

const MAX_DESCRIPTION_LENGTH = 100;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export interface PostMetaRow {
  title: string;
  content: string;
  images: unknown;
  visibility: string;
  authorName: string;
}

export interface PostMeta {
  title: string;
  description: string;
  image: string | null;
}

async function fetchPublicPostMeta(table: "trip_posts" | "community_posts", postId: number): Promise<PostMeta | null> {
  if (!postId) return null;
  const result = await pool.query<PostMetaRow>(
    `select p.title, p.content, p.images, p.visibility, coalesce(u.nickname, '여행자') as "authorName"
     from ${table} p join users u on u.id = p."userId"
     where p.id = $1`,
    [postId],
  );
  const row = result.rows[0];
  if (!row || row.visibility !== "public") return null;

  const images = Array.isArray(row.images) ? (row.images as unknown[]) : [];
  const firstImage = typeof images[0] === "string" ? (images[0] as string) : null;

  return {
    title: row.title,
    description: row.content ? truncate(row.content, MAX_DESCRIPTION_LENGTH) : `${row.authorName}님의 여행 이야기 - 트레쥴`,
    image: firstImage,
  };
}

/** Public 여행 후기(trip_posts) meta, or null when private/friends/custom/missing. */
export function fetchPublicTripPostMeta(postId: number): Promise<PostMeta | null> {
  return fetchPublicPostMeta("trip_posts", postId);
}

/** Public 커뮤니티 글(community_posts) meta, or null when members/custom/private/missing. */
export function fetchPublicCommunityPostMeta(postId: number): Promise<PostMeta | null> {
  return fetchPublicPostMeta("community_posts", postId);
}
