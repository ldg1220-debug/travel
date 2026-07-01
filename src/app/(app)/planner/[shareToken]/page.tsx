import { PlannerBoard } from "../PlannerBoard";

export default async function SharedPlannerPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <PlannerBoard shareToken={shareToken} />;
}
