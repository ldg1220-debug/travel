import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
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
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
