const express = require("express");
const sqlite = require("better-sqlite3");

require('dotenv').config();
const port = process.env.PORT;

const app = express();
app.use(express.json());

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
        plants_grown INTEGER
    )
`);

plants.run();
tiles.run();


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

    res.json({
        count: watered_tiles.length,
        tiles: watered_tiles
    });
})



app.listen(port, () => {
    console.log(`Listening on port: ${port}`);
})


