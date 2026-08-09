"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./garden.module.css";
import type { TileState } from "./types";
import { getPlant, randomPlant } from "./plants";

const GROWTH_STEP_DELAY = 400;
const FINAL_STAGE_HOLD_DELAY = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Tile({ tile }: { tile: TileState }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [stage, setStage] = useState(tile.stage);
  const [plantId, setPlantId] = useState(tile.plant_id ?? 1);
  const [plantsGrown, setPlantsGrown] = useState(tile.plants_grown);
  const [disabled, setDisabled] = useState(false);

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

  function setSpriteFrame(frame: number) {
    const img = imgRef.current;
    if (img) {
      const frameWidth = img.clientHeight;
      img.style.transform = `translate(-${frame * frameWidth}px, 0)`;
    }
  }

  async function handleWater() {
    if (disabled) return;
    setDisabled(true);

    const finalStage = getPlant(plantId).stages - 1;

    // Grow by two stages, but never step past the final stage (and never
    // display a second intermediate frame if only one step remains).
    let nextStage = Math.min(stage + 1, finalStage);
    setStage(nextStage);
    setSpriteFrame(nextStage);

    if (nextStage < finalStage) {
      await sleep(GROWTH_STEP_DELAY);
      nextStage = Math.min(nextStage + 1, finalStage);
      setStage(nextStage);
      setSpriteFrame(nextStage);
    }

    let resultPlantId = plantId;
    let resultStage = nextStage;
    let resultPlantsGrown = plantsGrown;

    if (nextStage >= finalStage) {
      await sleep(FINAL_STAGE_HOLD_DELAY);
      const newPlant = randomPlant();
      resultPlantId = newPlant.id;
      resultStage = 0;
      resultPlantsGrown = plantsGrown + 1;
      setPlantId(resultPlantId);
      setStage(resultStage);
      setSpriteFrame(resultStage);
      setPlantsGrown(resultPlantsGrown);
    }

    fetch("/api/garden/tiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tile_id: tile.tile_id,
        stage: resultStage,
        plant_id: resultPlantId,
        plants_grown: resultPlantsGrown,
      }),
    }).catch((err) => console.error(err));

    setDisabled(false);
  }

  return (
    <div className={styles.tile}>
      <div className={styles.plantContainer}>
        {/* Sprite-sheet frame stepping needs direct transform control next/image doesn't offer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={`/assets/plant_sprites/plant${plantId}/plant${plantId}.png`}
          alt={`Plant ${plantId}`}
          className={styles.plant}
        />
      </div>
      <button className={styles.wateringButton} onClick={handleWater} disabled={disabled}>
        Water!
      </button>
      <span className={styles.plantsGrown}>Grown: {plantsGrown}</span>
    </div>
  );
}
