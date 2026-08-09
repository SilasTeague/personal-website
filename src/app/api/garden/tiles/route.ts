import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { TileState } from "@/features/garden/types";

export async function GET() {
  const tiles = db.prepare("SELECT * FROM tiles").all() as TileState[];
  return NextResponse.json(tiles);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const wateredTiles = body?.watered_tiles;

  if (!Array.isArray(wateredTiles) || wateredTiles.length === 0) {
    return NextResponse.json(
      { error: "watered_tiles must be a non-empty array" },
      { status: 400 }
    );
  }

  const placeholders = wateredTiles.map(() => "?").join(",");
  db.prepare(`UPDATE tiles SET stage = stage + 1 WHERE tile_id IN (${placeholders})`).run(
    ...wateredTiles
  );

  return NextResponse.json({ count: wateredTiles.length, tiles: wateredTiles });
}
