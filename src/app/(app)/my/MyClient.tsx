"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut, ChevronRight } from "lucide-react";
import { CordixIcon, type CordixIconName } from "@/components/icons/CordixIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginModal } from "@/components/LoginModal";
import { ProfileSheet } from "@/components/ProfileSheet";
import { fetchFeed, fetchAdminContactId, type FeedPost } from "@/lib/api";
import { unsubscribeFromPush } from "@/lib/push";
import { ROOT_ADMIN_EMAIL } from "@/lib/server/rootAdmin";
import { formatDateLabel } from "@/lib/timeline";

/** 메뉴 한 줄 — href가 있으면 Link, 없으면 버튼(onClick). 오른쪽은 항상 화살표(또는 커스텀 slot, 다크모드 토글용). */
function MenuRow({
  icon,
  label,
  sublabel,
  href,
  onClick,
  disabled,
  right,
}: {
  icon: CordixIconName;
  label: string;
  sublabel?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  right?: React.ReactNode;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <CordixIcon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {sublabel && <span className="block text-[11.5px] text-slate-400">{sublabel}</span>}
      </span>
      {right ?? <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />}
    </>
  );
  const className =
    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-slate-800";
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-3xl border border-slate-200/70 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
      {title && <p className="px-3 pb-1 pt-2 text-[11.5px] font-bold uppercase tracking-wide text-slate-400">{title}</p>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * 로그인/프로필/메시지/내 후기/보관함/설정/약관 등 계정 관련 항목의 새
 * 중심지 — 탭바 도입(2026-08-15, B안)으로 AppBar의 햄버거 드로어에서
 * 이관된 항목들을 모은다. `ProfileSheet` 자체는 재사용(로직 재작성 안
 * 함) — 여기서는 non-mandatory 모드로 트리거만 새로 연다.
 */
export default function MyClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [myPosts, setMyPosts] = useState<FeedPost[] | null>(null);
  const [contactingAdmin, setContactingAdmin] = useState(false);

  const loggedIn = !!session?.user;

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetchFeed(1, 10, { scope: "mine" }).then((data) => {
      if (!cancelled) setMyPosts(data.posts);
    });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // 문의하기 — AppBar 햄버거 드로어에 있던 것과 동일한 로직. 로그인
  // 상태면 관리자에게 쪽지로(관리자는 트래블 메이트가 아니어도 받을 수
  // 있게 서버에서 예외 허용해뒀다), 아니면 로그인 없이 바로 쓸 수 있는
  // 메일로 대신한다.
  const handleContactAdmin = async () => {
    if (!session?.user) {
      window.location.href = `mailto:${ROOT_ADMIN_EMAIL}`;
      return;
    }
    setContactingAdmin(true);
    try {
      const adminId = await fetchAdminContactId();
      if (adminId != null) router.push(`/messages/${adminId}`);
      else window.location.href = `mailto:${ROOT_ADMIN_EMAIL}`;
    } catch {
      window.location.href = `mailto:${ROOT_ADMIN_EMAIL}`;
    } finally {
      setContactingAdmin(false);
    }
  };

  const handleLogout = () => {
    unsubscribeFromPush().catch(() => {});
    signOut();
  };

  if (status !== "loading" && !loggedIn) {
    return (
      <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">MY</h2>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <CordixIcon name="user" size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">로그인이 필요해요</p>
            <p className="mt-1 text-[13px] text-slate-400">프로필, 메시지, 저장한 여행을 보려면 로그인해주세요.</p>
            <button
              onClick={() => setLoginOpen(true)}
              className="mt-5 rounded-full bg-brand-700 px-5 py-2 text-[13px] font-semibold text-white hover:bg-brand-800"
            >
              로그인하기
            </button>
          </div>
        </div>
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">MY</h2>

        {/* 프로필 요약 */}
        <div className="mb-4 flex items-center gap-3 rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-600 to-brand-pink-600 text-lg font-bold text-white">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar / uploaded blob URL
              <img src={session.user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              (session?.user?.nickname ?? session?.user?.email ?? "?").trim().charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-slate-900 dark:text-slate-100">{session?.user?.nickname ?? "여행자"}</p>
            {session?.user?.email && <p className="truncate text-[12px] text-slate-400">{session.user.email}</p>}
          </div>
          <button
            onClick={() => setProfileOpen(true)}
            className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            프로필 편집
          </button>
        </div>

        <Section>
          <MenuRow icon="message" label="메시지" href="/messages" />
        </Section>

        {/* 내 후기 — 최근 10개만. 전체 여행별 관리는 각 계획의 후기
            작성/수정 흐름을 그대로 쓰고, 여긴 훑어보기용 목록. */}
        <Section title="내 후기">
          {myPosts == null ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-slate-400">불러오는 중…</p>
          ) : myPosts.length === 0 ? (
            <p className="px-3 py-4 text-center text-[12.5px] text-slate-400">아직 작성한 후기가 없어요</p>
          ) : (
            myPosts.map((post) => (
              <Link
                key={post.id}
                href={`/trip/${post.id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {post.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
                  <img src={post.images[0]} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300 dark:bg-slate-800">
                    <CordixIcon name="camera" size={15} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-slate-800 dark:text-slate-100">{post.title}</span>
                  <span className="block text-[11px] text-slate-400">{formatDateLabel(post.createdAt.slice(0, 10))}</span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-slate-300 dark:text-slate-600" />
              </Link>
            ))
          )}
        </Section>

        <Section title="보관함">
          <MenuRow icon="trip-archive" label="여행 보관함" href="/scrapbook" />
          <MenuRow icon="saved-card-heart" label="관심 장소 보관함" href="/saved-places" />
        </Section>

        <Section title="설정">
          <MenuRow icon="settings" label="알림 · 계정 설정" onClick={() => setProfileOpen(true)} />
          <MenuRow
            icon="globe"
            label="다크 모드"
            right={<ThemeToggle />}
          />
          <MenuRow icon="message" label="문의하기" onClick={handleContactAdmin} disabled={contactingAdmin} sublabel={contactingAdmin ? "연결 중…" : undefined} />
        </Section>

        {session?.user?.isAdmin && (
          <Section title="관리자">
            <MenuRow icon="lock" label="관리자 대시보드" href="/admin" />
            <MenuRow icon="lock" label="신고 관리" href="/admin/reports" />
          </Section>
        )}

        <Section>
          <MenuRow icon="folder" label="이용약관" href="/terms" />
          <MenuRow icon="folder" label="개인정보처리방침" href="/privacy" />
        </Section>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <LogOut size={15} />
          로그아웃
        </button>
      </div>

      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
