export type ValidatorStatus = "Idle";

export interface Validator {
  id: number;
  inbox: unknown[];
  status: ValidatorStatus;
}

export interface SimState {
  slot: number;
  deadlineMs: number;
  clock: number;
  validators: Validator[];
  proposers: number[];
  log: string[];
  chain: unknown[];
}

/**
 * Proposers rotate by one validator per slot: slot 1 -> [0,1,2],
 * slot 2 -> [1,2,3], wrapping mod n.
 */
export function proposersForSlot(slot: number, n: number): number[] {
  const offset = (slot - 1) % n;
  return [0, 1, 2].map((k) => (offset + k) % n);
}

export interface Thresholds {
  f: number;
  quorum: number;
  rebuild: number;
}

/**
 * f = floor((n-1)/3); quorum = n - f; rebuild = f + 1.
 */
export function deriveThresholds(n: number): Thresholds {
  const f = Math.floor((n - 1) / 3);
  return { f, quorum: n - f, rebuild: f + 1 };
}

const DEADLINE_MS = 150;
const INITIAL_SLOT = 1;

export function createInitialState(n: number): SimState {
  return {
    slot: INITIAL_SLOT,
    deadlineMs: DEADLINE_MS,
    clock: 0,
    validators: Array.from({ length: n }, (_, id) => ({
      id,
      inbox: [],
      status: "Idle",
    })),
    proposers: proposersForSlot(INITIAL_SLOT, n),
    log: [],
    chain: [],
  };
}

export type SimAction = { type: "SET_N"; n: number } | { type: "RESET"; n: number };

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "SET_N":
      return createInitialState(action.n);
    case "RESET":
      return createInitialState(action.n);
    default:
      return state;
  }
}
