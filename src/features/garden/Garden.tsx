"use client";

import { useEffect, useState } from "react";
import styles from "./garden.module.css";
import Tile from "./Tile";
import type { TileState } from "./types";

export default function Garden() {
  const [tiles, setTiles] = useState<TileState[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/garden/tiles")
      .then((res) => res.json())
      .then((data: TileState[]) => {
        if (!cancelled) setTiles(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.garden}>
      <h1 className={styles.greeting}>
        Greetings! You have entered Silas Teague&apos;s garden! Please tend to the plants as needed :)
      </h1>
      {failed && <p>The garden did not load properly :(</p>}
      {tiles && (
        <div className={styles.tiles}>
          {tiles.map((tile) => (
            <Tile key={tile.tile_id} tile={tile} />
          ))}
        </div>
      )}
    </div>
  );
}
