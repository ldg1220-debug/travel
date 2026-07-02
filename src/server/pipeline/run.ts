import { runTrendPipeline } from "./pipeline";

runTrendPipeline()
  .then((summary) => {
    console.log("[trend-pipeline] done:", summary);
  })
  .catch((err) => {
    console.error("[trend-pipeline] failed:", err);
    process.exitCode = 1;
  });
