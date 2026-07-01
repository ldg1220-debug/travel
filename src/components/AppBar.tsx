"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, Search, Calendar, Book, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LoginModal } from "@/components/LoginModal";
import { useItineraryStore } from "@/store/itineraryStore";
import { saveItinerary } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";

const NAV_ITEMS = [
  { href: "/discover", label: "탐색", icon: Search },
  { href: "/planner", label: "계획", icon: Calendar },
  { href: "/scrapbook", label: "보관함", icon: Book },
];

const PAGE_TITLES: Record<string, string> = {
  "/discover": "어디로 떠나시나요?",
  "/scrapbook": "Scrapbook",
};

/**
 * Global App Bar for the /discover, /planner, /scrapbook screens (see
 * src/app/(app)/layout.tsx) — a hamburger menu opens a left-side Sheet
 * listing all three, and the center/right slots adapt to whichever one is
 * active. Only /planner has anything worth inviting a collaborator to, so
 * the invite button (and the handleInvite logic it drives) only appears
 * there.
 */
export function AppBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDate = useItineraryStore((s) => s.activeDate);
  const region = useItineraryStore((s) => s.region);
  const items = useItineraryStore((s) => s.items);

  const isPlanner = pathname?.startsWith("/planner") ?? false;
  // /planner is the base route; /planner/{shareToken} is the only sub-route.
  const isShared = isPlanner && pathname !== "/planner";

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  const handleInvite = async () => {
    if (!session?.user) {
      setLoginReason("일정을 공유하려면 로그인해주세요.");
      return;
    }
    try {
      const { shareToken } = await saveItinerary(region, items);
      const url = `${window.location.origin}/planner/${shareToken}`;
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied");
    } catch {
      showToast("Failed to create invite link");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Menu"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Travel Scheduler</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-2">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname?.startsWith(href) ?? false;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={17} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-col items-center">
          {isPlanner ? (
            <>
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                {formatDateLabel(activeDate)}
                {isShared && " · Shared"}
              </span>
              <span className="text-[15px] font-bold leading-tight text-slate-900">Fukuoka × Yufuin</span>
            </>
          ) : (
            <span className="text-[15px] font-bold text-slate-900">{PAGE_TITLES[pathname ?? ""] ?? "Travel Scheduler"}</span>
          )}
        </div>

        {isPlanner ? (
          <button
            onClick={handleInvite}
            aria-label="초대하기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
          >
            <UserPlus size={18} />
          </button>
        ) : (
          <div className="h-9 w-9" aria-hidden />
        )}
      </header>

      {loginReason && <LoginModal reason={loginReason} onClose={() => setLoginReason(null)} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </>
  );
}
