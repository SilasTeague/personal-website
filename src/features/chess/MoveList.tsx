"use client";

import { useEffect, useRef } from "react";
import styles from "./chess.module.css";

interface MoveListProps {
  sans: string[];
  /** Plies shown so far; also the highlighted entry during replay. */
  ply: number;
  /** Null while the game is live, since jumping around mid-game isn't allowed. */
  onSelectPly: ((ply: number) => void) | null;
}

export default function MoveList({ sans, ply, onSelectPly }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [ply]);

  // Group into full moves: [white, black?] per move number.
  const rows: { number: number; white?: string; black?: string }[] = [];
  sans.forEach((san, index) => {
    const row = Math.floor(index / 2);
    rows[row] ??= { number: row + 1 };
    if (index % 2 === 0) rows[row].white = san;
    else rows[row].black = san;
  });

  function entry(san: string | undefined, plyIndex: number) {
    if (!san) return <span className={styles.moveEmpty} />;
    const isActive = plyIndex + 1 === ply;
    return (
      <span
        ref={isActive ? (activeRef as React.Ref<HTMLSpanElement>) : undefined}
        className={`${styles.move} ${isActive ? styles.moveActive : ""} ${
          onSelectPly ? styles.moveClickable : ""
        }`}
        onClick={onSelectPly ? () => onSelectPly(plyIndex + 1) : undefined}
      >
        {san}
      </span>
    );
  }

  return (
    <ol ref={listRef} className={styles.moveList}>
      {rows.length === 0 && <li className={styles.moveListEmpty}>No moves yet</li>}
      {rows.map((row, index) => (
        <li key={row.number} className={styles.moveRow}>
          <span className={styles.moveNumber}>{row.number}.</span>
          {entry(row.white, index * 2)}
          {entry(row.black, index * 2 + 1)}
        </li>
      ))}
    </ol>
  );
}
