"use client";

import { useRef, useState } from "react";

const TOOLTIP_TEXT =
  "The transactions are hashed into this id, then split into chunks — each chunk can be verified against the hash.";

export function ProposalChip({
  id,
  txIds,
  decrypted,
  yes,
  no,
  quorum,
  outThreshold,
}: {
  id: string;
  txIds: string[];
  decrypted: boolean;
  yes: number;
  no: number;
  quorum: number;
  outThreshold: number;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 8, left: rect.left });
  };
  const hide = () => setPos(null);

  const hasQuorum = yes >= quorum;
  const isOut = !hasQuorum && no >= outThreshold;

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          decrypted
            ? "border-success/40 bg-success-soft text-success"
            : "border-accent-border bg-accent-soft text-accent"
        }`}
      >
        {decrypted ? "decrypted" : "encrypted"}
      </span>
      <span className="text-[11px] text-muted-soft">
        <span
          ref={triggerRef}
          tabIndex={0}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className="cursor-help border-b border-dotted border-muted-soft text-foreground"
        >
          proposal
        </span>{" "}
        id <span className="font-mono text-foreground">{id}</span>
      </span>

      <span className="flex items-center gap-1.5 font-mono text-[11px]">
        <span className="text-success">yes {yes}</span>
        <span className="text-muted-soft">/</span>
        <span className="text-muted-soft">no {no}</span>
        {hasQuorum && (
          <span className="ml-0.5 inline-flex items-center rounded-full border border-success/40 bg-success-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">
            ✓ quorum
          </span>
        )}
        {isOut && (
          <span className="ml-0.5 inline-flex items-center rounded-full border border-border-soft bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-soft">
            out
          </span>
        )}
      </span>

      {decrypted && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {txIds.map((tx) => (
            <span key={tx} className="font-mono text-[10px] text-muted-soft">
              tx {tx}
            </span>
          ))}
        </div>
      )}

      {pos && (
        <div
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-72 rounded-lg border border-border bg-surface p-3.5 text-xs leading-relaxed text-muted shadow-2xl shadow-black/50"
        >
          {TOOLTIP_TEXT}
        </div>
      )}
    </div>
  );
}
