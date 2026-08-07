import type { Metadata } from "next";
import { pool } from "@/lib/server/db";
import { TmeInvitePage } from "./TmeInviteClient";

const FALLBACK: Metadata = {
  title: "트메 초대 - 트레쥴",
  description: "트레쥴에서 트래블메이트를 맺어보세요.",
};

// 카카오톡 "OOO님과 트메 맺기" 공유 링크의 첫 진입점 — 초대한 사람의 실제
// 닉네임이 공유 카드에 보이도록 한다. 프로필 자체는 /api/users/[id]가
// 그렇듯 원래 뷰어 무관하게 공개(닉네임/아바타에 비공개 개념이 없음)라
// trip/community 글과 달리 visibility 게이팅이 필요 없다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const userId = Number(id);
  if (!userId) return FALLBACK;
  const result = await pool.query<{ nickname: string | null; image: string | null }>(
    `select coalesce(nickname, '여행자') as nickname, image from users where id = $1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) return FALLBACK;
  const title = `${user.nickname}님과 트메 맺기 - 트레쥴`;
  const description = `트레쥴에서 ${user.nickname}님의 여행 프로필을 확인하고 트래블메이트를 맺어보세요.`;
  return {
    title,
    description,
    openGraph: { title, description, images: user.image ? [user.image] : undefined },
  };
}

export default function Page() {
  return <TmeInvitePage />;
}
