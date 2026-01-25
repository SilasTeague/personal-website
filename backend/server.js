const express = require("express");
const sqlite = require("better-sqlite3");
const cors = require('cors');

require('dotenv').config();
const port = process.env.PORT;

const app = express();
app.use(express.json());
app.use(cors());

const db = new sqlite("garden.db");

 const plants = db.prepare(`
    CREATE TABLE IF NOT EXISTS plants (
        plant_id INTEGER NOT NULL PRIMARY KEY,
        stages INTEGER
    )
`);

const tiles = db.prepare(`
    CREATE TABLE IF NOT EXISTS tiles (
        tile_id INTEGER NOT NULL PRIMARY KEY,
        plant_id INTEGER REFERENCES plants(plant_id),
        stage INTEGER DEFAULT 0,
        plants_grown INTEGER DEFAULT 0
    )
`);

plants.run();
tiles.run();

db.prepare(`
    INSERT INTO tiles VALUES
    (1, NULL, 0, 0),
    (2, NULL, 0, 0),  
    (3, NULL, 0, 0),  
    (4, NULL, 0, 0),  
    (5, NULL, 0, 0) 
    ON CONFLICT DO NOTHING   
`).run();

app.get('/garden/tiles', (req, res) => {
    const query = db.prepare('SELECT * FROM tiles');
    const result = query.all();
    res.send(result);
})

app.post('/garden/tiles', (req, res) => {
    /** JSON Format:
     * {
     *  "watered_tiles": ["1", "3", "5"]
     * }
     */
    const { watered_tiles } = req.body;

    if (!Array.isArray(watered_tiles)) {
        return res.status(400);
    }

    console.log(watered_tiles);

    const placeholders = watered_tiles.map(() => "?").join(",");

    const update = db.prepare(`
        UPDATE tiles SET stage = stage + 1 WHERE tile_id IN (${placeholders})
    `).run(watered_tiles);

    res.json({
        count: watered_tiles.length,
        tiles: watered_tiles
    });
})



app.listen(port, '0.0.0.0', () => {
    console.log(`Listening on port: ${port}`);
})


