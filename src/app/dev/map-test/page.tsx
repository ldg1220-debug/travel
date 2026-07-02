import { TestMap } from "@/components/map/TestMap";

/**
 * Manual QA harness for src/components/map/MapProvider.tsx — not linked
 * from any nav, just a direct URL to visually confirm Google/Kakao each
 * initialize independently (and to re-check once real
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_KAKAO_MAP_KEY values are
 * configured in a real deployment).
 */
export default function MapTestPage() {
  return (
    <div className="mx-auto max-w-xl space-y-8 p-6 font-sans">
      <h1 className="text-lg font-bold text-slate-900">Map provider test</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">provider=&quot;google&quot;</h2>
        <TestMap provider="google" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">provider=&quot;kakao&quot;</h2>
        <TestMap provider="kakao" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">region=&quot;international&quot; (resolves to google)</h2>
        <TestMap region="international" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">region=&quot;domestic&quot; (resolves to kakao)</h2>
        <TestMap region="domestic" />
      </section>
    </div>
  );
}
