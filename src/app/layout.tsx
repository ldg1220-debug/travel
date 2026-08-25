import type { Metadata } from "next";
import { Geist, Geist_Mono, Gaegu } from "next/font/google";
import { Providers } from "./providers";
import { SplashScreen } from "@/components/SplashScreen";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 빈 상태 헤드라인 전용 손글씨 폰트(스크랩북 모티프 작업지시서 B-4 — 본문·
// 라벨·버튼엔 절대 안 씀, EmptyStateCard의 title에서만). 홈은 이미 크리티컬
// 패스에 프리로드 리소스가 여럿(폰트 2개 + 로고 738KB 등) 걸려 있어
// `preload: false`로 빼둔다 — font-display: swap(next/font 기본값)이라
// font-handwriting 클래스가 실제로 화면에 그려지는 순간에만 지연 로드된다.
// subsets는 "latin"뿐이지만(next/font의 Gaegu 메타데이터에 "korean" 서브셋
// 자체가 없음 — Google이 이 폰트를 단일 파일로만 배포), 그 하나뿐인 파일에
// 한글 글리프가 이미 포함돼 있어 실제로 한글이 정상 렌더된다(확인함) —
// 따로 뺄 수 있는 "라틴 전용" 경량판이 없으니 이게 최소 용량이다.
const gaegu = Gaegu({
  variable: "--font-handwriting",
  subsets: ["latin"],
  weight: ["700"],
  preload: false,
});

export const metadata: Metadata = {
  // Lets every page/route's `metadata`/`generateMetadata` resolve relative
  // og:image etc. URLs against the real domain instead of Next's
  // localhost:3000 dev fallback — needed now that individual routes
  // (trip/[id], community/[id], …) set their own per-page metadata.
  metadataBase: new URL("https://www.tradule.co.kr"),
  title: "Tradule 트레쥴",
  description: "지도와 타임라인으로 여행 일정을 계획하세요.",
  applicationName: "Tradule",
  // Enables the iOS "Add to Home Screen" standalone (fullscreen, no Safari chrome) experience.
  appleWebApp: { capable: true, title: "Tradule", statusBarStyle: "default" },
  // Google Search Console 소유권 확인(작업지시서 2026-08-25, "서치콘솔
  // 등록 완료 + 트래블페이아웃 실사 결과"). 배포되면 서버 렌더 HTML에
  // <meta name="google-site-verification" content="..."> 로 나와야
  // Search Console 쪽에서 "확인" 처리가 가능하다. 네이버 서치어드바이저
  // 소유확인 코드는 동근님이 네이버 로그인 후 직접 발급받아야 해서(자동화
  // 불가 — 접근 자체가 막혀 있음) 아직 없다. 받으면 `other:
  // { "naver-site-verification": "<코드>" }`로 여기 추가할 것.
  verification: { google: "GVL6mMoCWiTOKTMLgGSBt2Edqw7uOAA6_cD1iea8NMg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the manifest theme_color — tints the mobile browser chrome / status bar.
  themeColor: "#FF8A3D",
  // Target API 36(Android 16) 대응(작업지시서 2026-08-23) — edge-to-edge가
  // 강제되면서 env(safe-area-inset-*)로 상태 표시줄/제스처 내비게이션
  // 바 영역을 직접 계산해야 하는데, 이 값 없인 그 함수가 전부 0px만
  // 반환한다. BottomTabBar.tsx/AppBar.tsx의 safe-area 패딩이 이 설정에
  // 의존한다 — 반드시 먼저 있어야 함.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${gaegu.variable} h-full antialiased`}
    >
      <head>
        {/* "only light"가 기본 — 폰 OS가 다크 모드여도 삼성 인터넷/크롬의
            "웹사이트 어둡게"(강제 다크) 재채색이 라이트 화면을 뒤집지 않게
            옵트아웃한다. 앱 자체 다크 모드일 땐 아래 스크립트가 'dark'로
            바꿔 단다. */}
        <meta name="color-scheme" content="only light" />
        {/* No-flash theme init: apply the saved theme before paint. 사용자가
            토글로 직접 다크를 켠 적이 있을 때만 다크 — OS 다크 모드를 자동
            추종하지 않는다(폰이 다크라는 이유로 낮에 앱이 밤처럼 떴던 문제). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');var m=document.querySelector('meta[name=color-scheme]');if(m)m.setAttribute('content','dark')}}catch(e){}})()",
          }}
        />
        {/* Travelpayouts Drive — 사이트 소유 확인용 스니펫(작업지시서
            2026-08-17, "Travelpayouts Drive 스크립트 설치"). `next/script`로
            두 차례(afterInteractive → beforeInteractive) 시도했으나, App
            Router의 `next/script`는 어떤 strategy를 쓰든 원시
            `<script src>` 태그를 초기 HTML에 내보내지 않는다 — 대신
            `<link rel=preload as=script>` + 자체 로더 큐(`__next_s`) 푸시로
            변환해 하이드레이션 이후에야 DOM에 태그를 만든다. Travelpayouts의
            검증기가 원본 벤더 스니펫(문서에 직접 박힌 IIFE) 형태를 전제로
            한다면 이 변환이 검증 실패의 원인일 수 있어, `next/script`를
            거치지 않고 벤더가 준 IIFE를 그대로 인라인 스크립트로 넣는다 —
            엘리먼트 하나를 만들어 head에 붙이는 것뿐이고 실제 로드는
            `async`라 성능 부담은 없다(위 다크모드 초기화 스크립트와 같은
            패턴). 원본의 나머지 속성(nowprocket, data-noptimize 등)은 전부
            WordPress 최적화 플러그인 우회용 힌트라 Next.js와 무관해 넣지
            않았고, data-cmp-ab만 주입되는 스크립트 자체에 실제로 붙던
            값이라 유지. Money Script(전체 링크 자동 제휴화)는 의도적으로
            설치하지 않음 — bookingProviders()가 이미 딥링크를 직접
            관리하고 lodging_cta_events로 전환을 추적 중이라, 자동 변환을
            얹으면 통제를 잃고 그 추적과 충돌한다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var s=document.createElement('script');s.async=1;s.setAttribute('data-cmp-ab','2');s.id='tp-drive';s.src='https://emrldtp.com/NTYzMDg1.js?t=563085';document.head.appendChild(s);})();",
          }}
        />
      </head>
      <body className="h-full bg-slate-200 dark:bg-slate-950">
        {/* Fetch the brand logo ASAP so it's ready for the splash (React hoists this to <head>). */}
        <link rel="preload" href="/brand/tradule-logo.png" as="image" />
        <ServiceWorkerRegister />
        <SplashScreen />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
