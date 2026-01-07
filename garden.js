const tiles = document.getElementsByClassName('tile');

for (let i = 0; i < tiles.length; i++) {
    // Get tile HTMLElement
    let tile = tiles[i];

    // Add image to tile div
    let imageElement = document.createElement('img');
    imageElement.src = "sprites/plant1/stage1.png";
    imageElement.className = "plant";
    tile.appendChild(imageElement);

    // Add watering button
    let wateringButton = document.createElement('button');
    wateringButton.className = 'watering-button';
    wateringButton.id = `watering-button${i + 1}`;
    wateringButton.innerHTML = 'Water!';
    tile.appendChild(wateringButton);

    console.log(`Loaded tile ${i + 1}`);
}