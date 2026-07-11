"use client";

import { useCallback, useEffect, useReducer } from "react";
import { createInitialState, deliveryDelay, simReducer } from "./sim";

const TICK_STEP_MS = 10;
const TICK_INTERVAL_MS = 20;

export function useSim(defaultN: number) {
  const [state, dispatch] = useReducer(simReducer, defaultN, createInitialState);

  const running = state.inFlight.length > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      dispatch({ type: "TICK", step: TICK_STEP_MS });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [running]);

  const setN = useCallback((n: number) => dispatch({ type: "SET_N", n }), []);
  const reset = useCallback((n: number) => dispatch({ type: "RESET", n }), []);

  /** Schedules one message through the simulated delivery model. */
  const send = useCallback(
    (from: number, to: number, type: string, payload?: unknown, label?: string) => {
      dispatch({ type: "SEND", from, to, msgType: type, payload, delay: deliveryDelay(), label });
    },
    []
  );

  return { state, running, setN, reset, send };
}
