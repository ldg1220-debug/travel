import { TravelSchedulerAppLoader } from "@/components/TravelSchedulerAppLoader";
import { getTrendingPlaces } from "@/lib/server/getTrendingPlaces";
import { DOMESTIC_PLACES } from "@/lib/mockPlacesDomestic";

// ISR: rebuild this page's data at most once an hour, so the curated
// trend list is served instantly without hitting the Places APIs per visit.
export const revalidate = 3600;

export default async function Home() {
  const internationalPlaces = await getTrendingPlaces();

  return (
    <main className="h-dvh w-full flex items-stretch justify-center bg-slate-200 sm:items-center">
      <TravelSchedulerAppLoader
        internationalPlaces={internationalPlaces}
        domesticPlaces={DOMESTIC_PLACES}
      />
    </main>
  );
}
