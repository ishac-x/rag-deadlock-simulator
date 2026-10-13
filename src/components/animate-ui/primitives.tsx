"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * animate-ui style motion primitives.
 * Entrance and transition effects only. No hover motion anywhere.
 */

export function FadeScaleIn({
  children,
  duration = 0.25,
  className,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration, ease: "easeOut" }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      className={className}
    >
      {children}
    </motion.g>
  );
}

export function FadeIn({
  children,
  duration = 0.2,
  className,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: "linear" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function GrowLine({
  d,
  duration = 0.35,
  className,
  strokeWidth,
  markerEnd,
  strokeDasharray,
}: {
  d: string;
  duration?: number;
  className?: string;
  strokeWidth: number;
  markerEnd?: string;
  strokeDasharray?: string | undefined;
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      className={className}
      strokeWidth={strokeWidth}
      markerEnd={markerEnd}
      strokeDasharray={strokeDasharray}
      initial={{ pathLength: 0, opacity: 0.4 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration, ease: "easeOut" }}
    />
  );
}

export function PulseOnce({
  children,
  active,
  pulseKey,
  duration = 0.5,
}: {
  children: ReactNode;
  active: boolean;
  pulseKey: string | number;
  duration?: number;
}) {
  return (
    <motion.g
      key={`${pulseKey}-${active}`}
      initial={active ? { opacity: 0.35 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: "easeInOut" }}
    >
      {children}
    </motion.g>
  );
}
