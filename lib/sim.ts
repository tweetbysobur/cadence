export type ValidatorStatus = "Idle";

export interface SimMessage {
  from: number;
  to: number;
  type: string;
  payload?: unknown;
  sentAt: number;
  arrivesAt: number;
  label?: string;
}

export interface Validator {
  id: number;
  inbox: SimMessage[];
  status: ValidatorStatus;
}

export interface SimState {
  slot: number;
  deadlineMs: number;
  clock: number;
  validators: Validator[];
  proposers: number[];
  inFlight: SimMessage[];
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

/**
 * Simulated network latency: 60ms +/- 30ms, i.e. uniform in [30, 90]ms.
 * Called at the call site (action creators), never inside the reducer,
 * so the reducer stays a pure function of (state, action).
 */
export function deliveryDelay(): number {
  return Math.round(60 + (Math.random() * 2 - 1) * 30);
}

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
    inFlight: [],
    log: [],
    chain: [],
  };
}

export type SimAction =
  | { type: "SET_N"; n: number }
  | { type: "RESET"; n: number }
  | { type: "SEND"; from: number; to: number; msgType: string; payload?: unknown; delay: number; label?: string }
  | { type: "TICK"; step: number };

function formatDelivery(m: SimMessage): string {
  return `[${m.arrivesAt}ms] Validator ${m.from} -> Validator ${m.to}: ${m.type}`;
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "SET_N":
      return createInitialState(action.n);
    case "RESET":
      return createInitialState(action.n);
    case "SEND": {
      const sentAt = state.clock;
      const message: SimMessage = {
        from: action.from,
        to: action.to,
        type: action.msgType,
        payload: action.payload,
        sentAt,
        arrivesAt: sentAt + action.delay,
        label: action.label,
      };
      return { ...state, inFlight: [...state.inFlight, message] };
    }
    case "TICK": {
      const clock = state.clock + action.step;
      const arrived = state.inFlight.filter((m) => m.arrivesAt <= clock);
      if (arrived.length === 0) {
        return { ...state, clock };
      }
      const stillInFlight = state.inFlight.filter((m) => m.arrivesAt > clock);
      const validators = state.validators.map((v) => ({ ...v, inbox: v.inbox.slice() }));
      const log = state.log.slice();
      for (const m of arrived) {
        validators[m.to].inbox.push(m);
        log.push(formatDelivery(m));
      }
      return { ...state, clock, inFlight: stillInFlight, validators, log };
    }
    default:
      return state;
  }
}
