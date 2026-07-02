"use client";

import dynamic from "next/dynamic";
import type { Place } from "@/lib/types";

// @dnd-kit generates its aria-describedby ids from a module-level counter
// that isn't seeded the same way on the server vs. the client, so
// server-rendering this tree causes a hydration mismatch. It's also 100%
// interactive (map + drag/drop), so there's nothing worth prerendering —
// mount it client-only instead.
const TravelSchedulerApp = dynamic(
  () => import("./TravelSchedulerApp").then((m) => m.TravelSchedulerApp),
  { ssr: false, loading: () => <SchedulerSkeleton /> },
);

interface TravelSchedulerAppLoaderProps {
  internationalPlaces: Place[];
  domesticPlaces: Place[];
}

export function TravelSchedulerAppLoader(props: TravelSchedulerAppLoaderProps) {
  return <TravelSchedulerApp {...props} />;
}

function SchedulerSkeleton() {
  return (
    <div className="flex flex-col h-dvh w-full bg-white sm:max-w-[430px] sm:mx-auto sm:my-6 sm:h-[min(860px,90vh)] sm:rounded-[36px] sm:shadow-2xl sm:border sm:border-slate-200 overflow-hidden animate-pulse">
      <div className="h-1/2 bg-slate-100" />
      <div className="h-1/2 bg-slate-50 border-t border-slate-200" />
    </div>
  );
}
