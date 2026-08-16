import { AppBar } from "@/components/AppBar";
import { BottomTabBar } from "@/components/BottomTabBar";

/**
 * Wraps only /discover, /planner, /scrapbook 등(a route group — "(app)"
 * doesn't appear in the URL) with the shared App Bar + nav, so the original
 * "/" demo and "/share/[id]" read-only page are unaffected.
 *
 * BottomTabBar는 `fixed`가 아니라 이 flex-col의 일반 형제로 둔다 — 부모가
 * 이미 `flex h-dvh flex-col`이라 이 바가 차지하는 높이만큼 `<main>`이
 * 자연히 줄어들고, 페이지마다 padding-bottom을 손으로 보정할 필요가 없다.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <AppBar />
      <main className="min-h-0 flex-1">{children}</main>
      <BottomTabBar />
    </div>
  );
}
