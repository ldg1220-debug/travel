/**
 * Google Play "계정 삭제" 링크가 가리키는 공개 안내 페이지 — 로그인 여부와
 * 무관하게 누구나 볼 수 있어야 해서 (app) 레이아웃 밖에 둔다. 탈퇴 자체는
 * 어떤 계정을 지울지 알아야 하므로 앱 안에서만 실행 가능한 구조라, 이
 * 페이지는 그 절차를 명확히 안내하는 역할만 한다 (Google 정책상 허용되는
 * 방식 — 앱 내부에서만 가능한 탈퇴는 "안내 페이지" URL로 대체 가능).
 */
export default function DeleteAccountPage() {
  return (
    // Target API 36 edge-to-edge 대응(작업지시서 2026-08-23) — 원래
    // py-12(3rem)이던 상하 padding에 safe-area-inset을 더한다.
    <div
      className="min-h-dvh bg-slate-50 px-5 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ paddingTop: "calc(3rem + env(safe-area-inset-top, 0px))", paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold tracking-tight">계정 삭제 안내 — 트레쥴(Tradule)</h1>
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          트레쥴 계정과 관련 데이터를 삭제하는 방법을 안내합니다. 계정 삭제는 본인 확인을 위해 앱 안에서만 진행할 수 있습니다.
        </p>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">삭제 요청 방법</h2>
          <ol className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            <li><span className="font-semibold">1.</span> 트레쥴 앱에 로그인합니다.</li>
            <li><span className="font-semibold">2.</span> 좌측 상단 메뉴 → 프로필(설정) 화면으로 이동합니다.</li>
            <li><span className="font-semibold">3.</span> &ldquo;회원 탈퇴&rdquo;를 누릅니다.</li>
            <li><span className="font-semibold">4.</span> 가입한 이메일로 발송된 확인 메일의 링크를 클릭합니다.</li>
            <li><span className="font-semibold">5.</span> 확인 즉시 <strong>14일의 유예기간</strong>이 시작됩니다. 그 사이 앱에 로그인해 &ldquo;계정 살리기&rdquo;를 누르면 언제든 취소할 수 있습니다.</li>
            <li><span className="font-semibold">6.</span> 유예기간이 지나면 계정과 데이터가 <strong>영구적으로 삭제</strong>되며, 이후에는 복구할 수 없습니다.</li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">삭제되는 데이터</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            <li>이메일 주소, 소셜 로그인 식별자, 닉네임, 프로필 사진</li>
            <li>저장한 여행 일정, 관심 장소, 작성한 여행 후기·사진·댓글</li>
            <li>메시지, 트래블 메이트(팔로우) 관계, 알림 기록</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">보관되는 데이터 및 기간</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            원칙적으로 위 데이터는 유예기간 종료 시점에 전부 삭제됩니다. 다만 관련 법령(전자상거래 등에서의 소비자
            보호에 관한 법률에 따른 거래 기록 등)에 따라 보존이 의무화된 항목이 있는 경우에는 해당 법령이 정한
            기간 동안만 별도 보관 후 파기합니다. 자세한 내용은{" "}
            <a href="/privacy" className="underline">
              개인정보처리방침
            </a>
            을 참고해 주세요.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">계정을 삭제하지 않고 일부 데이터만 삭제하기</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            계정 전체를 삭제하지 않고도, 앱 안에서 직접 개별 데이터를 삭제할 수 있습니다. 삭제한 항목은 즉시
            제거되며 별도 유예기간 없이 복구할 수 없습니다.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            <li>여행 후기·사진: 후기 상세 화면 → 편집 → 삭제</li>
            <li>여행 일정(저장한 계획): 계획 목록에서 해당 계획 삭제</li>
            <li>메시지: 대화 화면에서 보낸 메시지를 눌러 삭제</li>
            <li>댓글, 커뮤니티 게시글: 작성한 글 옆의 삭제 버튼</li>
            <li>프로필 사진·닉네임: 프로필 설정 화면에서 직접 수정·삭제</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-[15px] font-bold">문의</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
            계정 삭제 관련 문의: ldg1220@naver.com
          </p>
        </section>
      </div>
    </div>
  );
}
