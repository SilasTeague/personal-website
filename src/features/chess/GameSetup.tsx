"use client";

import { useState } from "react";
import styles from "./chess.module.css";
import { TIME_CONTROLS, type ColorChoice, type TimeControlId } from "./protocol";

const COLOR_OPTIONS: { id: ColorChoice; label: string }[] = [
  { id: "white", label: "White" },
  { id: "black", label: "Black" },
  { id: "random", label: "Random" },
];

interface GameSetupProps {
  slotsFree: number;
  slotsTotal: number;
  connected: boolean;
  starting: boolean;
  onStart: (color: ColorChoice, timeControl: TimeControlId) => void;
}

export default function GameSetup({
  slotsFree,
  slotsTotal,
  connected,
  starting,
  onStart,
}: GameSetupProps) {
  const [color, setColor] = useState<ColorChoice>("random");
  const [timeControl, setTimeControl] = useState<TimeControlId>("5");

  const full = slotsFree <= 0;
  const inUse = slotsTotal - slotsFree;

  return (
    <div className={styles.setup}>
      <h1 className={styles.title}>Play Dahlia</h1>
      <p className={styles.subtitle}>
        Dahlia is the chess engine I wrote from scratch in C++. Pick a side and see how you do.
      </p>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>I play as</legend>
        <div className={styles.optionRow}>
          {COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${color === option.id ? styles.optionActive : ""}`}
              onClick={() => setColor(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Time control</legend>
        <div className={styles.optionRow}>
          {TIME_CONTROLS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${timeControl === option.id ? styles.optionActive : ""}`}
              onClick={() => setTimeControl(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        className={styles.startButton}
        disabled={!connected || full || starting}
        onClick={() => onStart(color, timeControl)}
      >
        {starting ? "Starting…" : "Start game"}
      </button>

      <p className={styles.slots}>
        {!connected
          ? "Connecting…"
          : full
            ? `All ${slotsTotal} boards are busy right now — try again in a few minutes.`
            : `${inUse} of ${slotsTotal} boards in use`}
      </p>
    </div>
  );
}
