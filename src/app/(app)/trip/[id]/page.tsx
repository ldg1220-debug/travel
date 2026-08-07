import type { Metadata } from "next";
import { fetchPublicTripPostMeta } from "@/lib/server/postMetadata";
import { TripPostDetailPage } from "./TripPostClient";

const FALLBACK: Metadata = {
  title: "여행 후기 - 트레쥴",
  description: "트레쥴에서 여행자들의 생생한 여행 후기를 확인하세요.",
};

// 카카오톡 등으로 공유되는 링크의 첫 진입점이라, 여기서 실제 글 제목/내용/
// 사진으로 채운 OG 메타를 못 주면 공유 카드가 항상 사이트 기본값(제목
// "Tradule 트레쥴")으로만 뜬다. visibility가 "public"이 아닌 글은
// fetchPublicTripPostMeta가 null을 돌려주므로 자동으로 기본값으로 폴백—
// 비공개/친구공개 글 내용이 크롤러/링크봇에 새는 일은 없다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchPublicTripPostMeta(Number(id));
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
  return <TripPostDetailPage />;
}
