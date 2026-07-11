"use client";

import { HoverStat } from "@/components/HoverStat";
import { ProposalChip } from "@/components/ProposalChip";
import { deriveThresholds } from "@/lib/sim";
import { useSim } from "@/lib/useSim";

const MIN_N = 4;
const MAX_N = 22;
const DEFAULT_N = 10;

export default function Home() {
  const { state, running, setN, reset, propose, firstVote, commitVote } = useSim(DEFAULT_N);
  const n = state.validators.length;
  const { f, quorum, rebuild } = deriveThresholds(n);
  const outThreshold = n - quorum + 1;
  const sliderFill = ((n - MIN_N) / (MAX_N - MIN_N)) * 100;

  const deadlineRemaining =
    state.deadlineAt !== null ? Math.max(0, state.deadlineAt - state.clock) : state.deadlineMs;
  const deadlinePassed = state.deadlineAt !== null && state.clock >= state.deadlineAt;
  const canPropose = state.proposals.length === 0;
  const canFirstVote = deadlinePassed && !state.votesCast;
  const canCommitVote = state.specAt !== null && !state.committed;

  return (
    <div className="mx-auto flex w-full max-w-[1150px] flex-1 flex-col gap-6 px-6 py-10">
      {/* Top row */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cadence</h1>
          <p className="mt-1 text-sm text-muted">BFT consensus protocol simulator</p>
        </div>

        <div className="flex w-full max-w-[260px] flex-col gap-2 sm:w-[260px]">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-soft">
            <span>Validators</span>
            <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-xs text-foreground">
              {n}
            </span>
          </div>
          <input
            type="range"
            className="cadence-slider"
            style={{ "--slider-fill": `${sliderFill}%` } as React.CSSProperties}
            min={MIN_N}
            max={MAX_N}
            step={1}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            aria-label="Number of validators"
          />
        </div>
      </div>

      {/* Header / stat bar */}
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-panel p-5 shadow-lg shadow-black/20">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Stat label="Slot" value={state.slot} />
          <Divider />
          <Stat label="Deadline" value={`${deadlineRemaining} ms`} />
          <Divider />
          <div className="flex items-center gap-2">
            <Stat label="Clock" value={`${state.clock} ms`} mono />
            <span
              aria-hidden
              className={`relative flex h-2 w-2 ${running ? "opacity-100" : "opacity-0"}`}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          </div>
          <Divider />
          <HoverStat
            label="Quorum"
            value={quorum}
            tooltip={`Quorum = N - f = ${quorum}. With N=${n} validators, up to f=(N-1)/3=${f} can be Byzantine. A quorum of matching votes finalizes a decision; any two quorums overlap in an honest validator. Add validators -> f grows -> quorum grows.`}
          />
          <Divider />
          <HoverStat
            label="Rebuild"
            value={rebuild}
            tooltip={`Rebuild = f + 1 = ${rebuild}. A proposal splits into N chunks; any ${rebuild} reconstruct it, so at least one honest chunk is always included even if f=${f} withhold. Bigger set -> bigger f -> more chunks needed.`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StageButton label="Propose" disabled={!canPropose} onClick={propose} />
          <StageButton label="First Vote" disabled={!canFirstVote} onClick={firstVote} />
          <StageButton label="Commit Vote" disabled={!canCommitVote} onClick={commitVote} />
          <button
            type="button"
            onClick={() => reset(n)}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:border-accent-border hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Validator cards */}
      <Panel title="Validators" subtitle={`${n} nodes · slot ${state.slot} proposers highlighted`}>
        <div className="flex flex-wrap gap-3">
          {state.validators.map((v) => {
            const isProposer = state.proposers.includes(v.id);
            const proposal = state.proposals.find((p) => p.proposerId === v.id);
            return (
              <div
                key={v.id}
                className={`flex min-w-[128px] flex-1 flex-col gap-2 rounded-xl border p-3.5 transition-colors ${
                  isProposer
                    ? "border-accent-border bg-accent-soft"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Validator {v.id}
                  </span>
                  {isProposer && (
                    <span className="rounded-full border border-accent-border bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Proposer
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full border border-border-soft bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted">
                    {v.status}
                  </span>
                  <span className="font-mono text-[11px] text-muted-soft">
                    inbox {v.inbox.length}
                  </span>
                </div>
                {proposal && (
                  <ProposalChip
                    id={proposal.id}
                    txIds={proposal.txIds}
                    decrypted={state.decrypted}
                    yes={state.tallies[proposal.proposerId]?.yes.length ?? 0}
                    no={state.tallies[proposal.proposerId]?.no.length ?? 0}
                    quorum={quorum}
                    outThreshold={outThreshold}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Network log */}
      <Panel title="Network Log" subtitle="Messages exchanged between validators">
        <div className="h-48 overflow-y-auto rounded-xl border border-border-soft bg-surface p-4">
          {state.log.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-soft">
              No messages yet.
            </p>
          ) : (
            <ul className="space-y-1.5 font-mono text-xs text-muted">
              {state.log.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* Chain */}
      <Panel title="Chain" subtitle="Finalized blocks">
        <div className="flex min-h-24 items-center gap-3 overflow-x-auto rounded-xl border border-border-soft bg-surface p-4">
          {state.chain.length === 0 ? (
            <p className="w-full text-center text-sm text-muted-soft">No finalized blocks yet.</p>
          ) : (
            state.chain.map((block, i) => (
              <div
                key={i}
                className="flex h-20 w-36 flex-shrink-0 flex-col justify-center gap-1 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-success"
              >
                <span className="text-xs font-semibold">Slot {block.slot}</span>
                <span className="font-mono text-[11px]">{block.txCount} tx</span>
                <span className="font-mono text-[10px] text-success/80">
                  spec: {block.specMs}ms
                </span>
                <span className="font-mono text-[10px] text-success/80">
                  final: {block.finalMs}ms
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-soft">
        {label}
      </span>
      <span className={`text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-8 w-px bg-border sm:block" />;
}

function StageButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        disabled
          ? "cursor-not-allowed rounded-lg border border-border-soft bg-surface/50 px-4 py-2 text-sm font-medium text-muted-soft opacity-60"
          : "rounded-lg border border-accent-border bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
      }
    >
      {label}
    </button>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-panel p-5 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <span className="text-xs text-muted-soft">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
