import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 3항 —
 * og:image가 없어 링크 공유 시 미리보기 카드가 안 뜨던 문제. 앱 루트에
 * 둬서(세그먼트별로 따로 정의하지 않는 한) 사이트 전체의 기본 공유
 * 이미지로 상속된다 — community/[id]·trip/[id] 등 이미 자체 openGraph를
 * 정의한 라우트는 그대로 자기 것을 쓰고, 지금 아무것도 없는 홈·privacy·
 * terms·discover 등이 전부 이 기본값을 받는다.
 *
 * 텍스트를 한글로 직접 렌더링하지 않는다 — next/og(Satori)의 기본
 * 번들 폰트가 한글 글리프를 포함하지 않아 한글 텍스트를 넣으면 빈 사각형
 * (tofu)으로 깨진다. 로고 워드마크는 이미 래스터화된 PNG라 글리프
 * 렌더링과 무관하게 항상 정확히 나오므로, 브랜드명은 이미지로 표시하고
 * 부제는 라틴 문자만 사용한다(next/og 기본 폰트로 안전하게 렌더됨).
 */
export const alt = "Tradule 트레쥴";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const wordmarkData = await readFile(join(process.cwd(), "public/brand/tradule-wordmark.png"), "base64");
  const wordmarkSrc = `data:image/png;base64,${wordmarkData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FFF3E9 0%, #FFE0C2 100%)",
        }}
      >
        {/* next/og(Satori) 렌더링이라 next/image 대신 문서 예시 그대로 <img> 사용. */}
        <img src={wordmarkSrc} width={560} height={131} alt="" />
        <div style={{ marginTop: 32, fontSize: 32, color: "#8e4000", display: "flex" }}>
          Plan your trip on the map, together.
        </div>
      </div>
    ),
    { ...size },
  );
}
