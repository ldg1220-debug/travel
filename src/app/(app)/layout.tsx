import { AppBar } from "@/components/AppBar";

/**
 * Wraps only /discover, /planner, /scrapbook (a route group — "(app)"
 * doesn't appear in the URL) with the shared App Bar + hamburger nav, so
 * the original "/" demo and "/share/[id]" read-only page are unaffected.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <AppBar />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
