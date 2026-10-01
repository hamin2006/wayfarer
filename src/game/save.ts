import { SAVE_KEY } from '../config';
import type { PerkId } from '../combat/perks';
import type { Item, Slot } from '../loot/items';

export interface SaveData {
  version: 1;
  seed: number;
  dayTime: number;
  player: {
    x: number;
    z: number;
    level: number;
    xp: number;
    hp: number;
    gold: number;
    perks: Partial<Record<PerkId, number>>;
    equipped: Record<Slot, Item | null>;
    bag: Item[];
  };
  /** Cleared camps, defeated bosses, opened chests and used shrines, by POI id. */
  done: string[];
  stats: { kills: number; bosses: number; deaths: number; farthest: number };
  muted: boolean;
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

export function writeGame(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked: the session still plays, it just won't persist.
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
