const tiles = document.getElementsByClassName('tile');
const watered_tiles = [];

async function loadTiles() {
    try {
        const tile_state = await fetch("https://api.silasteague.com/garden/tiles").then(response => response.json());

        console.log(tile_state);

        for (let i = 0; i < tiles.length; i++) {
            // Get tile HTMLElement
            let tile = tiles[i];

            // Get tile state
            let state = tile_state[i];

            // Add image to tile div
            let imageContainer = document.createElement('div');
            imageContainer.className = "plant-container";
            tile.appendChild(imageContainer);
            let imageElement = document.createElement('img');

            // Get image based on tile state
            let plantNumber = state.plant_id ?? 1;
            imageElement.src = `assets/plant_sprites/plant${plantNumber}/plant${plantNumber}.png`;
            imageElement.className = "plant";
            imageElement.id = `plant-${i}`;
            imageContainer.appendChild(imageElement);

            // Update image to reflect current stage
            let currentStage = state.stage ?? 0;
            setGrowth(currentStage, imageElement);
            

            // Add watering button
            let wateringButton = document.createElement('button');
            wateringButton.className = 'watering-button';
            wateringButton.id = `watering-button${i + 1}`;
            wateringButton.innerHTML = 'Water!';
            wateringButton.addEventListener('click', () => {
                let index = i;
                let plant = document.querySelector(`#plant-${index}`);
                let plantWidth = plant.clientHeight;

                plant.style.transform = `translate(-${(currentStage + 1) * plantWidth}px, 0)`;

                watered_tiles.push(index + 1);
                console.log(watered_tiles);
            });
            tile.appendChild(wateringButton);

            console.log(`Loaded tile ${i + 1}`);
        }
    } catch (err) {
        console.log(err);
        const gardenErrorText = document.createElement('p');
        gardenErrorText.innerHTML = "The garden did not load properly :(";
        document.getElementById('garden').appendChild(gardenErrorText);
    }
}

async function setGrowth(stage, img) {
    let width = img.clientHeight;
    let offset = width;
    for (let i = 0; i < stage; i++) {
        img.style.transform = `translate(-${offset}px, 0)`;
        offset += width;
        await sleep(100);
    }
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

window.addEventListener('beforeunload', (event) => {
    console.log(watered_tiles);
    fetch("https://api.silasteague.com/garden/tiles", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watered_tiles }),
        keepalive: true,
    });
});

loadTiles();
