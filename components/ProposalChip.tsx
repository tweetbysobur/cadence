"use client";

import { useRef, useState } from "react";

const TOOLTIP_TEXT =
  "The transactions are hashed into this id, then split into chunks — each chunk can be verified against the hash.";

export function ProposalChip({ id }: { id: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 8, left: rect.left });
  };
  const hide = () => setPos(null);

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <span className="inline-flex items-center rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
        encrypted
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
