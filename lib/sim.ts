export type ValidatorStatus = "Idle" | "Proposed" | "Voted" | "Committed";

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

export interface VotePayload {
  type: "yes" | "no";
  proposerId: number;
  voterId: number;
  /** The voter's share of the decryption key. */
  keyPiece: number;
  id?: string;
  chunk?: ChunkPayload;
}

export interface CommitPayload {
  voterId: number;
  /** Digest of the voter's recorded included-proposal set. */
  digest: string;
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

export interface Tally {
  yes: number[];
  no: number[];
}

export interface Block {
  slot: number;
  txCount: number;
  specMs: number;
  finalMs: number;
}

export interface SimState {
  slot: number;
  deadlineMs: number;
  deadlineAt: number | null;
  clock: number;
  validators: Validator[];
  proposers: number[];
  proposals: Proposal[];
  votesCast: boolean;
  tallies: Record<number, Tally>;
  keyPieces: number[];
  decrypted: boolean;
  specAt: number | null;
  committed: boolean;
  commitTally: Record<string, number[]>;
  inFlight: SimMessage[];
  log: string[];
  chain: Block[];
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

/** A proposer can no longer reach quorum once this many "no" votes land. */
export function outThresholdFor(n: number): number {
  return n - deriveThresholds(n).quorum + 1;
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

/** Fake Merkle root / digest: a short 4-hex-char id hashed from the input. */
export function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 4);
}

function freshValidators(n: number): Validator[] {
  return Array.from({ length: n }, (_, id) => ({ id, inbox: [], status: "Idle" as ValidatorStatus }));
}

export function createInitialState(n: number): SimState {
  return {
    slot: INITIAL_SLOT,
    deadlineMs: DEADLINE_MS,
    deadlineAt: null,
    clock: 0,
    validators: freshValidators(n),
    proposers: proposersForSlot(INITIAL_SLOT, n),
    proposals: [],
    votesCast: false,
    tallies: {},
    keyPieces: [],
    decrypted: false,
    specAt: null,
    committed: false,
    commitTally: {},
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
  | { type: "PROPOSE"; proposals: ProposalInput[] }
  | { type: "FIRST_VOTE" }
  | { type: "COMMIT_VOTE" };

function formatDelivery(m: SimMessage): string {
  if (m.type === "chunk") {
    const { id } = m.payload as ChunkPayload;
    return `[${m.arrivesAt}ms] Proposer ${m.from} -> Validator ${m.to}: chunk (id ${id})`;
  }
  if (m.type === "vote") {
    const v = m.payload as VotePayload;
    return `[${m.arrivesAt}ms] Validator ${m.from} -> Validator ${m.to}: vote proposer ${v.proposerId} (${v.type})`;
  }
  if (m.type === "commit") {
    const c = m.payload as CommitPayload;
    return `[${m.arrivesAt}ms] Validator ${m.from} -> Validator ${m.to}: commit (digest ${c.digest})`;
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
    case "FIRST_VOTE": {
      if (state.votesCast) return state;
      return {
        ...state,
        votesCast: true,
        validators: state.validators.map((v) => ({ ...v, status: "Voted" as ValidatorStatus })),
      };
    }
    case "COMMIT_VOTE": {
      if (state.committed) return state;
      return {
        ...state,
        committed: true,
        validators: state.validators.map((v) => ({ ...v, status: "Committed" as ValidatorStatus })),
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

      const tallies: Record<number, Tally> = {};
      for (const key of Object.keys(state.tallies)) {
        const t = state.tallies[Number(key)];
        tallies[Number(key)] = { yes: t.yes.slice(), no: t.no.slice() };
      }
      const keyPieces = state.keyPieces.slice();
      let decrypted = state.decrypted;

      const commitTally: Record<string, number[]> = {};
      for (const key of Object.keys(state.commitTally)) {
        commitTally[key] = state.commitTally[key].slice();
      }

      for (const m of arrived) {
        validators[m.to].inbox.push(m);
        log.push(formatDelivery(m));

        if (m.type === "vote") {
          const vote = m.payload as VotePayload;
          const bucket = tallies[vote.proposerId] ?? { yes: [], no: [] };
          const alreadyCounted = bucket.yes.includes(vote.voterId) || bucket.no.includes(vote.voterId);
          if (!alreadyCounted) {
            (vote.type === "yes" ? bucket.yes : bucket.no).push(vote.voterId);
          }
          tallies[vote.proposerId] = bucket;

          if (!keyPieces.includes(vote.keyPiece)) {
            keyPieces.push(vote.keyPiece);
          }
        }

        if (m.type === "commit") {
          const c = m.payload as CommitPayload;
          const alreadyCommitted = Object.values(commitTally).some((voters) => voters.includes(c.voterId));
          if (!alreadyCommitted) {
            const bucket = commitTally[c.digest] ?? [];
            bucket.push(c.voterId);
            commitTally[c.digest] = bucket;
          }
        }
      }

      const n = validators.length;
      const { quorum, rebuild } = deriveThresholds(n);
      const outThreshold = outThresholdFor(n);

      if (!decrypted && keyPieces.length >= rebuild) {
        decrypted = true;
        log.push(`[${clock}ms] ${rebuild} key pieces collected — proposals decrypted`);
      }

      let specAt = state.specAt;
      if (specAt === null && state.proposers.length > 0) {
        const allDecided = state.proposers.every((p) => {
          const t = tallies[p] ?? { yes: [], no: [] };
          return t.yes.length >= quorum || t.no.length >= outThreshold;
        });
        if (allDecided) specAt = clock;
      }

      let finalizedBlock: Block | null = null;
      for (const digest of Object.keys(commitTally)) {
        if (commitTally[digest].length >= quorum) {
          const includedProposers = state.proposers.filter((p) => (tallies[p]?.yes.length ?? 0) >= quorum);
          const txSet = new Set<string>();
          for (const p of includedProposers) {
            const proposal = state.proposals.find((pr) => pr.proposerId === p);
            if (proposal) for (const tx of proposal.txIds) txSet.add(tx);
          }
          finalizedBlock = {
            slot: state.slot,
            txCount: txSet.size,
            specMs: (specAt ?? clock) - (state.deadlineAt ?? clock),
            finalMs: clock - (state.deadlineAt ?? clock),
          };
          break;
        }
      }

      if (finalizedBlock) {
        log.push(`[${clock}ms] Slot ${state.slot} finalized. Included proposals merge into one block.`);
        const nextSlot = state.slot + 1;
        return {
          ...state,
          slot: nextSlot,
          clock,
          validators: freshValidators(n),
          proposers: proposersForSlot(nextSlot, n),
          proposals: [],
          votesCast: false,
          tallies: {},
          keyPieces: [],
          decrypted: false,
          specAt: null,
          committed: false,
          commitTally: {},
          deadlineAt: null,
          inFlight: [],
          log,
          chain: [...state.chain, finalizedBlock],
        };
      }

      return {
        ...state,
        clock,
        inFlight: stillInFlight,
        validators,
        log,
        tallies,
        keyPieces,
        decrypted,
        specAt,
        commitTally,
      };
    }
    default:
      return state;
  }
}
