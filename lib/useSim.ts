"use client";

import { useCallback, useEffect, useReducer } from "react";
import { createInitialState, DEFAULT_TAU, simReducer } from "./sim";

const TICK_STEP_MS = 10;
const TICK_INTERVAL_MS = 20;

export function useSim(defaultN: number) {
  const [state, dispatch] = useReducer(simReducer, defaultN, (n) => createInitialState(n, DEFAULT_TAU));

  // Keep ticking whenever there's a conductor running or any slot still in progress.
  const running = state.autoRun || state.inFlight.length > 0 || state.slots.length > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      dispatch({ type: "TICK", step: TICK_STEP_MS });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running]);

  const setN = useCallback((n: number) => dispatch({ type: "SET_N", n }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const setTau = useCallback((tau: number) => dispatch({ type: "SET_TAU", tau }), []);
  const setAutoRun = useCallback((on: boolean) => dispatch({ type: "SET_AUTO_RUN", on }), []);
  const setOutage = useCallback((on: boolean) => dispatch({ type: "SET_OUTAGE", on }), []);
  const armFaultyProposer = useCallback(() => dispatch({ type: "ARM_FAULTY_PROPOSER" }), []);
  const manualPropose = useCallback(() => dispatch({ type: "MANUAL_PROPOSE" }), []);
  const manualFirstVote = useCallback(() => dispatch({ type: "MANUAL_FIRST_VOTE" }), []);
  const manualCommitVote = useCallback(() => dispatch({ type: "MANUAL_COMMIT_VOTE" }), []);

  return {
    state,
    running,
    setN,
    reset,
    setTau,
    setAutoRun,
    setOutage,
    armFaultyProposer,
    manualPropose,
    manualFirstVote,
    manualCommitVote,
  };
}
