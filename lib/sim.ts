export type ValidatorStatus = "Idle" | "Proposed";

export interface SimMessage {
  from: number;
  to: number;
  type: string;
  payload?: unknown;
  sentAt: number;
  arrivesAt: number;
  label?: string;
}

export interface ChunkPayload {
  proposerId: number;
  chunkIndex: number;
  id: string;
}

export interface Proposal {
  proposerId: number;
  id: string;
  txIds: string[];
  locked: true;
}

export interface Validator {
  id: number;
  inbox: SimMessage[];
  status: ValidatorStatus;
}

export interface SimState {
  slot: number;
  deadlineMs: number;
  deadlineAt: number | null;
  clock: number;
  validators: Validator[];
  proposers: number[];
  proposals: Proposal[];
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

/** Fake Merkle root: a short 4-hex-char id hashed from the proposer + tx ids. */
export function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 4);
}

export function createInitialState(n: number): SimState {
  return {
    slot: INITIAL_SLOT,
    deadlineMs: DEADLINE_MS,
    deadlineAt: null,
    clock: 0,
    validators: Array.from({ length: n }, (_, id) => ({
      id,
      inbox: [],
      status: "Idle",
    })),
    proposers: proposersForSlot(INITIAL_SLOT, n),
    proposals: [],
    inFlight: [],
    log: [],
    chain: [],
  };
}

export interface ProposalInput {
  proposerId: number;
  id: string;
  txIds: string[];
}

export type SimAction =
  | { type: "SET_N"; n: number }
  | { type: "RESET"; n: number }
  | { type: "SEND"; from: number; to: number; msgType: string; payload?: unknown; delay: number; label?: string }
  | { type: "TICK"; step: number }
  | { type: "PROPOSE"; proposals: ProposalInput[] };

function formatDelivery(m: SimMessage): string {
  if (m.type === "chunk") {
    const { id } = m.payload as ChunkPayload;
    return `[${m.arrivesAt}ms] Proposer ${m.from} -> Validator ${m.to}: chunk (id ${id})`;
  }
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
    case "PROPOSE": {
      if (state.proposals.length > 0) return state;
      const proposerIds = new Set(action.proposals.map((p) => p.proposerId));
      const validators = state.validators.map((v) =>
        proposerIds.has(v.id) ? { ...v, status: "Proposed" as ValidatorStatus } : v
      );
      const proposals = action.proposals.map((p) => ({ ...p, locked: true as const }));
      return {
        ...state,
        validators,
        proposals: [...state.proposals, ...proposals],
        deadlineAt: state.clock + state.deadlineMs,
      };
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
