import { notFound } from "next/navigation";
import { pool } from "@/lib/server/db";
import type { ItineraryItem } from "@/lib/types";
import { formatDateLabel } from "@/lib/timeline";

interface SharedItineraryRow {
  title: string;
  region: string;
  placesData: ItineraryItem[];
}

async function getSharedItinerary(id: string): Promise<SharedItineraryRow | null> {
  if (!/^\d+$/.test(id)) return null;
  const result = await pool.query(`select title, region, "placesData" from itineraries where id = $1`, [id]);
  return result.rows[0] ?? null;
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itinerary = await getSharedItinerary(id);
  if (!itinerary) notFound();

  const byDate = new Map<string, ItineraryItem[]>();
  for (const item of itinerary.placesData) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <main className="min-h-dvh bg-slate-100 flex justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          {itinerary.region === "domestic" ? "🇰🇷 국내" : "✈️ 해외"} · shared itinerary
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{itinerary.title}</h1>

        {dates.length === 0 ? (
          <p className="text-slate-500 text-sm mt-6">No stops scheduled yet.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {dates.map((date) => (
              <div key={date}>
                <div className="text-[13px] font-semibold text-slate-700 mb-2">{formatDateLabel(date)}</div>
                <div className="flex flex-col gap-2">
                  {byDate
                    .get(date)!
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200"
                      >
                        <span className="text-[13px] font-medium text-slate-900">{item.name}</span>
                        <span className="text-[12px] text-slate-500 tabular-nums">{item.time}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
