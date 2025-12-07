export interface LatLng {
  lat: number;
  lng: number;
}

export interface GameData {
  id: string;
  imageData: string; // Base64
  location: LatLng;
  locationName?: string;
  author: string;
  createdAt: number;
}

export enum GameMode {
  HOME = 'HOME',
  CREATE = 'CREATE',
  PLAY = 'PLAY',
  RESULT = 'RESULT'
}

export interface GuessResult {
  distance: number; // in meters
  score: number; // 0 - 5000
  guessLocation: LatLng;
  actualLocation: LatLng;
}
