import type { ButtonHTMLAttributes, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the simulator.
 * Constraints: no gradients, no box shadows, no colored borders, no hover motion.
 */

type IconSvg = Parameters<typeof HugeiconsIcon>[0]["icon"];

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconSvg;
  active?: boolean;
  tone?: "default" | "strong";
}

export function ToolButton({
  icon,
  active = false,
  tone = "default",
  className,
  children,
  ...props
}: ToolButtonProps) {
  return (
    <button
      type="button"
      data-active={active || undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2",
        "text-sm font-medium transition-colors duration-150 outline-none",
        "disabled:opacity-45 disabled:pointer-events-none",
        active
          ? "bg-tool-active text-tool-active-foreground hover:bg-tool-active"
          : tone === "strong"
            ? "bg-surface-strong text-foreground hover:bg-muted"
            : "bg-surface text-foreground hover:bg-muted",
        "focus-visible:bg-muted",
        className,
      )}
      {...props}
    >
      {icon ? <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} /> : null}
      {children}
    </button>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border px-4 py-3", className)}>
      <h2 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export type BadgeTone = "neutral" | "danger" | "safe" | "checking";

export function StatusBadge({
  tone,
  icon,
  children,
}: {
  tone: BadgeTone;
  icon?: IconSvg;
  children: ReactNode;
}) {
  const toneClass: Record<BadgeTone, string> = {
    neutral: "bg-state-neutral text-state-neutral-foreground",
    danger: "bg-state-danger text-state-danger-foreground",
    safe: "bg-state-safe text-state-safe-foreground",
    checking: "bg-state-checking text-state-checking-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5",
        "text-sm font-medium",
        toneClass[tone],
      )}
    >
      {icon ? <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} /> : null}
      {children}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-strong px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}
