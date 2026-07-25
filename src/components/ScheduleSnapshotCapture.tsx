"use client";

import { useEffect, useRef } from "react";
import type { SavedPlan, ItineraryItem } from "@/lib/types";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { colorForId } from "@/lib/placeStyle";
import { TIMELINE_HOURS, SLOT_HEIGHT, formatDateLabelShort, minutesFromTime, pad2 } from "@/lib/timeline";

const COLUMN_WIDTH = 220;
const GUTTER_WIDTH = 46;

/**
 * Renders a plan's whole schedule (every date it has stops on, all 24
 * hours each) completely off-screen and rasterizes it to a PNG via
 * html-to-image, then hands the data URL back — used to let a 여행 후기
 * attach a permanent snapshot photo of the plan it was written from, since
 * the plan itself can be deleted later while the post (and its uploaded
 * photos) lives on. Every color here is a plain inline hex string rather
 * than a Tailwind utility class specifically so this never needs the
 * oklch-to-rgb inlining workaround PlannerBoard's own "이미지로 저장"
 * capture requires (see that file's `inlineComputedColors`).
 */
export function ScheduleSnapshotCapture({
  plan,
  onCaptured,
  onError,
}: {
  plan: SavedPlan;
  onCaptured: (dataUrl: string) => void;
  onError: () => void;
}) {
  const captureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const capture = captureRef.current;
      if (!capture) return;
      // Let layout settle before html-to-image measures the DOM.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (cancelled) return;
      try {
        const { toPng } = await import("html-to-image");
        const dataUrl = await toPng(capture, { backgroundColor: "#ffffff", pixelRatio: 2 });
        if (!cancelled) onCaptured(dataUrl);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture exactly once per mount, driven by the parent remounting this via `key`/conditional render per plan
  }, []);

  const byDate = new Map<string, ItineraryItem[]>();
  for (const item of plan.items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  const dates = [...byDate.keys()].sort();
  const placeById = new Map(plan.places.map((p) => [p.id, p]));
  const width = Math.max(900, GUTTER_WIDTH + dates.length * COLUMN_WIDTH);

  return (
    <div className="pointer-events-none fixed left-[-99999px] top-0" aria-hidden>
      <div ref={captureRef} style={{ width, background: "#ffffff", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex" }}>
          <div style={{ width: GUTTER_WIDTH, flexShrink: 0 }} />
          {dates.map((date) => (
            <div
              key={date}
              style={{ width: COLUMN_WIDTH, flexShrink: 0, textAlign: "center", padding: "14px 8px", borderBottom: "1px solid #e2e8f0" }}
            >
              <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>{formatDateLabelShort(date)}</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>{(byDate.get(date) ?? []).length}개 장소</p>
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ width: GUTTER_WIDTH, flexShrink: 0 }}>
            {TIMELINE_HOURS.map((h) => (
              <div
                key={h}
                style={{
                  height: SLOT_HEIGHT,
                  fontSize: 10,
                  color: "#94a3b8",
                  textAlign: "right",
                  paddingRight: 6,
                  boxSizing: "border-box",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                {pad2(h)}:00
              </div>
            ))}
          </div>
          {dates.map((date) => {
            const items = [...(byDate.get(date) ?? [])].sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time));
            return (
              <div key={date} style={{ width: COLUMN_WIDTH, flexShrink: 0, position: "relative", borderLeft: "1px solid #f1f5f9" }}>
                {TIMELINE_HOURS.map((h) => (
                  <div key={h} style={{ height: SLOT_HEIGHT, borderTop: "1px solid #f1f5f9", boxSizing: "border-box" }} />
                ))}
                {items.map((item, i) => {
                  const place = placeById.get(item.placeId);
                  const color = place?.color ?? colorForId(item.placeId);
                  const icon = place?.icon ?? "pin";
                  const top = (minutesFromTime(item.time) / 60) * SLOT_HEIGHT;
                  const height = Math.max(24, (item.durationMinutes / 60) * SLOT_HEIGHT);
                  const roomy = item.durationMinutes >= 45;
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: 2,
                        right: 2,
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                        borderRadius: 8,
                        background: `${color}12`,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      <span style={{ alignSelf: "stretch", width: 4, background: color, flexShrink: 0 }} />
                      {roomy ? (
                        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, padding: "4px 6px" }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.name}
                          </p>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                            <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <PlaceGlyph icon={icon} size={9} color="white" />
                            </span>
                            <span style={{ fontSize: 9, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>
                              {item.time} · {item.durationMinutes}분
                            </span>
                            <span style={{ flexShrink: 0, borderRadius: 999, padding: "0 6px", fontSize: 9, fontWeight: 600, color: "white", background: color, lineHeight: "16px" }}>
                              #{i + 1}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "0 6px" }}>
                          <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <PlaceGlyph icon={icon} size={9} color="white" />
                          </span>
                          <p style={{ fontSize: 10, color: "#0f172a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>
                            <span style={{ fontWeight: 600 }}>{item.name}</span>{" "}
                            <span style={{ color: "#64748b" }}>
                              {item.time} · {item.durationMinutes}분
                            </span>
                          </p>
                          <span style={{ flexShrink: 0, borderRadius: 999, padding: "0 6px", fontSize: 9, fontWeight: 600, color: "white", background: color, lineHeight: "16px" }}>
                            #{i + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
