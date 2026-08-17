"use client";

import { useEffect, useRef } from "react";
import { formatDateLabelShort } from "@/lib/timeline";

export interface ShareImageItem {
  time: string;
  name: string;
  order: number;
}

export interface ShareImageData {
  cityName: string;
  /** ISO date (YYYY-MM-DD) of the day being shared. */
  date: string;
  /** Set only when the plan spans more than one day, e.g. "Day 2/3". */
  dayLabel?: string;
  /** Full day's schedule, already time-sorted — this component caps the
   *  visible rows itself per format, real overflow count shown instead. */
  items: ShareImageItem[];
}

const STORY_W = 540;
const STORY_H = 960;
const SQUARE_W = 540;
const SQUARE_H = 540;
const MAX_ROWS: Record<"story" | "square", number> = { story: 8, square: 5 };

// 이 오프스크린 렌더러는 ScheduleSnapshotCapture.tsx와 같은 이유로 순수 hex
// 인라인 스타일만 쓴다 — Tailwind v4의 oklch 색상값을 html-to-image가
// SVG-serialize 방식으로 안정적으로 래스터화하지 못해서, 캡처한 PNG에서
// 텍스트가 안 보이는 사고가 난다(라이브 브라우저에선 멀쩡해 보여서 놓치기
// 쉽다). 아래 hex는 이번 스크랩북 모티프 작업 중 컴파일된 CSS에서 직접
// 확인한 실측값(brand-500~900) — globals.css의 --color-brand-* oklch 정의가
// 바뀌면 같이 갱신해야 한다.
const HEX = {
  warmBg: "#faf7f2",
  warmSurface: "#ffffff",
  warmHairline: "#eae3d6",
  warmInk: "#1a1512",
  warmInk3: "#6f6459",
  brand500: "#e67420",
  brand700: "#8e4000",
  brand800: "#6e2f00",
};

/**
 * 플래너 일정을 빈티지 스크랩북 스타일 공유 이미지로 오프스크린 렌더 —
 * 스크랩북 모티프 작업지시서(2026-08-14, 파트 B) B-2. 화면을 그대로 캡처하는
 * 대신 도시명+날짜+장소 목록(시간표)+로고+스탬프로 구성된 전용 레이아웃을
 * 새로 그린다. "카카오톡 공유" 경로에서만 쓰인다 — "이미지로 저장"(정밀한
 * 시간대별 그리드, `handleCaptureSchedule`)은 그대로 둔다(사용자 피드백:
 * 두 버튼은 이름부터 다른 용도라 하나로 합치면 어느 한쪽이 나빠진다).
 */
export function ShareImageCapture({
  data,
  format,
  onCaptured,
  onError,
}: {
  data: ShareImageData;
  format: "story" | "square";
  onCaptured: (dataUrl: string) => void;
  onError: () => void;
}) {
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const capture = captureRef.current;
      if (!capture) return;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (cancelled) return;
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(capture, { backgroundColor: HEX.warmBg, pixelRatio: 2 });
        if (!cancelled) onCaptured(dataUrl);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture exactly once per mount; parent remounts this via `key={format}` when the format changes
  }, []);

  const width = format === "story" ? STORY_W : SQUARE_W;
  const height = format === "story" ? STORY_H : SQUARE_H;
  const maxRows = MAX_ROWS[format];
  const visibleItems = data.items.slice(0, maxRows);
  const truncatedCount = Math.max(0, data.items.length - maxRows);

  return (
    <div className="pointer-events-none fixed left-[-99999px] top-0" aria-hidden>
      <div
        ref={captureRef}
        style={{
          width,
          height,
          background: HEX.warmBg,
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          boxSizing: "border-box",
          padding: "36px 32px 28px",
          position: "relative",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- off-screen capture target, next/image can't run here */}
            <img src="/brand/tradule-logo.png" alt="" width={72} height={72} style={{ height: 32, width: "auto", display: "block", marginBottom: 14 }} />
            <p style={{ margin: 0, fontSize: 30, fontWeight: 700, color: HEX.warmInk, lineHeight: 1.2 }}>{data.cityName || "여행"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 15, color: HEX.warmInk3 }}>
              {formatDateLabelShort(data.date)}
              {data.dayLabel ? ` · ${data.dayLabel}` : ""}
            </p>
          </div>
          {/* 도착 스탬프 — ScrapbookClient.tsx의 ArrivalStamp와 같은 언어(점선
              원 + 회전), 순수 인라인 스타일로 직접 재구현(그쪽은 Tailwind
              클래스라 이 오프스크린 렌더러에 그대로 못 씀). */}
          <div
            style={{
              width: 96,
              height: 96,
              flexShrink: 0,
              borderRadius: "50%",
              border: `2px dashed ${HEX.brand500}`,
              background: HEX.warmSurface,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(-10deg)",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: HEX.brand800, textTransform: "uppercase", letterSpacing: 0.5, maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.cityName || "TRADULE"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: HEX.brand700, marginTop: 2 }}>{formatDateLabelShort(data.date)}</span>
          </div>
        </div>

        {/* spot list — 시간표를 단순화한 리스트. 전체 시간대 그리드가 아니라
            실제 순서·시간·이름만 보여준다. */}
        <div style={{ marginTop: 28, flex: 1, minHeight: 0, overflow: "hidden" }}>
          {visibleItems.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : `1px dashed ${HEX.warmHairline}` }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: HEX.brand700,
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.order}
              </span>
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: HEX.warmInk3, width: 46 }}>{item.time}</span>
              <span style={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600, color: HEX.warmInk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
              </span>
            </div>
          ))}
          {truncatedCount > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: HEX.warmInk3 }}>+{truncatedCount}곳 더</p>
          )}
        </div>

        {/* footer */}
        <div style={{ borderTop: `1px solid ${HEX.warmHairline}`, paddingTop: 14, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: HEX.warmInk3, letterSpacing: 0.5 }}>tradule.co.kr</p>
        </div>
      </div>
    </div>
  );
}
