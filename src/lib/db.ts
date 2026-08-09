import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "garden.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS plants (
    plant_id INTEGER NOT NULL PRIMARY KEY,
    stages INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tiles (
    tile_id INTEGER NOT NULL PRIMARY KEY,
    plant_id INTEGER REFERENCES plants(plant_id),
    stage INTEGER DEFAULT 0,
    plants_grown INTEGER DEFAULT 0
  )
`);

db.prepare(
  `
  INSERT INTO tiles (tile_id, plant_id, stage, plants_grown) VALUES
    (1, NULL, 0, 0),
    (2, NULL, 0, 0),
    (3, NULL, 0, 0),
    (4, NULL, 0, 0),
    (5, NULL, 0, 0)
  ON CONFLICT DO NOTHING
`
).run();

export default db;
