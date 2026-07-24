"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { fetchAdminUsers, setUserAdmin, type AdminUserRow } from "@/lib/api";
import { isRootAdmin } from "@/lib/server/rootAdmin";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

/** 관리자 지정/해제 — 루트 관리자(대표 계정)만 접근 가능. 다른 계정을 검색해 관리자 권한을 주거나 뺏을 수 있다. */
export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRoot = isRootAdmin(session?.user?.email);

  const load = () => {
    fetchAdminUsers(query).then(setUsers);
  };

  useEffect(() => {
    if (isRoot) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 검색은 명시적 제출(엔터/버튼)에만 반응
  }, [isRoot]);

  if (status !== "loading" && !isRoot) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
        <p className="text-[13px] text-slate-400">관리자 지정은 대표 계정만 할 수 있어요.</p>
      </div>
    );
  }

  const toggleAdmin = async (u: AdminUserRow) => {
    setBusyId(u.id);
    setError(null);
    try {
      await setUserAdmin(u.id, !u.isAdmin);
      setUsers((cur) => cur?.map((x) => (x.id === u.id ? { ...x, isAdmin: !x.isAdmin } : x)) ?? cur);
    } catch (e) {
      setError(e instanceof Error ? e.message : "관리자 권한 변경에 실패했어요");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 pb-24 pt-6 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">관리자 지정</h1>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          닉네임으로 사용자를 찾아 관리자 권한을 주거나 뺏을 수 있어요. 관리자는 신고 처리·계정 정지·대시보드 열람이
          가능해요.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임으로 검색…"
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button type="submit" className="h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            검색
          </button>
        </form>

        {error && <p className="mt-2 text-[12.5px] text-red-500">{error}</p>}

        <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {users == null ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-400">찾는 사용자가 없어요</p>
          ) : (
            users.map((u) => {
              const isRootUser = isRootAdmin(u.email);
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar URL
                    <img src={u.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-500 dark:bg-slate-800">
                      {u.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
                      {u.name}
                      {isRootUser && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">대표</span>}
                      {u.isBanned && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">정지됨</span>}
                    </p>
                    <p className="text-[11px] text-slate-400">가입 {formatDate(u.createdAt)}</p>
                  </div>
                  {isRootUser ? (
                    <span className="shrink-0 text-[11.5px] text-slate-300">해제 불가</span>
                  ) : (
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={busyId === u.id}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                        u.isAdmin
                          ? "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {u.isAdmin ? "관리자 해제" : "관리자로 지정"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
