import { TravelSchedulerBoard } from "../TravelSchedulerBoard";

export default async function SharedTravelSchedulerPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <TravelSchedulerBoard shareToken={shareToken} />;
}
