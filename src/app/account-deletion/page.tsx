import Link from "next/link";

/**
 * 탈퇴 확인 이메일의 링크(GET /api/account/confirm-deletion)가 최종적으로
 * 도착하는 곳 — 로그인 세션 없이도 열릴 수 있어(app) 레이아웃 밖에 둔다.
 */
export default async function AccountDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const content =
    status === "confirmed"
      ? {
          title: "탈퇴가 확인됐어요",
          body: "지금부터 2주 동안은 계정이 그대로 유지돼요. 그 안에 언제든 앱에 로그인해 \"계정 살리기\"를 누르면 취소할 수 있어요. 2주가 지나면 계정과 모든 데이터가 영구 삭제되며 복구할 수 없어요.",
        }
      : status === "expired"
        ? {
            title: "링크가 만료됐거나 이미 사용됐어요",
            body: "확인 링크는 발급 후 24시간만 유효해요. 다시 탈퇴를 진행하려면 앱의 프로필 화면에서 \"회원 탈퇴\"를 다시 눌러주세요.",
          }
        : {
            title: "잘못된 요청이에요",
            body: "확인 링크가 올바르지 않아요. 앱의 프로필 화면에서 \"회원 탈퇴\"를 다시 눌러 새 확인 메일을 받아주세요.",
          };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 font-sans dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{content.title}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{content.body}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-brand-700 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-800"
        >
          트레쥴로 돌아가기
        </Link>
      </div>
    </div>
  );
}
