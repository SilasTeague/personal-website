export interface PlantConfig {
  id: number;
  stages: number;
}

// `stages` is the sprite sheet's frame count (sheet width / frame height),
// so the last valid frame index (the final growth stage) is `stages - 1`.
export const PLANTS: PlantConfig[] = [
  { id: 1, stages: 20 },
  { id: 2, stages: 17 },
];

export function getPlant(plantId: number): PlantConfig {
  return PLANTS.find((plant) => plant.id === plantId) ?? PLANTS[0];
}

export function randomPlant(): PlantConfig {
  return PLANTS[Math.floor(Math.random() * PLANTS.length)];
}
