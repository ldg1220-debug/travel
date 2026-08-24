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
      <p className="mt-1 text-[12.5px] text-slate-400">시행일자: 2026년 7월 29일</p>

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
                  <td>선택</td>
                  <td>실시간 위치정보(GPS 좌표)</td>
                  <td>이용자가 검색 화면에서 &ldquo;내 주변순&rdquo;을 직접 선택했을 때, 브라우저의 위치 권한 동의 후 1회성으로 수집</td>
                </tr>
                <tr>
                  <td>자동</td>
                  <td>접속 기록, 기기·브라우저 정보(서비스 제공·보안 목적의 최소한)</td>
                  <td>서비스 이용 과정에서 자동 생성</td>
                </tr>
                <tr>
                  <td>자동</td>
                  <td>익명 세션 식별자(임의로 생성된 문자열), 코스 생성·검색·계획 저장/공유 등 기능 이용 기록</td>
                  <td>서비스 이용 과정에서 브라우저에 자동 생성·저장</td>
                </tr>
                <tr>
                  <td>자동</td>
                  <td>현재 보고 있는 페이지 주소, 그 페이지에 있는 여행 예약 관련 외부 링크 목록, 클릭·방문 정보</td>
                  <td>외부 제휴 마케팅 플랫폼(Travelpayouts)이 제공하는 스크립트를 통해 페이지를 여는 즉시 자동 수집(쿠키·로컬 스토리지 사용 가능)</td>
                </tr>
                <tr>
                  <td>자동</td>
                  <td>숙소 예약 버튼 클릭 시점, 클릭한 숙소의 카테고리·화면 위치 등 이용 기록</td>
                  <td>이용자가 숙소 예약 버튼(트립닷컴 등 제휴 링크)을 클릭했을 때 서비스 자체 서버에 자동 생성</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2">
              소셜 계정의 이름·이메일은 다른 이용자에게 공개되지 않으며, 공개 화면에는 이용자가 정한 닉네임만 표시됩니다.
            </p>
            <p className="mt-2">
              실시간 위치정보는 이용자가 &ldquo;내 주변순&rdquo; 정렬을 선택한 그 검색 요청에만 사용되며, 서버에 저장되거나
              로그로 남지 않습니다. 이 기능을 사용하지 않으면 위치정보는 전혀 수집되지 않으며, 그 밖의 지도·검색 결과에
              표시되는 장소의 위치는 구글·카카오 등 외부 지도 서비스가 제공하는 공개 정보를 그대로 보여주는 것입니다.
            </p>
            <p className="mt-2">
              익명 세션 식별자는 로그인 여부와 무관하게 브라우저에 저장되는 임의의 문자열로, 특정 개인을 식별할 수 없으며
              IP 주소는 별도로 저장되지 않습니다. 이는 어떤 기능이 얼마나 쓰이는지 파악해 서비스를 개선하는 목적에만
              쓰이며, 수집일로부터 최대 90일간 보관 후 자동 삭제됩니다.
            </p>
            <p className="mt-2">
              서비스는 제휴 마케팅(어필리에이트) 성과 측정을 위해 외부 업체 Travelpayouts의 추적 스크립트를 페이지에
              포함하고 있습니다. 이 스크립트는 서비스가 아닌 Travelpayouts가 직접 운영하며, 페이지를 여는 시점에(클릭
              여부와 무관하게) 현재 페이지 주소와 그 페이지 안의 여행 예약 관련 외부 링크 목록을 Travelpayouts
              서버로 전송하고, 쿠키 또는 브라우저 로컬 스토리지를 이용해 클릭·방문 정보를 수집할 수 있습니다. 수집되는
              정보의 구체적인 처리 방식은 Travelpayouts의 자체 개인정보처리방침을 따릅니다. 안드로이드 앱은 이 웹
              서비스를 그대로 담은 TWA(Trusted Web Activity) 구조라, 앱 안에서도 웹과 동일하게 동작합니다.
            </p>
            <p className="mt-2">
              또한 서비스는 숙소 예약 연결을 위해 외부 업체 트립닷컴(Trip.com)과 제휴하고 있습니다. 이용자가 숙소 예약
              버튼을 클릭하면 제휴 추적을 위한 식별자(Allianceid, SID)가 포함된 링크를 통해 트립닷컴 페이지로
              이동하며, 이 클릭 시점의 정보(어떤 숙소 카테고리·화면 위치에서 클릭했는지 등)는 서비스 자체 서버에도
              함께 기록되어 이용 통계 목적으로만 쓰입니다. 트립닷컴 페이지로 이동한 이후 트립닷컴이 수집하는 정보는
              서비스와 무관하며, 트립닷컴의 자체 개인정보처리방침을 따릅니다.
            </p>
          </section>

          <section>
            <h2>2. 개인정보의 처리 목적</h2>
            <ul>
              <li>회원 식별, 로그인 및 계정 관리</li>
              <li>여행 계획 저장·동기화, 후기 게시 등 서비스 핵심 기능 제공</li>
              <li>트래블메이트(팔로우)·알림 등 소셜 기능 제공</li>
              <li>서비스 안정성 확보, 부정 이용 방지 및 문의 대응</li>
              <li>익명 이용 통계 분석을 통한 서비스 개선(기능별 이용 현황 파악)</li>
            </ul>
          </section>

          <section>
            <h2>3. 보유 및 이용 기간</h2>
            <p className="mt-1.5">
              회원 탈퇴는 이메일 확인 후 14일의 유예기간을 거쳐 확정되며, 유예기간 중 취소하지 않으면 그 종료 시점에 계정 및
              개인정보를 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이 필요한 경우(전자상거래 등에서의 소비자 보호에 관한
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
                  <td>서비스 호스팅, 파일(사진) 저장</td>
                  <td>미국 등</td>
                </tr>
                <tr>
                  <td>Supabase, Inc.</td>
                  <td>데이터베이스(Postgres) 저장</td>
                  <td>싱가포르</td>
                </tr>
                <tr>
                  <td>Google LLC / 카카오 / Apple Inc.</td>
                  <td>소셜 로그인 인증, 지도·장소 정보 제공</td>
                  <td>미국·대한민국</td>
                </tr>
                <tr>
                  <td>Travelpayouts</td>
                  <td>제휴 마케팅 성과 측정(클릭·방문 정보 수집)</td>
                  <td>해외</td>
                </tr>
                <tr>
                  <td>Trip.com</td>
                  <td>제휴 마케팅(숙소 예약 연결 및 성과 측정)</td>
                  <td>해외</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>6. 이용자의 권리</h2>
            <ul>
              <li>이용자는 언제든지 자신의 개인정보를 조회·수정(프로필 설정)할 수 있습니다.</li>
              <li>
                이용자는 언제든지 프로필 설정 화면에서 직접 회원 탈퇴(계정·개인정보 삭제)를 신청할 수 있습니다. 이메일 확인
                후 14일의 유예기간 동안은 로그인하여 탈퇴를 취소할 수 있고, 유예기간이 지나면 영구 삭제됩니다.
              </li>
              <li>만 14세 미만 아동의 개인정보는 수집하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2>7. 개인정보의 파기 절차 및 방법</h2>
            <p className="mt-1.5">
              회원 탈퇴는 이메일 확인 후 14일의 유예기간을 두며, 유예기간 중 이용자가 취소하지 않으면 그 종료 시점에
              전자적 파일 형태의 개인정보를 복구할 수 없는 방법으로 삭제합니다. 그 밖에 보유 기간이 경과하거나 처리
              목적이 달성된 개인정보도 같은 방법으로 지체 없이 삭제합니다.
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
