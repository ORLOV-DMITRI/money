import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value, className, color, tone }: { value: number; className?: string; color?: string; tone?: "ok" | "warn" | "over" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const toneClass = tone === "over" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", !color && toneClass)} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Badge({ className, tone = "neutral", ...props }: React.ComponentProps<"span"> & { tone?: "neutral" | "good" | "bad" | "warn" | "primary" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-primary-soft text-income",
    bad: "bg-destructive-soft text-destructive",
    warn: "bg-warning-soft text-foreground",
    primary: "bg-primary-soft text-primary",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)} {...props} />;
}

export function IconBubble({ icon, color, className, size = "md" }: { icon: string; color?: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-8 text-base", md: "size-10 text-lg", lg: "size-14 text-2xl" };
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full", sizes[size], className)}
      style={{ background: color ? `color-mix(in oklch, ${color} 18%, transparent)` : "var(--muted)" }}
      aria-hidden
    >
      {icon}
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon: string; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

/** Сегментированный переключатель */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "default";
}) {
  return (
    <div role="tablist" className={cn("inline-flex w-full rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-lg px-3 font-medium transition-all",
            size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-input")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}
