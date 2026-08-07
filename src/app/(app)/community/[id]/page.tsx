import type { Metadata } from "next";
import { fetchPublicCommunityPostMeta } from "@/lib/server/postMetadata";
import { CommunityPostDetailPage } from "./CommunityPostClient";

const FALLBACK: Metadata = {
  title: "커뮤니티 - 트레쥴",
  description: "여행 동행 구하기, 질문답변, 여행 꿀팁까지 여행자들과 나눠보세요.",
};

// trip/[id]/page.tsx와 같은 이유 — 공유 링크의 OG 미리보기용. public이 아닌
// 글(회원공개/특정인공개/비공개)은 fetchPublicCommunityPostMeta가 null을
// 돌려주므로 자동으로 사이트 기본값으로 폴백된다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchPublicCommunityPostMeta(Number(id));
  if (!meta) return FALLBACK;
  return {
    title: `${meta.title} - 트레쥴`,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      images: meta.image ? [meta.image] : undefined,
    },
  };
}

export default function Page() {
  return <CommunityPostDetailPage />;
}
