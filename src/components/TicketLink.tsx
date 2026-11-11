"use client";

import { trackFeatureEvent } from "@/lib/trackFeatureEvent";

/** 코스 페이지 명소 옆 "입장권 확인" — Klook 검색 결과로만 가는 제휴 링크. 클릭 시 ticket_click 이벤트. */
export function TicketLink({ url, region, spot }: { url: string; region: string; spot: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      onClick={() => trackFeatureEvent("ticket_click", "course", { provider: "klook", region, spot })}
      className="mt-1 inline-block text-[12px] font-medium text-[#ff5b00] hover:underline"
    >
      입장권 확인
    </a>
  );
}
