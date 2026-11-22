/* ============================================================
   AI PORTFOLIO OPTIMIZER WEB WORKER
   Executes multi-rollout evolutionary optimization off the
   React main thread and streams live progress updates.
   ============================================================ */

import { runPortfolioOptimization } from "./optimizerCore.js";

self.onmessage = (event) => {
  const { type, payload } = event.data || {};
  if (type !== "START_OPTIMIZATION" || !payload?.initialSim) return;

  try {
    const { initialSim, goalRanking, iterations = 300, optimizeFor = "ranked" } = payload;

    const result = runPortfolioOptimization({
      initialSim,
      goalRanking,
      iterations,
      optimizeFor,
      onProgress: (prog) => {
        self.postMessage({
          type: "PROGRESS_UPDATE",
          payload: prog,
        });
      },
    });

    self.postMessage({
      type: "OPTIMIZATION_COMPLETE",
      payload: result,
    });
  } catch (err) {
    self.postMessage({
      type: "OPTIMIZATION_ERROR",
      payload: {
        message: err?.message || "Optimization failed",
      },
    });
  }
};
