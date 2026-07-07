import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { SplashScreen } from "@/components/SplashScreen";
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
      <body className="h-full bg-slate-200">
        {/* Fetch the brand logo ASAP so it's ready for the splash (React hoists this to <head>). */}
        <link rel="preload" href="/brand/tradule-logo.png" as="image" />
        <SplashScreen />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
