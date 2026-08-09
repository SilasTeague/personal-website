import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import type { TileState } from "@/features/garden/types";

export async function GET() {
  const tiles = db.prepare("SELECT * FROM tiles").all() as TileState[];
  return NextResponse.json(tiles);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tile_id, stage, plant_id, plants_grown } = body ?? {};

  if (
    typeof tile_id !== "number" ||
    typeof stage !== "number" ||
    typeof plant_id !== "number" ||
    typeof plants_grown !== "number"
  ) {
    return NextResponse.json(
      { error: "tile_id, stage, plant_id, and plants_grown must be numbers" },
      { status: 400 }
    );
  }

  db.prepare(
    "UPDATE tiles SET stage = ?, plant_id = ?, plants_grown = ? WHERE tile_id = ?"
  ).run(stage, plant_id, plants_grown, tile_id);

  return NextResponse.json({ tile_id, stage, plant_id, plants_grown });
}
