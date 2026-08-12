"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import styles from "./chess.module.css";
import type { PlayerColor, PromotionPiece } from "./protocol";

/** Pointer travel below this counts as a click rather than a drag. */
const DRAG_THRESHOLD_PX = 5;

interface BoardProps {
  fen: string;
  orientation: PlayerColor;
  /** Squares of the move just played, highlighted in yellow. */
  lastMove: { from: Square; to: Square } | null;
  /** False while the engine is thinking, or when reviewing a finished game. */
  interactive: boolean;
  playerColor: PlayerColor;
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => void;
}

/**
 * Every piece of interaction state is stamped with the position it belongs to.
 * A new position therefore invalidates a stale selection or half-finished drag
 * by derivation, with no effect needed to clean it up.
 */
interface Stamped {
  fen: string;
}

interface Selection extends Stamped {
  square: Square;
}

interface DragStart extends Stamped {
  square: Square;
  x0: number;
  y0: number;
  /** Whether the square was already selected when this drag began. */
  wasSelected: boolean;
}

interface PendingPromotion extends Stamped {
  from: Square;
  to: Square;
}

export default function Board({
  fen,
  orientation,
  lastMove,
  interactive,
  playerColor,
  onMove,
}: BoardProps) {
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);

  const selected = selection?.fen === fen && interactive ? selection.square : null;
  const promotion = pendingPromotion?.fen === fen ? pendingPromotion : null;
  const drag = dragStart?.fen === fen && interactive ? dragStart : null;

  // board() yields ranks 8->1 and files a->h, which is already the visual order
  // for white; black just reads it backwards.
  const cells = useMemo(() => {
    const flat = chess.board().flat();
    return orientation === "white" ? flat : [...flat].reverse();
  }, [chess, orientation]);

  const legalMoves = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected]
  );

  /** Destination square -> whether landing there is a capture. */
  const destinations = useMemo(() => {
    const map = new Map<Square, boolean>();
    for (const move of legalMoves) {
      map.set(move.to, (map.get(move.to) ?? false) || move.captured !== undefined);
    }
    return map;
  }, [legalMoves]);

  const checkedKing = useMemo(() => {
    if (!chess.isCheck()) return null;
    const turn = chess.turn();
    return (
      chess
        .board()
        .flat()
        .find((cell) => cell?.type === "k" && cell.color === turn)?.square ?? null
    );
  }, [chess]);

  /** The square under a viewport point, or null if the point is off the board. */
  const squareAt = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const rect = boardEl?.getBoundingClientRect();
      if (!rect) return null;
      const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
      const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;

      // cells is already flipped for the orientation, so index it directly; the
      // fallback covers empty squares, which carry no square name of their own.
      const visualIndex = row * 8 + col;
      return (
        cells[visualIndex]?.square ?? indexToSquare(boardIndex(visualIndex, orientation))
      );
    },
    [boardEl, cells, orientation]
  );

  /** Play from->to if legal, deferring to the promotion picker when needed. */
  const attemptMove = useCallback(
    (from: Square, to: Square, moves: Move[]) => {
      const match = moves.find((move) => move.from === from && move.to === to);
      if (!match) return false;
      if (match.promotion) {
        setPendingPromotion({ from, to, fen });
        return true;
      }
      onMove(from, to);
      setSelection(null);
      return true;
    },
    [fen, onMove]
  );

  function handlePointerDown(event: React.PointerEvent, square: Square) {
    if (!interactive || promotion) return;

    // Finishing a click-click move wins over selecting a new piece, so
    // captures behave the same as moves to an empty square.
    if (selected && destinations.has(square)) {
      attemptMove(selected, square, legalMoves);
      return;
    }

    if (chess.get(square)?.color !== playerColor[0]) {
      setSelection(null);
      return;
    }

    event.preventDefault();
    setSelection({ square, fen });
    setDragStart({ square, x0: event.clientX, y0: event.clientY, wasSelected: selected === square, fen });
    setDragPos({ x: event.clientX, y: event.clientY });
  }

  // Bound to the window so a drag that leaves the board still resolves. The
  // drag's origin never changes mid-gesture, so this subscribes once per drag
  // even though pointermove re-renders continuously.
  useEffect(() => {
    if (!drag) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragPos({ x: event.clientX, y: event.clientY });
    };

    const handlePointerUp = (event: PointerEvent) => {
      setDragStart(null);
      setDragPos(null);

      // Measured against the origin rather than a running flag, so the
      // decision can never read a stale value.
      const moved =
        Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) > DRAG_THRESHOLD_PX;

      if (!moved) {
        // A plain click leaves the piece selected so a second click can finish
        // the move — unless it was already selected, which deselects it.
        if (drag.wasSelected) setSelection(null);
        return;
      }

      const target = squareAt(event.clientX, event.clientY);
      if (!target || !attemptMove(drag.square, target, legalMoves)) setSelection(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [drag, legalMoves, squareAt, attemptMove]);

  const dragMoved =
    drag !== null &&
    dragPos !== null &&
    Math.hypot(dragPos.x - drag.x0, dragPos.y - drag.y0) > DRAG_THRESHOLD_PX;
  const draggingPiece = dragMoved && drag ? chess.get(drag.square) : undefined;
  const squareSize = (boardEl?.clientWidth ?? 0) / 8;

  return (
    <div className={styles.boardWrapper}>
      <div ref={setBoardEl} className={styles.board}>
        {cells.map((cell, index) => {
          const square = cell?.square ?? indexToSquare(boardIndex(index, orientation));
          const file = square[0];
          const rank = square[1];
          const isLight = (file.charCodeAt(0) - 97 + Number(rank)) % 2 === 1;

          const classes = [styles.square, isLight ? styles.light : styles.dark];
          if (lastMove && (lastMove.from === square || lastMove.to === square)) {
            classes.push(styles.lastMove);
          }
          if (selected === square) classes.push(styles.selected);
          if (checkedKing === square) classes.push(styles.check);

          return (
            <div
              key={square}
              className={classes.join(" ")}
              onPointerDown={(event) => handlePointerDown(event, square)}
            >
              {cell && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={pieceSrc(cell.color, cell.type)}
                  alt=""
                  draggable={false}
                  className={`${styles.piece} ${
                    dragMoved && drag?.square === square ? styles.ghost : ""
                  }`}
                />
              )}
              {destinations.has(square) && (
                <span className={destinations.get(square) ? styles.captureHint : styles.moveHint} />
              )}
              {/* Coordinates sit in the margins, chess.com style. */}
              {index >= 56 && <span className={styles.fileLabel}>{file}</span>}
              {index % 8 === 0 && <span className={styles.rankLabel}>{rank}</span>}
            </div>
          );
        })}
      </div>

      {draggingPiece && dragPos && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={pieceSrc(draggingPiece.color, draggingPiece.type)}
          alt=""
          draggable={false}
          className={styles.dragPiece}
          style={{ left: dragPos.x, top: dragPos.y, width: squareSize, height: squareSize }}
        />
      )}

      {promotion && (
        <div className={styles.promotionBackdrop} onPointerDown={() => setPendingPromotion(null)}>
          <div className={styles.promotionPicker} onPointerDown={(event) => event.stopPropagation()}>
            {(["q", "r", "b", "n"] as PromotionPiece[]).map((piece) => (
              <button
                key={piece}
                type="button"
                className={styles.promotionOption}
                onClick={() => {
                  onMove(promotion.from, promotion.to, piece);
                  setPendingPromotion(null);
                  setSelection(null);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pieceSrc(playerColor[0] as Color, piece)} alt={piece} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function pieceSrc(color: Color, type: PieceSymbol) {
  return `/assets/chess/pieces/${color}${type.toUpperCase()}.svg`;
}

/** Visual grid index -> index into the a8-first array from board().flat(). */
function boardIndex(visualIndex: number, orientation: PlayerColor) {
  return orientation === "white" ? visualIndex : 63 - visualIndex;
}

function indexToSquare(index: number): Square {
  const file = String.fromCharCode(97 + (index % 8));
  const rank = 8 - Math.floor(index / 8);
  return `${file}${rank}` as Square;
}
