
export interface LatLng {
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  name: string;
  avatarSeed?: string; // For generating consistent avatars
}

export interface GameData {
  id: string;
  imageData: string; // Base64
  location: LatLng;
  locationName?: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  likes?: number;
}

export interface Guess {
  id: string;
  gameId: string;
  userId: string;
  userName: string;
  userAvatarSeed?: string;
  location: LatLng;
  distance: number; // meters
  score: number;
  timestamp: number;
}

export enum GameMode {
  HOME = 'HOME',
  HISTORY = 'HISTORY', // New mode for full history list
  CREATED_LIST = 'CREATED_LIST', // List of games created by user
  CREATE = 'CREATE',
  PLAY = 'PLAY',
  REVIEW = 'REVIEW' // Combined Result/Review mode
}