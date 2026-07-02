"use client";

import { useState } from "react";
import type { Place, Region } from "@/lib/types";

/**
 * Manual QA harness for src/app/api/places/search/route.ts — not linked
 * from any nav, just a direct URL to confirm Kakao Local (domestic) and
 * Google Places (international) both return usable name+address data.
 */
export default function SearchTestPage() {
  const [region, setRegion] = useState<Region>("domestic");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSearch() {
    console.log("검색 버튼 클릭됨, region:", region, "query:", query);
    const q = query.trim();
    if (!q) return;
    setStatus("loading");
    setErrorMessage("");
    try {
      const url = `/api/places/search?region=${region}&q=${encodeURIComponent(q)}`;
      console.log("fetch 호출 URL:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const data = (await res.json()) as { places: Place[] };
      console.log("[/api/places/search] response:", data);
      setPlaces(data.places);
      setStatus("idle");
    } catch (err) {
      console.error("[/api/places/search] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6 font-sans">
      <h1 className="text-lg font-bold text-slate-900">Places search test</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setRegion("domestic")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            region === "domestic" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          국내 (Kakao)
        </button>
        <button
          type="button"
          onClick={() => setRegion("international")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            region === "international" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          해외 (Google)
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="장소 이름을 입력하세요"
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={status === "loading"}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          검색
        </button>
      </div>

      {status === "loading" && <p className="text-sm text-slate-500">검색 중…</p>}
      {status === "error" && <p className="text-sm text-red-600">에러: {errorMessage}</p>}

      {places !== null && status === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">결과 {places.length}건</p>
          {places.length === 0 && <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>}
          {places.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{p.name}</p>
              <p className="mt-1 text-sm text-slate-500">{p.address ?? "주소 정보 없음"}</p>
              <p className="mt-1 text-xs text-slate-400">
                {p.category} · lat {p.lat.toFixed(4)}, lng {p.lng.toFixed(4)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
