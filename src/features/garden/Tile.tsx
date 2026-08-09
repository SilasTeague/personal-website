"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./garden.module.css";
import type { TileState } from "./types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Tile({ tile }: { tile: TileState }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [stage, setStage] = useState(tile.stage);
  const plantNumber = tile.plant_id ?? 1;

  // Step the sprite through its growth frames on mount so the plant
  // visibly grows into its current stage instead of popping in.
  useEffect(() => {
    let cancelled = false;

    async function animateToStage() {
      const img = imgRef.current;
      if (!img) return;
      const frameWidth = img.clientHeight;
      for (let frame = 1; frame <= tile.stage; frame++) {
        if (cancelled) return;
        img.style.transform = `translate(-${frame * frameWidth}px, 0)`;
        await sleep(100);
      }
    }

    animateToStage();
    return () => {
      cancelled = true;
    };
    // Only run the intro animation once, using the stage loaded from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleWater() {
    const nextStage = stage + 1;
    const img = imgRef.current;
    if (img) {
      const frameWidth = img.clientHeight;
      img.style.transform = `translate(-${nextStage * frameWidth}px, 0)`;
    }
    setStage(nextStage);

    fetch("/api/garden/tiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watered_tiles: [tile.tile_id] }),
    }).catch((err) => console.error(err));
  }

  return (
    <div className={styles.tile}>
      <div className={styles.plantContainer}>
        {/* Sprite-sheet frame stepping needs direct transform control next/image doesn't offer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={`/assets/plant_sprites/plant${plantNumber}/plant${plantNumber}.png`}
          alt={`Plant ${plantNumber}`}
          className={styles.plant}
        />
      </div>
      <button className={styles.wateringButton} onClick={handleWater}>
        Water!
      </button>
    </div>
  );
}
