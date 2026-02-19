
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
  HISTORY = 'HISTORY',
  CREATED_LIST = 'CREATED_LIST',
  CREATE = 'CREATE',
  PLAY = 'PLAY',
  REVIEW = 'REVIEW',
  // --- Collections ---
  COLLECTION_CREATE = 'COLLECTION_CREATE',
  COLLECTION_HOME = 'COLLECTION_HOME',
  COLLECTION_PLAY = 'COLLECTION_PLAY',
  MY_COLLECTIONS = 'MY_COLLECTIONS',
  MY_PLAYED_COLLECTIONS = 'MY_PLAYED_COLLECTIONS',
  PLAZA = 'PLAZA',
}

// --- Collection Types ---

export interface Collection {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  itemCount: number;
}

export interface CollectionAttempt {
  id: string;
  collectionId: string;
  userId: string;
  userName: string;
  totalScore: number;
  completedAt: number;
}

// Stored in localStorage only, never uploaded
export interface CollectionProgress {
  collectionId: string;
  userId: string;
  completedItems: {
    gameId: string;
    score: number;
    distance: number;
  }[];
  isCompleted: boolean;
  totalScore: number;
  startedAt: number;
  completedAt?: number;
}
