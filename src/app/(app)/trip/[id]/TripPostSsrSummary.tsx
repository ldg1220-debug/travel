import type { PublicTripPostArticle } from "@/lib/tripPostSeo";
import { clipContent } from "@/lib/tripPostSeo";

/**
 * 작업지시서 2026-11-28 — 공개 후기만 서버에서 내보내는 본문 요약. TripPostDetailPage 가 글을 불러오기
 * 전("불러오는 중…" 자리)에 대신 보이고, 로드가 끝나면 클라이언트 화면으로 교체된다(중복 표시 없음).
 * 서버 컴포넌트(훅 없음) — 비공개 글에는 호출 자체가 되지 않는다.
 */
export function TripPostSsrSummary({ post }: { post: PublicTripPostArticle }) {
  const image = post.images[0];
  const meta = [post.region, post.tripTitle].filter(Boolean).join(" · ");
  return (
    <article className="mx-auto min-h-full max-w-2xl bg-slate-50 px-4 py-6 text-slate-800">
      <h1 className="text-lg font-bold">{post.title}</h1>
      <p className="mt-1 text-[12px] text-slate-500">
        {post.authorName}
        {meta ? ` · ${meta}` : ""}
      </p>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={post.title} className="mt-3 w-full rounded-xl object-cover" />
      )}
      {post.content && <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{clipContent(post.content)}</p>}
      {post.days.length > 0 && (
        <section className="mt-4">
          <h2 className="text-[13px] font-semibold">여행 일정</h2>
          <ul className="mt-1 space-y-1 text-[13px] text-slate-600">
            {post.days.map((d, i) => (
              <li key={d.date}>
                {i + 1}일차: {d.names.join(" → ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
