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
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the manifest theme_color — tints the mobile browser chrome / status bar.
  themeColor: "#FF8A3D",
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
