"use client";

import styles from "./chess.module.css";

/** Below this the clock switches to tenths, the way chess.com does. */
const URGENT_MS = 20_000;

interface ClockProps {
  /** Remaining milliseconds, or null for an untimed game. */
  ms: number | null;
  label: string;
  running: boolean;
}

export default function Clock({ ms, label, running }: ClockProps) {
  const classes = [styles.clock];
  if (running) classes.push(styles.clockRunning);
  if (ms !== null && ms <= URGENT_MS) classes.push(styles.clockUrgent);

  return (
    <div className={classes.join(" ")}>
      <span className={styles.clockLabel}>{label}</span>
      <span className={styles.clockTime}>{ms === null ? "∞" : formatClock(ms)}</span>
    </div>
  );
}

export function formatClock(ms: number) {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (clamped <= URGENT_MS) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
