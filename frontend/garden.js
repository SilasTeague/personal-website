const tiles = document.getElementsByClassName('tile');

async function loadTiles() {
    try {
        const tile_state = await fetch("http://api.silasteague.com:3000/garden/tiles").then(response => response.json());
        /*
        * 
        */
        console.log(tile_state);

        for (let i = 0; i < tiles.length; i++) {
            // Get tile HTMLElement
            let tile = tiles[i];

            // Add image to tile div
            let imageContainer = document.createElement('div');
            imageContainer.className = "plant-container";
            tile.appendChild(imageContainer);
            let imageElement = document.createElement('img');
            imageElement.src = "assets/plant_sprites/plant2/Monstera.png";
            imageElement.className = "plant";
            imageElement.id = `plant-${i}`;
            imageContainer.appendChild(imageElement);

            // Add watering button
            let wateringButton = document.createElement('button');
            wateringButton.className = 'watering-button';
            wateringButton.id = `watering-button${i + 1}`;
            wateringButton.innerHTML = 'Water!';
            wateringButton.addEventListener('click', () => {
                let plant = document.querySelector(`#plant-${i}`);
                let plantWidth = plant.clientHeight;
                plant.style.transform = `translate(-${plantWidth}px, 0)`;
            })
            tile.appendChild(wateringButton);

            console.log(`Loaded tile ${i + 1}`);
        }
    } catch (err) {
        console.log(err);
    }
}

loadTiles();
