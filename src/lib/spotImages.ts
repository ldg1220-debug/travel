import { SPOT_IMAGES, type SpotImage } from "@/data/spotImages";
import { allSpots } from "@/lib/discoverData";

/**
 * 고정 카드(큐레이션 스팟·지역 타일)의 자체 이미지 조회 — 작업지시서 2026-11-22 "사진 사용량" §1③.
 * 화면은 Google 사진 프록시를 부르지 않고 Wikimedia Commons 에서 고른 이미지를 쓴다. 이미지 없는 카드는 아이콘 타일로 남는다.
 */
export type { SpotImage };

export function spotImageFor(spotId: string): SpotImage | undefined {
  return SPOT_IMAGES[spotId];
}

/** 화면에 보이는 출처 표기 — "사진: 저작자 · 라이선스". */
export function spotImageCredit(img: SpotImage): string {
  return `사진: ${img.author || "Wikimedia Commons"} · ${img.license}`;
}

let regionIndex: Map<string, SpotImage> | null = null;

/**
 * 지역 이름(예: "경주", "서울", "도쿄")의 대표 이미지 — 그 지역에 속한 큐레이션 스팟 중 이미지가 있는 첫 곳.
 * 스팟의 region("경주 · 황남동", "일본 · 오사카")의 어느 조각이 지역 이름과 같을 때 맞는다. 없으면 undefined(아이콘).
 */
export function regionImageFor(label: string | null | undefined): SpotImage | undefined {
  const key = (label ?? "").trim();
  if (!key) return undefined;
  if (!regionIndex) {
    regionIndex = new Map();
    for (const scope of ["domestic", "overseas"] as const) {
      for (const s of allSpots(scope)) {
        const img = SPOT_IMAGES[s.id];
        if (!img) continue;
        for (const part of s.region.split(" · ")) if (!regionIndex.has(part)) regionIndex.set(part, img);
      }
    }
  }
  const hit = regionIndex.get(key);
  if (hit) return hit;
  // "서울특별시"·"제주특별자치도" 같은 긴 이름 — 앞부분이 같은 조각이 있으면 쓴다(두 글자 이상만).
  for (const [part, img] of regionIndex) if (part.length >= 2 && key.startsWith(part)) return img;
  return undefined;
}
