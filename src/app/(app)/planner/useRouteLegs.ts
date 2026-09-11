"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRouteLegs, type RouteLegResult } from "@/lib/api";

export interface RouteLegStop {
  /** 캐시 키 성분 — 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §3 ★: "(출발 placeId, 도착 placeId, 모드)로 캐시"(모드는 서버가 좌표로 정하므로 여기선 두 placeId만 있으면 된다 — fetchLegRoute 주석 참고). */
  placeId: string;
  lat: number;
  lng: number;
}

const DEBOUNCE_MS = 800;
const NO_ROUTE_RESULT: RouteLegResult = { distanceM: null, durationMin: null, path: null };

/** 인접한 두 스톱의 캐시 키 — (출발 placeId, 도착 placeId) 순서 그대로. */
export function routeLegKey(a: Pick<RouteLegStop, "placeId">, b: Pick<RouteLegStop, "placeId">): string {
  return `${a.placeId}>${b.placeId}`;
}

/** 순서대로 인접한 스톱 쌍을 만든다 — 순수 함수라 단위 테스트하기 쉽다. */
export function adjacentPairs<T>(stops: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i + 1 < stops.length; i++) pairs.push([stops[i], stops[i + 1]]);
  return pairs;
}

/**
 * 아직 확인되지 않은(캐시에도 없고 진행 중도 아닌) 쌍만 골라낸다 —
 * 작업지시서 §3 ★ "바뀐 구간만 다시 조회 / 같은 쌍은 재사용"을 명시적인
 * old/new 목록 비교 없이 만족시킨다: 스케줄을 재배열해도 그대로인
 * 구간은 이미 알려진 키라 다시 안 부르고, 새로 생긴 인접 쌍(보통 옮긴
 * 스톱 앞뒤 2개)만 걸러져 자연스럽게 "바뀐 구간만" 조회된다.
 */
export function missingPairs(
  pairs: [RouteLegStop, RouteLegStop][],
  isKnown: (key: string) => boolean,
): [RouteLegStop, RouteLegStop][] {
  return pairs.filter(([a, b]) => !isKnown(routeLegKey(a, b)));
}

/**
 * 일정에서 인접한 스톱 쌍마다 실제 경로(/api/routes)를 구해 캐시한다 —
 * 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §3 ★ "호출을 아끼는
 * 규칙": 드래그 중(빠르게 바뀌는 동안)엔 부르지 않도록 800ms 디바운스를
 * 두고, 한 번 확인한(또는 조회 중인) (출발,도착) 쌍은 다시 조회하지
 * 않는다. 캐시·진행중 여부를 ref가 아니라 state로 들고 있다 — 렌더 중에
 * ref.current를 읽으면 안 된다는 규칙(react-hooks/refs) 때문이기도
 * 하고, 애초에 "캐시가 바뀌면 다시 렌더돼야" 새 결과가 지도/타임라인에
 * 반영되므로 자연스러운 선택이다. setTimeout 핸들만 ref로 둔다 — 그건
 * 렌더 중에 읽지 않고 effect 안에서만 쓴다.
 */
export function useRouteLegs(stops: RouteLegStop[]): Map<string, RouteLegResult> {
  const [results, setResults] = useState<Map<string, RouteLegResult>>(new Map());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pairs = adjacentPairs(stops);
  const missing = missingPairs(pairs, (key) => results.has(key) || pendingKeys.has(key));
  const missingKey = missing.map(([a, b]) => routeLegKey(a, b)).join("|");

  useEffect(() => {
    if (missing.length === 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const toFetch = missing; // 디바운스가 걸린 시점의 목록 그대로 — 클로저
      const keys = toFetch.map(([a, b]) => routeLegKey(a, b));
      setPendingKeys((prev) => new Set([...prev, ...keys]));
      fetchRouteLegs(toFetch.map(([a, b]) => ({ fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng })))
        .then((fetched) => {
          setResults((prev) => {
            const next = new Map(prev);
            toFetch.forEach(([a, b], i) => next.set(routeLegKey(a, b), fetched[i] ?? NO_ROUTE_RESULT));
            return next;
          });
          setPendingKeys((prev) => {
            const next = new Set(prev);
            keys.forEach((k) => next.delete(k));
            return next;
          });
        })
        .catch(() => {
          setPendingKeys((prev) => {
            const next = new Set(prev);
            keys.forEach((k) => next.delete(k));
            return next;
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missingKey가 실제 의존값(아직 안 구한 쌍들의 안정적인 문자열 서명)이다. missing/stops를 그대로 넣으면 매 렌더 재실행된다.
  }, [missingKey]);

  const result = new Map<string, RouteLegResult>();
  for (const [a, b] of pairs) {
    const cached = results.get(routeLegKey(a, b));
    if (cached) result.set(routeLegKey(a, b), cached);
  }
  return result;
}
