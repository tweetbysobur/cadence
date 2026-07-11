export interface SimMessage {
  from: number;
  to: number;
  slot: number;
  type: string;
  payload?: unknown;
  sentAt: number;
  arrivesAt: number;
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

/** A validator is just an inbox now — display status is derived from the focus slot. */
export interface Validator {
  id: number;
  inbox: SimMessage[];
}

export interface Tally {
  yes: number[];
  no: number[];
}

export interface SlotState {
  slot: number;
  proposers: number[];
  deadlineAt: number;
  proposals: Proposal[];
  /** Tallies based only on votes that arrived at the observer's inbox. */
  votes: Record<number, Tally>;
  commitVotes: Record<string, number[]>;
  speculativeAt: number | null;
  finalAt: number | null;
  proposed: boolean;
  firstVoted: boolean;
  committed: boolean;
  keyPieces: number[];
  decrypted: boolean;
}

export interface Block {
  slot: number;
  txCount: number;
  specMs: number;
  finalMs: number;
}

export interface SimState {
  clock: number;
  tau: number;
  autoRun: boolean;
  /** Reserved for a future network-outage step; unused so far. */
  outage: boolean;
  validators: Validator[];
  slots: SlotState[];
  chain: Block[];
  /** Finalized blocks waiting for earlier slots to finalize first. */
  pending: Record<number, Block>;
  nextChainSlot: number;
  inFlight: SimMessage[];
  log: string[];
  /** Currently in-progress slot when Auto-Run is off; null when idle. */
  manualSlot: number | null;
  /** Conductor: the slot number and clock time for the next auto-propose. */
  nextSlotNumber: number;
  nextProposeAt: number;
}

/** The single validator whose inbox drives every slot's tallies. */
const OBSERVER_ID = 0;
const MAX_LOG = 200;
export const DEFAULT_TAU = 150;
const INITIAL_SLOT = 1;

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

/** f = floor((n-1)/3); quorum = n - f; rebuild = f + 1. */
export function deriveThresholds(n: number): Thresholds {
  const f = Math.floor((n - 1) / 3);
  return { f, quorum: n - f, rebuild: f + 1 };
}

/** A proposer can no longer reach quorum once this many "no" votes land. */
export function outThresholdFor(n: number): number {
  return n - deriveThresholds(n).quorum + 1;
}

/** Simulated network latency: 60ms +/- 30ms, i.e. uniform in [30, 90]ms. */
function jitter(): number {
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

export function createInitialState(n: number, tau: number = DEFAULT_TAU): SimState {
  return {
    clock: 0,
    tau,
    autoRun: false,
    outage: false,
    validators: Array.from({ length: n }, (_, id) => ({ id, inbox: [] })),
    slots: [],
    chain: [],
    pending: {},
    nextChainSlot: INITIAL_SLOT,
    inFlight: [],
    log: [],
    manualSlot: null,
    nextSlotNumber: INITIAL_SLOT,
    nextProposeAt: tau,
  };
}

export type SimAction =
  | { type: "SET_N"; n: number }
  | { type: "RESET" }
  | { type: "SET_TAU"; tau: number }
  | { type: "SET_AUTO_RUN"; on: boolean }
  | { type: "TICK"; step: number }
  | { type: "MANUAL_PROPOSE" }
  | { type: "MANUAL_FIRST_VOTE" }
  | { type: "MANUAL_COMMIT_VOTE" };

function pushLog(log: string[], line: string) {
  log.push(line);
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

function formatDelivery(m: SimMessage): string {
  const tag = `S${m.slot}`;
  if (m.type === "chunk") {
    const { id } = m.payload as ChunkPayload;
    return `[${m.arrivesAt}ms] ${tag} Proposer ${m.from} -> Validator ${m.to}: chunk (id ${id})`;
  }
  if (m.type === "vote") {
    const v = m.payload as VotePayload;
    return `[${m.arrivesAt}ms] ${tag} Validator ${m.from} -> Validator ${m.to}: vote proposer ${v.proposerId} (${v.type})`;
  }
  if (m.type === "commit") {
    const c = m.payload as CommitPayload;
    return `[${m.arrivesAt}ms] ${tag} Validator ${m.from} -> Validator ${m.to}: commit (digest ${c.digest})`;
  }
  return `[${m.arrivesAt}ms] ${tag} Validator ${m.from} -> Validator ${m.to}: ${m.type}`;
}

/** Creates a new slot: a proposal per proposer, split into N chunks each. */
function buildProposal(
  slotNum: number,
  n: number,
  clock: number,
  tau: number
): { slot: SlotState; messages: SimMessage[] } {
  const proposers = proposersForSlot(slotNum, n);
  const proposals: Proposal[] = proposers.map((proposerId) => {
    const txIds = Array.from({ length: 3 }, () => Math.random().toString(16).slice(2, 10));
    const id = shortHash(`${proposerId}:${txIds.join(",")}`);
    return { proposerId, id, txIds, locked: true };
  });

  const messages: SimMessage[] = [];
  for (const p of proposals) {
    for (let v = 0; v < n; v++) {
      messages.push({
        from: p.proposerId,
        to: v,
        slot: slotNum,
        type: "chunk",
        payload: { proposerId: p.proposerId, chunkIndex: v, id: p.id },
        sentAt: clock,
        arrivesAt: clock + jitter(),
      });
    }
  }

  const slot: SlotState = {
    slot: slotNum,
    proposers,
    deadlineAt: clock + tau,
    proposals,
    votes: {},
    commitVotes: {},
    speculativeAt: null,
    finalAt: null,
    proposed: true,
    firstVoted: false,
    committed: false,
    keyPieces: [],
    decrypted: false,
  };
  return { slot, messages };
}

/** Every validator votes per proposer based on its own inbox, broadcast to all. */
function buildFirstVotes(slotState: SlotState, validators: Validator[], n: number, clock: number): SimMessage[] {
  const messages: SimMessage[] = [];
  for (let voterId = 0; voterId < n; voterId++) {
    const inbox = validators[voterId].inbox;
    for (const proposerId of slotState.proposers) {
      const chunkMsg = inbox.find(
        (m) =>
          m.slot === slotState.slot &&
          m.type === "chunk" &&
          (m.payload as ChunkPayload).proposerId === proposerId &&
          m.arrivesAt <= slotState.deadlineAt
      );
      const vote: VotePayload = chunkMsg
        ? { type: "yes", proposerId, voterId, keyPiece: voterId, id: (chunkMsg.payload as ChunkPayload).id }
        : { type: "no", proposerId, voterId, keyPiece: voterId };
      for (let recipient = 0; recipient < n; recipient++) {
        messages.push({
          from: voterId,
          to: recipient,
          slot: slotState.slot,
          type: "vote",
          payload: vote,
          sentAt: clock,
          arrivesAt: clock + jitter(),
        });
      }
    }
  }
  return messages;
}

/** Every validator broadcasts a commit vote carrying its recorded included-set digest. */
function buildCommitVotes(slotState: SlotState, n: number, clock: number, quorum: number): SimMessage[] {
  const includedIds = slotState.proposers
    .filter((p) => (slotState.votes[p]?.yes.length ?? 0) >= quorum)
    .map((p) => slotState.proposals.find((pr) => pr.proposerId === p)?.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  const digest = shortHash(includedIds.join(","));

  const messages: SimMessage[] = [];
  for (let voterId = 0; voterId < n; voterId++) {
    for (let recipient = 0; recipient < n; recipient++) {
      messages.push({
        from: voterId,
        to: recipient,
        slot: slotState.slot,
        type: "commit",
        payload: { voterId, digest },
        sentAt: clock,
        arrivesAt: clock + jitter(),
      });
    }
  }
  return messages;
}

function tick(state: SimState, step: number): SimState {
  const clock = state.clock + step;
  const n = state.validators.length;
  const { quorum, rebuild } = deriveThresholds(n);

  let slots = state.slots.map((s) => ({
    ...s,
    votes: { ...s.votes },
    commitVotes: { ...s.commitVotes },
  }));
  let inFlight = state.inFlight.slice();
  let nextSlotNumber = state.nextSlotNumber;
  let nextProposeAt = state.nextProposeAt;
  const validators = state.validators.map((v) => ({ ...v, inbox: v.inbox.slice() }));
  const log = state.log.slice();
  let pending = state.pending;
  let nextChainSlot = state.nextChainSlot;
  let chain = state.chain;
  let manualSlot = state.manualSlot;

  // A) Conductor: auto-propose a new slot every tau, independent of earlier slots.
  if (state.autoRun) {
    let guard = 0;
    while (clock >= nextProposeAt && guard < 50) {
      const { slot, messages } = buildProposal(nextSlotNumber, n, nextProposeAt, state.tau);
      slots.push(slot);
      inFlight.push(...messages);
      nextSlotNumber += 1;
      nextProposeAt += state.tau;
      guard += 1;
    }
  }

  // B) Deliver every message whose arrival time has passed.
  const arrived = inFlight.filter((m) => m.arrivesAt <= clock);
  inFlight = inFlight.filter((m) => m.arrivesAt > clock);

  for (const m of arrived) {
    validators[m.to].inbox.push(m);
    pushLog(log, formatDelivery(m));

    if (m.to === OBSERVER_ID) {
      const slotState = slots.find((s) => s.slot === m.slot);
      if (slotState) {
        if (m.type === "vote") {
          const vote = m.payload as VotePayload;
          const bucket = slotState.votes[vote.proposerId] ?? { yes: [], no: [] };
          const alreadyCounted = bucket.yes.includes(vote.voterId) || bucket.no.includes(vote.voterId);
          if (!alreadyCounted) {
            const updated = { yes: bucket.yes.slice(), no: bucket.no.slice() };
            (vote.type === "yes" ? updated.yes : updated.no).push(vote.voterId);
            slotState.votes[vote.proposerId] = updated;
          }
          if (!slotState.keyPieces.includes(vote.keyPiece)) {
            slotState.keyPieces = [...slotState.keyPieces, vote.keyPiece];
          }
        }
        if (m.type === "commit") {
          const c = m.payload as CommitPayload;
          const alreadyCommitted = Object.values(slotState.commitVotes).some((voters) => voters.includes(c.voterId));
          if (!alreadyCommitted) {
            const bucket = slotState.commitVotes[c.digest] ?? [];
            slotState.commitVotes[c.digest] = [...bucket, c.voterId];
          }
        }
      }
    }
  }

  // C) Decryption + speculative finality (all first votes delivered to the observer).
  for (const slotState of slots) {
    if (!slotState.decrypted && slotState.keyPieces.length >= rebuild) {
      slotState.decrypted = true;
      pushLog(log, `[${clock}ms] S${slotState.slot} ${rebuild} key pieces collected — proposals decrypted`);
    }
    if (slotState.speculativeAt === null && slotState.firstVoted) {
      const totalVotes = slotState.proposers.reduce(
        (sum, p) => sum + (slotState.votes[p]?.yes.length ?? 0) + (slotState.votes[p]?.no.length ?? 0),
        0
      );
      if (totalVotes >= n * slotState.proposers.length) {
        slotState.speculativeAt = clock;
      }
    }
  }

  // D) Finalize: on quorum matching commit votes, build the block and retire the slot.
  const stillActive: SlotState[] = [];
  let newPending: Record<number, Block> | null = null;
  for (const slotState of slots) {
    let finalizedBlock: Block | null = null;
    for (const digest of Object.keys(slotState.commitVotes)) {
      if (slotState.commitVotes[digest].length >= quorum) {
        const includedProposers = slotState.proposers.filter((p) => (slotState.votes[p]?.yes.length ?? 0) >= quorum);
        const txSet = new Set<string>();
        for (const p of includedProposers) {
          const proposal = slotState.proposals.find((pr) => pr.proposerId === p);
          if (proposal) for (const tx of proposal.txIds) txSet.add(tx);
        }
        finalizedBlock = {
          slot: slotState.slot,
          txCount: txSet.size,
          specMs: (slotState.speculativeAt ?? clock) - slotState.deadlineAt,
          finalMs: clock - slotState.deadlineAt,
        };
        break;
      }
    }
    if (finalizedBlock) {
      pushLog(log, `[${clock}ms] S${slotState.slot} finalized. Included proposals merge into one block.`);
      if (!newPending) newPending = { ...pending };
      newPending[slotState.slot] = finalizedBlock;
      if (manualSlot === slotState.slot) manualSlot = null;
    } else {
      stillActive.push(slotState);
    }
  }
  slots = stillActive;
  if (newPending) pending = newPending;

  // E) Flush contiguous finalized blocks into the chain, in slot order.
  if (pending[nextChainSlot] !== undefined) {
    const newChain = chain.slice();
    const rest = { ...pending };
    while (rest[nextChainSlot] !== undefined) {
      newChain.push(rest[nextChainSlot]);
      delete rest[nextChainSlot];
      nextChainSlot += 1;
    }
    chain = newChain;
    pending = rest;
  }

  // F) Auto-Run: fire first votes at each slot's deadline, commit votes once speculatively final.
  if (state.autoRun) {
    for (let i = 0; i < slots.length; i++) {
      const slotState = slots[i];
      if (!slotState.firstVoted && clock >= slotState.deadlineAt) {
        const messages = buildFirstVotes(slotState, validators, n, clock);
        inFlight.push(...messages);
        slots[i] = { ...slotState, firstVoted: true };
      }
    }
    for (let i = 0; i < slots.length; i++) {
      const slotState = slots[i];
      if (slotState.speculativeAt !== null && !slotState.committed) {
        const messages = buildCommitVotes(slotState, n, clock, quorum);
        inFlight.push(...messages);
        slots[i] = { ...slotState, committed: true };
      }
    }
  }

  return {
    ...state,
    clock,
    slots,
    inFlight,
    validators,
    log,
    pending,
    chain,
    nextChainSlot,
    nextSlotNumber,
    nextProposeAt,
    manualSlot,
  };
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case "SET_N":
      return createInitialState(action.n, state.tau);
    case "RESET":
      return createInitialState(state.validators.length, state.tau);
    case "SET_TAU":
      return { ...state, tau: action.tau };
    case "SET_AUTO_RUN": {
      if (action.on === state.autoRun) return state;
      return {
        ...state,
        autoRun: action.on,
        slots: [],
        inFlight: [],
        manualSlot: null,
        nextProposeAt: action.on ? state.clock : state.nextProposeAt,
      };
    }
    case "MANUAL_PROPOSE": {
      if (state.autoRun || state.manualSlot !== null) return state;
      const n = state.validators.length;
      const slotNum = state.nextSlotNumber;
      const { slot, messages } = buildProposal(slotNum, n, state.clock, state.tau);
      return {
        ...state,
        slots: [...state.slots, slot],
        inFlight: [...state.inFlight, ...messages],
        nextSlotNumber: slotNum + 1,
        manualSlot: slotNum,
      };
    }
    case "MANUAL_FIRST_VOTE": {
      if (state.autoRun || state.manualSlot === null) return state;
      const idx = state.slots.findIndex((s) => s.slot === state.manualSlot);
      if (idx === -1) return state;
      const slotState = state.slots[idx];
      if (slotState.firstVoted || state.clock < slotState.deadlineAt) return state;
      const n = state.validators.length;
      const messages = buildFirstVotes(slotState, state.validators, n, state.clock);
      const slots = state.slots.slice();
      slots[idx] = { ...slotState, firstVoted: true };
      return { ...state, slots, inFlight: [...state.inFlight, ...messages] };
    }
    case "MANUAL_COMMIT_VOTE": {
      if (state.autoRun || state.manualSlot === null) return state;
      const idx = state.slots.findIndex((s) => s.slot === state.manualSlot);
      if (idx === -1) return state;
      const slotState = state.slots[idx];
      if (slotState.committed || slotState.speculativeAt === null) return state;
      const n = state.validators.length;
      const { quorum } = deriveThresholds(n);
      const messages = buildCommitVotes(slotState, n, state.clock, quorum);
      const slots = state.slots.slice();
      slots[idx] = { ...slotState, committed: true };
      return { ...state, slots, inFlight: [...state.inFlight, ...messages] };
    }
    case "TICK":
      return tick(state, action.step);
    default:
      return state;
  }
}
