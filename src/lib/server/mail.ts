import { Resend } from "resend";

// RESEND_API_KEY가 없으면(로컬 개발 등) 발송 자체를 시도하지 않고 바로
// 실패시킨다 — 조용히 성공한 것처럼 넘어가면 "확인 메일을 못 받았다"는
// 문의가 원인 불명으로 남는다.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * 회원 탈퇴 확인 메일 — 링크를 눌러야만 탈퇴 유예기간이 시작된다(이메일
 * 소유 확인 없이는 계정 버튼만으로 탈퇴가 진행되지 않게 하기 위함).
 */
export async function sendDeletionConfirmEmail(to: string, confirmUrl: string): Promise<void> {
  if (!resend) {
    throw new Error("이메일 발송이 설정되지 않았어요");
  }
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Tradule <onboarding@resend.dev>",
    to,
    subject: "[트레쥴] 회원 탈퇴 확인",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
        <h2 style="margin:0 0 12px">회원 탈퇴를 요청하셨어요</h2>
        <p style="line-height:1.6">
          아래 버튼을 누르면 탈퇴가 진행돼요. 지금부터 2주 동안은 계정이 그대로 유지되며,
          그 안에 언제든 앱에서 "계정 살리기"를 눌러 취소할 수 있어요. 2주가 지나면
          계정과 모든 데이터가 영구 삭제되며 복구할 수 없어요.
        </p>
        <p style="margin:24px 0">
          <a href="${confirmUrl}" style="display:inline-block;background:#BC5200;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">
            탈퇴 확인하기
          </a>
        </p>
        <p style="font-size:12.5px;color:#94a3b8;line-height:1.6">
          본인이 요청한 게 아니라면 이 메일을 무시하셔도 돼요 — 링크를 누르기 전까지는
          아무 변화도 일어나지 않아요. 이 링크는 24시간 후 만료돼요.
        </p>
      </div>
    `,
  });
}
