"use client";

import Link from "next/link";
import type { Insight } from "@/lib/analytics/insights";
import { cn } from "@/lib/utils";

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="grid gap-2">
      {insights.map((i) => {
        const body = (
          <>
            <span className="text-xl leading-none" aria-hidden>
              {i.icon}
            </span>
            <span className="text-sm leading-snug">{i.text}</span>
          </>
        );
        const cls = cn(
          "flex items-start gap-3 rounded-xl border-l-4 bg-muted/60 p-3",
          i.tone === "good" && "border-l-income",
          i.tone === "bad" && "border-l-destructive",
          i.tone === "neutral" && "border-l-primary/40",
        );
        return (
          <li key={i.id}>
            {i.href ? (
              <Link href={i.href} className={cn(cls, "transition-colors hover:bg-muted")}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
