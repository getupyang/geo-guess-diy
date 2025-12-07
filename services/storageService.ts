import { GameData } from "../types";

const STORAGE_KEY = 'geoguesser_games';

export const saveGame = (game: GameData): void => {
  try {
    const existing = getGames();
    // Limit to last 5 to avoid quota issues with base64 images
    const updated = [game, ...existing].slice(0, 5); 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Storage full or error", e);
    alert("本地存储空间已满，无法保存更多游戏。");
  }
};

export const getGames = (): GameData[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
};

export const getGameById = (id: string): GameData | undefined => {
  const games = getGames();
  return games.find(g => g.id === id);
};

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};
