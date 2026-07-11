"use client";

import { useCallback, useEffect, useReducer } from "react";
import {
  ChunkPayload,
  createInitialState,
  deliveryDelay,
  shortHash,
  simReducer,
  VotePayload,
} from "./sim";

const TICK_STEP_MS = 10;
const TICK_INTERVAL_MS = 20;

export function useSim(defaultN: number) {
  const [state, dispatch] = useReducer(simReducer, defaultN, createInitialState);

  const deadlinePending = state.deadlineAt !== null && state.clock < state.deadlineAt;
  const running = state.inFlight.length > 0 || deadlinePending;

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

  /**
   * Each proposer simultaneously creates a proposal (3 fake tx ids, hashed
   * into a short id) and splits it into N chunks, one per validator, sent
   * through the delivery model.
   */
  const propose = useCallback(() => {
    if (state.proposals.length > 0) return;
    const n = state.validators.length;

    const proposals = state.proposers.map((proposerId) => {
      const txIds = Array.from({ length: 3 }, () => Math.random().toString(16).slice(2, 10));
      const id = shortHash(`${proposerId}:${txIds.join(",")}`);
      return { proposerId, id, txIds };
    });

    dispatch({ type: "PROPOSE", proposals });

    for (const { proposerId, id } of proposals) {
      for (let chunkIndex = 0; chunkIndex < n; chunkIndex++) {
        dispatch({
          type: "SEND",
          from: proposerId,
          to: chunkIndex,
          msgType: "chunk",
          payload: { proposerId, chunkIndex, id },
          delay: deliveryDelay(),
        });
      }
    }
  }, [state.proposals.length, state.proposers, state.validators.length]);

  /**
   * Every validator casts one vote per proposer based on its inbox (yes if
   * that proposer's chunk arrived before the deadline, no otherwise), each
   * carrying the voter's key piece, and broadcasts it to every validator.
   */
  const firstVote = useCallback(() => {
    if (state.votesCast) return;
    const n = state.validators.length;
    const deadlineAt = state.deadlineAt ?? Infinity;

    for (let voterId = 0; voterId < n; voterId++) {
      const inbox = state.validators[voterId].inbox;
      for (const proposerId of state.proposers) {
        const chunkMsg = inbox.find(
          (m) =>
            m.type === "chunk" &&
            (m.payload as ChunkPayload).proposerId === proposerId &&
            m.arrivesAt <= deadlineAt
        );
        const vote: VotePayload = chunkMsg
          ? {
              type: "yes",
              proposerId,
              voterId,
              keyPiece: voterId,
              id: (chunkMsg.payload as ChunkPayload).id,
              chunk: chunkMsg.payload as ChunkPayload,
            }
          : { type: "no", proposerId, voterId, keyPiece: voterId };

        for (let recipient = 0; recipient < n; recipient++) {
          dispatch({
            type: "SEND",
            from: voterId,
            to: recipient,
            msgType: "vote",
            payload: vote,
            delay: deliveryDelay(),
          });
        }
      }
    }

    dispatch({ type: "FIRST_VOTE" });
  }, [state.votesCast, state.validators, state.proposers, state.deadlineAt]);

  return { state, running, setN, reset, send, propose, firstVote };
}
