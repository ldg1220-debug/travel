/**
 * 개인정보처리방침 — 가입 시 필수 동의 대상 문서. 로그인 없이 볼 수 있는
 * 정적 페이지. 수집 항목·위탁처가 바뀌면(예: 새 외부 API, 결제 도입) 반드시
 * 함께 갱신할 것 (법률 전문가 최종 검토 전의 서비스 운영 초안).
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8">
        <PrivacyBody />
      </div>
    </div>
  );
}

/** 본문만 — 독립 페이지(/privacy)와 ProfileSheet의 인앱 뷰어(LegalDocSheet)가 함께 쓴다. */
export function PrivacyBody() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">개인정보처리방침</h1>
      <p className="mt-1 text-[12.5px] text-slate-400">시행일자: 2026년 7월 20일</p>

      <div className="mt-6 space-y-7 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_table]:mt-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2.5 [&_td]:py-1.5 dark:[&_td]:border-slate-700 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left dark:[&_th]:border-slate-700 dark:[&_th]:bg-slate-800">
          <p>
            트레쥴(Tradule, 이하 &ldquo;서비스&rdquo;)은 개인정보 보호법 등 관련 법령을 준수하며, 이용자의 개인정보를 아래와 같이
            처리합니다.
          </p>

          <section>
            <h2>1. 수집하는 개인정보 항목 및 방법</h2>
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>항목</th>
                  <th>수집 방법</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>필수</td>
                  <td>이메일 주소, 소셜 계정 식별자, 이름·프로필 사진(소셜 계정이 제공하는 경우)</td>
                  <td>Google·카카오·Apple 소셜 로그인 연동 시</td>
                </tr>
                <tr>
                  <td>필수</td>
                  <td>닉네임</td>
                  <td>가입 후 프로필 설정 시 이용자가 직접 입력</td>
                </tr>
                <tr>
                  <td>선택</td>
                  <td>프로필 사진(직접 업로드), 여행 계획·후기·사진 등 이용자가 작성한 콘텐츠</td>
                  <td>서비스 이용 중 이용자가 직접 입력·업로드</td>
                </tr>
                <tr>
                  <td>자동</td>
                  <td>접속 기록, 기기·브라우저 정보(서비스 제공·보안 목적의 최소한)</td>
                  <td>서비스 이용 과정에서 자동 생성</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2">
              소셜 계정의 이름·이메일은 다른 이용자에게 공개되지 않으며, 공개 화면에는 이용자가 정한 닉네임만 표시됩니다.
            </p>
          </section>

          <section>
            <h2>2. 개인정보의 처리 목적</h2>
            <ul>
              <li>회원 식별, 로그인 및 계정 관리</li>
              <li>여행 계획 저장·동기화, 후기 게시 등 서비스 핵심 기능 제공</li>
              <li>트래블메이트(팔로우)·알림 등 소셜 기능 제공</li>
              <li>서비스 안정성 확보, 부정 이용 방지 및 문의 대응</li>
            </ul>
          </section>

          <section>
            <h2>3. 보유 및 이용 기간</h2>
            <p className="mt-1.5">
              회원 탈퇴 시 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이 필요한 경우(전자상거래 등에서의 소비자 보호에 관한
              법률에 따른 거래 기록 등)에는 해당 법령이 정한 기간 동안 보관합니다.
            </p>
          </section>

          <section>
            <h2>4. 개인정보의 제3자 제공</h2>
            <p className="mt-1.5">
              이용자의 별도 동의가 있거나 법령에 근거가 있는 경우를 제외하고, 개인정보를 제3자에게 제공하지 않습니다.
            </p>
          </section>

          <section>
            <h2>5. 처리 위탁 및 국외 이전</h2>
            <p className="mt-1.5">서비스 제공을 위해 아래 업체에 개인정보 처리를 위탁하며, 데이터가 국외 서버에 저장될 수 있습니다.</p>
            <table>
              <thead>
                <tr>
                  <th>수탁 업체</th>
                  <th>위탁 업무</th>
                  <th>이전 국가</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Vercel Inc.</td>
                  <td>서비스 호스팅, 데이터베이스(Postgres)·파일(사진) 저장</td>
                  <td>미국 등</td>
                </tr>
                <tr>
                  <td>Google LLC / 카카오 / Apple Inc.</td>
                  <td>소셜 로그인 인증, 지도·장소 정보 제공</td>
                  <td>미국·대한민국</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>6. 이용자의 권리</h2>
            <ul>
              <li>이용자는 언제든지 자신의 개인정보를 조회·수정(프로필 설정)할 수 있습니다.</li>
              <li>이용자는 언제든지 프로필 설정 화면에서 직접 회원 탈퇴(계정·개인정보 삭제)를 할 수 있으며, 탈퇴 즉시 처리됩니다.</li>
              <li>만 14세 미만 아동의 개인정보는 수집하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2>7. 개인정보의 파기 절차 및 방법</h2>
            <p className="mt-1.5">
              보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 전자적 파일 형태의 경우 복구할 수 없는 방법으로 즉시 삭제합니다.
            </p>
          </section>

          <section>
            <h2>8. 안전성 확보 조치</h2>
            <ul>
              <li>전송 구간 암호화(HTTPS) 및 접근 권한이 통제된 데이터베이스 사용</li>
              <li>업로드된 사진은 비공개 저장소에 보관하고 서비스 내 인증된 경로로만 제공</li>
            </ul>
          </section>

          <section>
            <h2>9. 개인정보 보호책임자 및 문의처</h2>
            <p className="mt-1.5">
              개인정보 처리에 관한 문의·불만·피해구제 요청은 아래로 연락해 주시기 바랍니다.
              <br />
              이메일: ldg1220@naver.com
            </p>
            <p className="mt-1.5">
              기타 개인정보 침해 신고·상담: 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118)
            </p>
          </section>

          <section>
            <h2>10. 방침의 변경</h2>
            <p className="mt-1.5">
              이 방침의 내용이 변경되는 경우 시행일 7일 전부터 서비스 내 공지로 알립니다. 수집 항목·목적 등 중요한 변경은 필요한
              경우 다시 동의를 받습니다.
            </p>
          </section>
      </div>
    </>
  );
}
