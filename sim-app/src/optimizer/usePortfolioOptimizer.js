/* ============================================================
   REACT HOOK: usePortfolioOptimizer
   Manages background Web Worker instantiation, progress updates,
   cancellation, and fallback execution.
   ============================================================ */

import { useState, useRef, useCallback, useEffect } from "react";
import { runPortfolioOptimization } from "./optimizerCore.js";
import { DEFAULT_GOAL_RANKING } from "./simulationEngine.js";

export function usePortfolioOptimizer() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const workerRef = useRef(null);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      } catch {}
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => terminateWorker();
  }, [terminateWorker]);

  const cancelOptimization = useCallback(() => {
    terminateWorker();
    setIsOptimizing(false);
    setProgress(null);
  }, [terminateWorker]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
  }, []);

  const startOptimization = useCallback(
    ({ initialSim, goalRanking = DEFAULT_GOAL_RANKING, iterations = 300, onComplete }) => {
      terminateWorker();
      setIsOptimizing(true);
      setError(null);
      setResult(null);
      setProgress({
        progressPct: 2,
        iteration: 0,
        totalIterations: iterations,
        bestObjectiveScore: 0,
        bestSimScore: 0,
        bestMetrics: null,
        bestGoalScores: null,
      });

      try {
        const worker = new Worker(new URL("./optimizer.worker.js", import.meta.url), {
          type: "module",
        });
        workerRef.current = worker;

        worker.onmessage = (event) => {
          const { type, payload } = event.data || {};
          if (type === "PROGRESS_UPDATE") {
            setProgress(payload);
          } else if (type === "OPTIMIZATION_COMPLETE") {
            setProgress({
              progressPct: 100,
              iteration: payload.iterationsRun,
              totalIterations: payload.iterationsRun,
              bestObjectiveScore: payload.evaluation?.objectiveScore || 0,
              bestSimScore: payload.evaluation?.simScore || 0,
              bestMetrics: payload.evaluation?.metrics || null,
              bestGoalScores: payload.evaluation?.goalScores || null,
            });
            setResult(payload);
            setIsOptimizing(false);
            terminateWorker();
            if (onComplete) onComplete(payload);
          } else if (type === "OPTIMIZATION_ERROR") {
            setError(payload?.message || "Optimization failed");
            setIsOptimizing(false);
            terminateWorker();
          }
        };

        worker.onerror = () => {
          // Fallback to synchronous execution if module worker fails
          terminateWorker();
          setTimeout(() => {
            try {
              const res = runPortfolioOptimization({
                initialSim,
                goalRanking,
                iterations,
                onProgress: (p) => setProgress(p),
              });
              setResult(res);
              setIsOptimizing(false);
              if (onComplete) onComplete(res);
            } catch (e) {
              setError(e?.message || "Optimization failed");
              setIsOptimizing(false);
            }
          }, 30);
        };

        worker.postMessage({
          type: "START_OPTIMIZATION",
          payload: { initialSim, goalRanking, iterations },
        });
      } catch {
        // Fallback if Worker constructor throws
        setTimeout(() => {
          try {
            const res = runPortfolioOptimization({
              initialSim,
              goalRanking,
              iterations,
              onProgress: (p) => setProgress(p),
            });
            setResult(res);
            setIsOptimizing(false);
            if (onComplete) onComplete(res);
          } catch (e) {
            setError(e?.message || "Optimization failed");
            setIsOptimizing(false);
          }
        }, 30);
      }
    },
    [terminateWorker]
  );

  return {
    isOptimizing,
    progress,
    result,
    error,
    startOptimization,
    cancelOptimization,
    clearResult,
  };
}
