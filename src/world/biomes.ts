export type BiomeId = 'meadow' | 'forest' | 'desert' | 'snow' | 'swamp' | 'volcanic';

export type PropKind =
  | 'oak'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'flower'
  | 'cactus'
  | 'deadtree'
  | 'mushroom'
  | 'snowpine'
  | 'crystal'
  | 'boulder'
  | 'reed'
  | 'house'
  | 'well'
  | 'lamp'
  | 'fence';

export type EnemyKind = 'slime' | 'goblin' | 'skeleton' | 'boar' | 'golem' | 'bat';

export interface Biome {
  id: BiomeId;
  ground: [string, string];
  /** Chance that a 4 m cell holds a prop. */
  density: number;
  props: [PropKind, number][];
  enemies: [EnemyKind, number][];
  /** Colour blended into enemy skins so each biome's monsters look local. */
  tint: string;
  adjectives: string[];
  nouns: string[];
}

export const BIOMES: Record<BiomeId, Biome> = {
  meadow: {
    id: 'meadow',
    ground: ['#86d160', '#74c152'],
    density: 0.2,
    props: [
      ['oak', 2],
      ['bush', 3],
      ['flower', 5],
      ['rock', 1],
    ],
    enemies: [
      ['slime', 4],
      ['goblin', 3],
      ['boar', 2],
      ['bat', 1],
    ],
    tint: '#9be36b',
    adjectives: ['Whispering', 'Sunny', 'Golden', 'Breezy', 'Gentle', 'Honey'],
    nouns: ['Meadows', 'Fields', 'Downs', 'Green', 'Pastures', 'Hills'],
  },
  forest: {
    id: 'forest',
    ground: ['#58a548', '#4b963e'],
    density: 0.5,
    props: [
      ['pine', 5],
      ['oak', 3],
      ['bush', 2],
      ['mushroom', 1],
      ['rock', 1],
    ],
    enemies: [
      ['goblin', 3],
      ['boar', 2],
      ['skeleton', 2],
      ['slime', 1],
    ],
    tint: '#4f8a3a',
    adjectives: ['Mossy', 'Tangled', 'Elder', 'Shadowed', 'Hollow', 'Thorn'],
    nouns: ['Woods', 'Thicket', 'Grove', 'Weald', 'Pines', 'Glade'],
  },
  desert: {
    id: 'desert',
    ground: ['#eed592', '#e2c57f'],
    density: 0.1,
    props: [
      ['cactus', 3],
      ['rock', 2],
      ['deadtree', 1],
      ['boulder', 1],
    ],
    enemies: [
      ['skeleton', 3],
      ['golem', 2],
      ['bat', 2],
      ['slime', 1],
    ],
    tint: '#e0b066',
    adjectives: ['Scorched', 'Endless', 'Bleached', 'Shimmering', 'Dusty', 'Sunken'],
    nouns: ['Dunes', 'Wastes', 'Sands', 'Flats', 'Expanse', 'Barrens'],
  },
  snow: {
    id: 'snow',
    ground: ['#f2f7fc', '#dfeaf4'],
    density: 0.3,
    props: [
      ['snowpine', 5],
      ['rock', 2],
      ['crystal', 1],
    ],
    enemies: [
      ['golem', 2],
      ['skeleton', 2],
      ['bat', 2],
      ['boar', 2],
    ],
    tint: '#a9d4f5',
    adjectives: ['Frozen', 'Howling', 'Silent', 'Frostbitten', 'Pale', 'Glacial'],
    nouns: ['Peaks', 'Tundra', 'Drifts', 'Reach', 'Steppe', 'Wilds'],
  },
  swamp: {
    id: 'swamp',
    ground: ['#6a8a4c', '#5a7a40'],
    density: 0.38,
    props: [
      ['deadtree', 3],
      ['reed', 4],
      ['mushroom', 3],
    ],
    enemies: [
      ['slime', 4],
      ['bat', 3],
      ['goblin', 2],
    ],
    tint: '#7c9b4a',
    adjectives: ['Murky', 'Rotting', 'Foggy', 'Croaking', 'Sodden', 'Gloom'],
    nouns: ['Bog', 'Marsh', 'Fen', 'Mire', 'Swamp', 'Sloughs'],
  },
  volcanic: {
    id: 'volcanic',
    ground: ['#4d3f3d', '#3e3233'],
    density: 0.18,
    props: [
      ['boulder', 3],
      ['crystal', 2],
      ['deadtree', 1],
    ],
    enemies: [
      ['golem', 3],
      ['skeleton', 2],
      ['boar', 2],
      ['bat', 1],
    ],
    tint: '#ff6a3d',
    adjectives: ['Smoldering', 'Ashen', 'Molten', 'Cinder', 'Burning', 'Obsidian'],
    nouns: ['Caldera', 'Badlands', 'Scar', 'Hollow', 'Rift', 'Crags'],
  },
};
