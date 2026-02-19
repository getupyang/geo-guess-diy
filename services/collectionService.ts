import { supabase } from './supabaseClient';
import { Collection, CollectionAttempt, CollectionProgress } from '../types';
import { generateId } from './storageService';

// --- LocalStorage Progress Helpers ---

export const collProgressKey = (collectionId: string, userId: string) =>
  `coll_progress_${collectionId}_${userId}`;

export const getCollectionProgress = (collectionId: string, userId: string): CollectionProgress | null => {
  try {
    const raw = localStorage.getItem(collProgressKey(collectionId, userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveCollectionProgress = (progress: CollectionProgress): void => {
  localStorage.setItem(collProgressKey(progress.collectionId, progress.userId), JSON.stringify(progress));
};

// --- Collection CRUD ---

export const createCollection = async (
  name: string,
  gameIds: string[],
  authorId: string,
  authorName: string
): Promise<Collection | null> => {
  const id = generateId();
  const createdAt = Date.now();

  const { error: collErr } = await supabase.from('collections').insert({
    id,
    name,
    author_id: authorId,
    author_name: authorName,
    item_count: gameIds.length,
    created_at: createdAt,
  });

  if (collErr) {
    console.error('Error creating collection:', collErr);
    return null;
  }

  const items = gameIds.map((gameId, index) => ({
    id: generateId(),
    collection_id: id,
    game_id: gameId,
    order_index: index,
  }));

  const { error: itemsErr } = await supabase.from('collection_items').insert(items);
  if (itemsErr) {
    console.error('Error creating collection items:', itemsErr);
    return null;
  }

  return { id, name, authorId, authorName, createdAt, itemCount: gameIds.length };
};

export const getCollection = async (
  collectionId: string
): Promise<{ collection: Collection; gameIds: string[] } | null> => {
  const { data: collData, error: collErr } = await supabase
    .from('collections')
    .select('*')
    .eq('id', collectionId)
    .single();

  if (collErr || !collData) return null;

  const { data: itemsData, error: itemsErr } = await supabase
    .from('collection_items')
    .select('game_id')
    .eq('collection_id', collectionId)
    .order('order_index', { ascending: true });

  if (itemsErr || !itemsData) return null;

  return {
    collection: {
      id: collData.id,
      name: collData.name,
      authorId: collData.author_id,
      authorName: collData.author_name,
      createdAt: collData.created_at,
      itemCount: collData.item_count,
    },
    gameIds: itemsData.map((i) => i.game_id),
  };
};

// --- Collection Lists ---

export interface CollectionWithStats extends Collection {
  totalCompletions: number;
  avgTotalScore: number;
}

export interface CollectionWithMyScore extends Collection {
  myScore: number;
  completedAt: number;
}

const attachStats = async (collections: CollectionWithStats[]): Promise<void> => {
  const ids = collections.map((c) => c.id);
  if (ids.length === 0) return;

  const { data } = await supabase
    .from('collection_attempts')
    .select('collection_id, user_id, total_score')
    .in('collection_id', ids);

  if (!data) return;

  // Deduplicate: per (collection_id, user_id), keep best score
  const userBest = new Map<string, number>(); // key: `${collectionId}|${userId}`
  for (const row of data) {
    const key = `${row.collection_id}|${row.user_id}`;
    const prev = userBest.get(key);
    if (prev === undefined || row.total_score > prev) {
      userBest.set(key, row.total_score);
    }
  }

  const statsMap = new Map<string, { count: number; total: number }>();
  for (const [key, score] of userBest) {
    const collId = key.split('|')[0];
    const s = statsMap.get(collId) || { count: 0, total: 0 };
    statsMap.set(collId, { count: s.count + 1, total: s.total + score });
  }
  for (const c of collections) {
    const s = statsMap.get(c.id);
    if (s) {
      c.totalCompletions = s.count;
      c.avgTotalScore = Math.round(s.total / s.count);
    }
  }
};

export const getMyCollections = async (userId: string): Promise<CollectionWithStats[]> => {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const collections: CollectionWithStats[] = data.map((row) => ({
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    itemCount: row.item_count,
    totalCompletions: 0,
    avgTotalScore: 0,
  }));

  await attachStats(collections);
  return collections;
};

export const getMyPlayedCollections = async (userId: string): Promise<CollectionWithMyScore[]> => {
  const { data: attempts, error } = await supabase
    .from('collection_attempts')
    .select('collection_id, total_score, completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false });

  if (error || !attempts || attempts.length === 0) return [];

  // Deduplicate by collection_id: keep best score (tie-break: latest completed_at)
  const bestByCollection = new Map<string, { total_score: number; completed_at: number }>();
  for (const a of attempts) {
    const prev = bestByCollection.get(a.collection_id);
    if (!prev || a.total_score > prev.total_score) {
      bestByCollection.set(a.collection_id, { total_score: a.total_score, completed_at: a.completed_at });
    }
  }

  const ids = Array.from(bestByCollection.keys());
  const { data: collData } = await supabase.from('collections').select('*').in('id', ids);
  if (!collData) return [];

  const collMap = new Map(collData.map((c) => [c.id, c]));

  return ids
    .map((collId) => {
      const coll = collMap.get(collId);
      const best = bestByCollection.get(collId);
      if (!coll || !best) return null;
      return {
        id: coll.id,
        name: coll.name,
        authorId: coll.author_id,
        authorName: coll.author_name,
        createdAt: coll.created_at,
        itemCount: coll.item_count,
        myScore: best.total_score,
        completedAt: best.completed_at,
      } as CollectionWithMyScore;
    })
    .filter(Boolean) as CollectionWithMyScore[];
};

export const getAllCollections = async (page = 0, pageSize = 20): Promise<CollectionWithStats[]> => {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (error || !data) return [];

  const collections: CollectionWithStats[] = data.map((row) => ({
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    itemCount: row.item_count,
    totalCompletions: 0,
    avgTotalScore: 0,
  }));

  await attachStats(collections);
  return collections;
};

// --- Attempts & Leaderboard ---

export const submitCollectionAttempt = async (
  collectionId: string,
  userId: string,
  userName: string,
  totalScore: number
): Promise<void> => {
  // Check for existing record
  const { data: existing } = await supabase
    .from('collection_attempts')
    .select('id, total_score')
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    // Update only if the new score is higher (fixes stale 0-score records from old bugs)
    if (totalScore > existing.total_score) {
      await supabase
        .from('collection_attempts')
        .update({ total_score: totalScore, completed_at: Date.now() })
        .eq('id', existing.id);
    }
    return;
  }

  const { error } = await supabase.from('collection_attempts').insert({
    id: generateId(),
    collection_id: collectionId,
    user_id: userId,
    user_name: userName,
    total_score: totalScore,
    completed_at: Date.now(),
  });
  if (error) console.error('Error submitting collection attempt:', error);
};

export const getCollectionLeaderboard = async (
  collectionId: string,
  currentUserId: string
): Promise<{ topTen: CollectionAttempt[]; myRecord: CollectionAttempt | null }> => {
  // Fetch all rows so we can deduplicate client-side (handles historical duplicate data)
  const { data } = await supabase
    .from('collection_attempts')
    .select('*')
    .eq('collection_id', collectionId)
    .order('total_score', { ascending: false })
    .order('completed_at', { ascending: true });

  const allRows: CollectionAttempt[] = (data || []).map((row) => ({
    id: row.id,
    collectionId: row.collection_id,
    userId: row.user_id,
    userName: row.user_name,
    totalScore: row.total_score,
    completedAt: row.completed_at,
  }));

  // Deduplicate: one entry per userId, keep best score (data already sorted: highest score first,
  // then earliest completed_at — so the first occurrence per user is their best record)
  const seen = new Set<string>();
  const deduped: CollectionAttempt[] = [];
  for (const row of allRows) {
    if (!seen.has(row.userId)) {
      seen.add(row.userId);
      deduped.push(row);
    }
  }

  const topTen = deduped.slice(0, 10);
  const myRecord = deduped.find((a) => a.userId === currentUserId) || null;

  return { topTen, myRecord };
};

// --- Creator Stats ---

export interface CollectionStats {
  totalCompletions: number;
  avgTotalScore: number;
  perGameAvgScore: { gameId: string; avgScore: number }[];
}

export const getCollectionStats = async (collectionId: string): Promise<CollectionStats> => {
  const { data: attempts } = await supabase
    .from('collection_attempts')
    .select('user_id, total_score')
    .eq('collection_id', collectionId);

  // Deduplicate by userId: keep best score per user
  const bestByUser = new Map<string, number>();
  for (const row of attempts || []) {
    const prev = bestByUser.get(row.user_id);
    if (prev === undefined || row.total_score > prev) {
      bestByUser.set(row.user_id, row.total_score);
    }
  }
  const uniqueScores = Array.from(bestByUser.values());
  const totalCompletions = uniqueScores.length;
  const avgTotalScore =
    totalCompletions > 0
      ? Math.round(uniqueScores.reduce((s, v) => s + v, 0) / totalCompletions)
      : 0;

  const { data: items } = await supabase
    .from('collection_items')
    .select('game_id')
    .eq('collection_id', collectionId)
    .order('order_index', { ascending: true });

  const gameIds = items?.map((i) => i.game_id) || [];
  let perGameAvgScore: { gameId: string; avgScore: number }[] = [];

  if (gameIds.length > 0) {
    const { data: guesses } = await supabase
      .from('guesses')
      .select('game_id, score')
      .in('game_id', gameIds);

    if (guesses) {
      const scoreMap = new Map<string, { total: number; count: number }>();
      for (const g of guesses) {
        const s = scoreMap.get(g.game_id) || { total: 0, count: 0 };
        scoreMap.set(g.game_id, { total: s.total + g.score, count: s.count + 1 });
      }
      perGameAvgScore = gameIds.map((gameId) => {
        const s = scoreMap.get(gameId);
        return { gameId, avgScore: s ? Math.round(s.total / s.count) : 0 };
      });
    }
  }

  return { totalCompletions, avgTotalScore, perGameAvgScore };
};
