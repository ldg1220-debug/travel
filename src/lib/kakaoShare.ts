"use client";

// Kakao JS SDK (카카오톡 공유하기) — a different key/product from the Kakao
// Maps SDK (src/components/map/MapProvider.tsx) and the Kakao Local REST
// search (src/app/api/places/search/route.ts). Loaded lazily and only once,
// since most sessions never tap the share button.

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (options: {
          objectType: "feed";
          content: {
            title: string;
            description: string;
            imageUrl: string;
            link: { mobileWebUrl: string; webUrl: string };
          };
          buttons: Array<{
            title: string;
            link: { mobileWebUrl: string; webUrl: string };
          }>;
        }) => void;
      };
    };
  }
}

const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

let loadPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) {
      reject(new Error("NEXT_PUBLIC_KAKAO_JS_KEY가 설정되어 있지 않아요."));
      return;
    }

    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => {
      if (!window.Kakao) {
        reject(new Error("카카오 SDK 로드에 실패했어요."));
        return;
      }
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      resolve();
    };
    script.onerror = () => reject(new Error("카카오 SDK 로드에 실패했어요."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function shareToKakao(options: {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  buttonTitle?: string;
}) {
  await loadKakaoSdk();
  const imageUrl = options.imageUrl ?? `${window.location.origin}/apple-icon.png`;
  window.Kakao!.Share.sendDefault({
    objectType: "feed",
    content: {
      title: options.title,
      description: options.description,
      imageUrl,
      link: { mobileWebUrl: options.url, webUrl: options.url },
    },
    buttons: [
      {
        title: options.buttonTitle ?? "보러 가기",
        link: { mobileWebUrl: options.url, webUrl: options.url },
      },
    ],
  });
}
