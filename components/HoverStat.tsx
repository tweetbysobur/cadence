"use client";

import { ReactNode } from "react";

export function HoverStat({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: ReactNode;
  tooltip: string;
}) {
  return (
    <div className="group relative flex cursor-help flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-soft">
        {label}
      </span>
      <span className="border-b border-dotted border-muted-soft text-sm font-semibold text-foreground">
        {value}
      </span>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 w-72 -translate-x-1/2 rounded-lg border border-border bg-surface p-3.5 text-xs leading-relaxed text-muted opacity-0 shadow-2xl shadow-black/50 transition-all duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-surface" />
        {tooltip}
      </div>
    </div>
  );
}
