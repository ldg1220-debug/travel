import { pool } from "@/lib/server/db";
import { summarizeDays, type PublicTripPostArticle } from "@/lib/tripPostSeo";
import type { CourseSnapshot } from "@/lib/types";

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

/**
 * 공개(visibility='public') 후기의 서버 렌더용 전체 행 — 비공개·친구공개·특정인공개·없는 글은 null.
 * (작업지시서 2026-11-28) 새 외부 API 호출 없이 DB 한 번만 읽는다.
 */
export async function fetchPublicTripPostArticle(postId: number): Promise<PublicTripPostArticle | null> {
  if (!postId) return null;
  const result = await pool.query<{
    id: number;
    title: string;
    content: string | null;
    images: unknown;
    visibility: string;
    authorName: string;
    region: string | null;
    tripTitle: string | null;
    coursesSnapshot: CourseSnapshot | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `select p.id, p.title, p.content, p.images, p.visibility, coalesce(u.nickname, '여행자') as "authorName",
            i.region as "region", i.title as "tripTitle", p."coursesSnapshot" as "coursesSnapshot",
            p.created_at as "createdAt", p.updated_at as "updatedAt"
     from trip_posts p
     join users u on u.id = p."userId"
     left join itineraries i on i.id = p."itineraryId"
     where p.id = $1`,
    [postId],
  );
  const row = result.rows[0];
  if (!row || row.visibility !== "public") return null;
  const images = (Array.isArray(row.images) ? row.images : []).filter((x): x is string => typeof x === "string");
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    images,
    authorName: row.authorName,
    region: row.coursesSnapshot?.region ?? row.region ?? null,
    tripTitle: row.coursesSnapshot?.title ?? row.tripTitle ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    days: summarizeDays(row.coursesSnapshot?.items),
  };
}
