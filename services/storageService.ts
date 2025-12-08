import { supabase } from './supabaseClient';
import { GameData, Guess, User } from "../types";

const LOCAL_USER_KEY = 'geoguesser_user_id_v2';

// --- User Management ---

export const getCurrentUser = async (): Promise<User> => {
  // 1. Try to get ID from local storage to maintain session
  let userId = localStorage.getItem(LOCAL_USER_KEY);
  let user: User | null = null;

  if (userId) {
    // Fetch profile from DB
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      user = { id: data.id, name: data.name, avatarSeed: data.avatar_seed };
    }
  }

  // 2. If no user found (new device or cleared cache), create one
  if (!user) {
    const newId = Math.random().toString(36).substr(2, 9);
    const newUser = {
      id: newId,
      name: `Player_${Math.floor(Math.random() * 1000)}`,
      avatarSeed: Math.random().toString(36)
    };

    const { error } = await supabase.from('profiles').insert({
      id: newUser.id,
      name: newUser.name,
      avatar_seed: newUser.avatarSeed
    });

    if (error) {
      console.error("Error creating user:", JSON.stringify(error));
      // Fallback for offline/error (though this app requires net)
      return newUser;
    }

    user = newUser;
    localStorage.setItem(LOCAL_USER_KEY, newUser.id);
  }

  return user;
};

export const saveCurrentUser = async (user: User): Promise<void> => {
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    name: user.name,
    avatar_seed: user.avatarSeed
  });
  
  if (error) console.error("Error updating user:", JSON.stringify(error));
};

// --- Game Management ---

export const saveGame = async (game: GameData): Promise<boolean> => {
  const { error } = await supabase.from('games').insert({
    id: game.id,
    image_data: game.imageData, // Storing Base64 in text column (ok for MVP)
    location_lat: game.location.lat,
    location_lng: game.location.lng,
    location_name: game.locationName,
    author_id: game.authorId,
    author_name: game.authorName,
    created_at: game.createdAt
    // Note: 'likes' and 'dislikes' are removed from here. 
    // If the columns exist in DB, they should have DEFAULT 0. 
    // If they don't exist, excluding them prevents the "Column not found" error.
  });

  if (error) {
    console.error("Error saving game:", JSON.stringify(error));
    return false;
  }
  return true;
};

export const getGameById = async (id: string): Promise<GameData | null> => {
  const { data, error } = await supabase.from('games').select('*').eq('id', id).single();
  
  if (error || !data) return null;

  return {
    id: data.id,
    imageData: data.image_data,
    location: { lat: data.location_lat, lng: data.location_lng },
    locationName: data.location_name,
    authorId: data.author_id,
    authorName: data.author_name,
    createdAt: data.created_at,
    likes: data.likes || 0,
    dislikes: data.dislikes || 0
  };
};

export const getNextUnplayedGame = async (userId: string): Promise<GameData | null> => {
  try {
    // 1. Get IDs of games this user has already guessed
    const { data: myGuesses } = await supabase
      .from('guesses')
      .select('game_id')
      .eq('user_id', userId);

    const playedGameIds = new Set(myGuesses?.map(g => g.game_id) || []);

    // 2. Fetch latest 50 games ID AND TIMESTAMP ONLY (Lightweight)
    // CRITICAL FIX: Do NOT select '*' here. Selecting image_data for 50 rows causes massive download.
    const { data: allGamesMeta } = await supabase
      .from('games')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!allGamesMeta) return null;

    // 3. Filter out played games in memory (on the lightweight list)
    const unplayedMeta = allGamesMeta.filter(g => !playedGameIds.has(g.id));

    if (unplayedMeta.length === 0) return null;

    // 4. Pick random from the unplayed list
    const randomGameMeta = unplayedMeta[Math.floor(Math.random() * unplayedMeta.length)];

    // 5. Fetch FULL data (including image) ONLY for the chosen game
    return await getGameById(randomGameMeta.id);

  } catch (e) {
    console.error("Error finding game", e);
    return null;
  }
};

export const rateGame = async (gameId: string, type: 'like' | 'dislike'): Promise<boolean> => {
  try {
    // Simple Read-Modify-Write for MVP (since we don't have stored procedures setup)
    // In production, use .rpc('increment_field', ...)
    const { data, error: readError } = await supabase
      .from('games')
      .select(type === 'like' ? 'likes' : 'dislikes')
      .eq('id', gameId)
      .single();

    if (readError || !data) return false;

    const currentCount = (type === 'like' ? (data as any).likes : (data as any).dislikes) || 0;
    const updatePayload = type === 'like' ? { likes: currentCount + 1 } : { dislikes: currentCount + 1 };

    const { error: updateError } = await supabase
      .from('games')
      .update(updatePayload)
      .eq('id', gameId);

    return !updateError;
  } catch (e) {
    console.error("Error rating game:", e);
    return false;
  }
};

// --- Guess Management ---

export const saveGuess = async (guess: Guess): Promise<void> => {
  const { error } = await supabase.from('guesses').insert({
    id: guess.id,
    game_id: guess.gameId,
    user_id: guess.userId,
    user_name: guess.userName,
    user_avatar_seed: guess.userAvatarSeed,
    location_lat: guess.location.lat,
    location_lng: guess.location.lng,
    distance: guess.distance,
    score: guess.score,
    timestamp: guess.timestamp
  });
  if (error) console.error("Error saving guess:", JSON.stringify(error));
};

export const getGuessesForGame = async (gameId: string): Promise<Guess[]> => {
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('game_id', gameId)
    .order('score', { ascending: false }); // High score first

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatarSeed: row.user_avatar_seed,
    location: { lat: row.location_lat, lng: row.location_lng },
    distance: row.distance,
    score: row.score,
    timestamp: row.timestamp
  }));
};

export const getUserGuesses = async (userId: string): Promise<Guess[]> => {
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error || !data) return [];

  return data.map(row => ({
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    userName: row.user_name,
    userAvatarSeed: row.user_avatar_seed,
    location: { lat: row.location_lat, lng: row.location_lng },
    distance: row.distance,
    score: row.score,
    timestamp: row.timestamp
  }));
};

export const hasUserPlayed = async (gameId: string, userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('guesses')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') return false; // PGRST116 is "no rows found"
  return !!data;
};

export const generateId = (): string => Math.random().toString(36).substr(2, 9);