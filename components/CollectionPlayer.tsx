import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, GameData, Guess, LatLng, CollectionProgress } from '../types';
import { getGameById, saveGuess, generateId } from '../services/storageService';
import {
  getCollectionProgress,
  saveCollectionProgress,
  submitCollectionAttempt,
} from '../services/collectionService';
import { supabase } from '../services/supabaseClient';
import ImageViewer from './ImageViewer';
import GameMap from './GameMap';

interface Props {
  collectionId: string;
  collectionName: string;
  gameIds: string[];
  startIndex: number;
  currentUser: User;
  onComplete: () => void;
  onBack: () => void;
}

type PlayState = 'initializing' | 'loading' | 'historical' | 'playing' | 'reviewing';

const calcDistance = (p1: LatLng, p2: LatLng): number => {
  const R = 6371e3;
  const φ1 = (p1.lat * Math.PI) / 180;
  const φ2 = (p2.lat * Math.PI) / 180;
  const Δφ = ((p2.lat - p1.lat) * Math.PI) / 180;
  const Δλ = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calcScore = (dist: number): number =>
  dist < 50 ? 5000 : Math.round(5000 * Math.exp(-dist / 2000000));

const formatDist = (m: number) =>
  m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

// Progress bar at top
const ProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div className="flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur border-b border-white/10 flex-shrink-0">
    <div className="flex gap-1 flex-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`flex-1 h-1.5 rounded-full transition-all ${
            i < current ? 'bg-orange-500' : i === current ? 'bg-orange-400/60' : 'bg-gray-700'
          }`}
        />
      ))}
    </div>
    <span className="text-xs text-gray-400 whitespace-nowrap">
      {current} / {total}
    </span>
  </div>
);

const CollectionPlayer: React.FC<Props> = ({
  collectionId,
  collectionName,
  gameIds,
  startIndex,
  currentUser,
  onComplete,
  onBack,
}) => {
  const [playState, setPlayState] = useState<PlayState>('initializing');
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [currentGame, setCurrentGame] = useState<GameData | null>(null);

  // Historical question state
  const [historicalRecord, setHistoricalRecord] = useState<{
    score: number;
    distance: number;
  } | null>(null);

  // Play state
  const [userGuess, setUserGuess] = useState<LatLng | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [myResult, setMyResult] = useState<{
    score: number;
    distance: number;
    location: LatLng;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Progress (accumulated score)
  const progressRef = useRef<CollectionProgress>({
    collectionId,
    userId: currentUser.id,
    completedItems: [],
    isCompleted: false,
    totalScore: 0,
    startedAt: Date.now(),
  });

  // Cache for pre-fetched next game
  const prefetchRef = useRef<GameData | null>(null);
  // Cache for pre-answered map (gameId -> {score, distance})
  const preAnsweredRef = useRef<Map<string, { score: number; distance: number }>>(new Map());

  const loadQuestion = useCallback(
    async (index: number) => {
      if (index >= gameIds.length) {
        // All done
        const p = progressRef.current;
        const final: CollectionProgress = {
          ...p,
          isCompleted: true,
          completedAt: Date.now(),
        };
        progressRef.current = final;
        saveCollectionProgress(final);
        await submitCollectionAttempt(
          collectionId,
          currentUser.id,
          currentUser.name,
          final.totalScore
        );
        onComplete();
        return;
      }

      setPlayState('loading');
      const gameId = gameIds[index];

      // Check if user already answered this game outside this collection
      const preAnswered = preAnsweredRef.current.get(gameId);
      if (preAnswered) {
        setHistoricalRecord(preAnswered);
        // Record in progress if not already there
        const already = progressRef.current.completedItems.some((i) => i.gameId === gameId);
        if (!already) {
          const updated: CollectionProgress = {
            ...progressRef.current,
            completedItems: [
              ...progressRef.current.completedItems,
              { gameId, score: preAnswered.score, distance: preAnswered.distance },
            ],
            totalScore: progressRef.current.totalScore + preAnswered.score,
          };
          progressRef.current = updated;
          saveCollectionProgress(updated);
        }
        setPlayState('historical');
        return;
      }

      // Use prefetched game or fetch fresh
      let game: GameData | null =
        prefetchRef.current?.id === gameId ? prefetchRef.current : null;
      prefetchRef.current = null;

      if (!game) {
        game = await getGameById(gameId);
      }

      if (!game) {
        // Skip missing game
        setCurrentIndex((i) => i + 1);
        return;
      }

      setCurrentGame(game);
      setUserGuess(null);
      setIsMapOpen(false);
      setMyResult(null);
      setPlayState('playing');

      // Prefetch next game in background
      const nextId = gameIds[index + 1];
      if (nextId && !preAnsweredRef.current.has(nextId)) {
        getGameById(nextId).then((g) => {
          if (g) prefetchRef.current = g;
        });
      }
    },
    [gameIds, collectionId, currentUser, onComplete]
  );

  // Initialize: restore progress + batch query pre-answered
  useEffect(() => {
    const init = async () => {
      // Restore progress
      const saved = getCollectionProgress(collectionId, currentUser.id);
      if (saved) {
        progressRef.current = saved;
      }

      // Batch query: which of these games has the user already answered?
      const { data } = await supabase
        .from('guesses')
        .select('game_id, score, distance')
        .eq('user_id', currentUser.id)
        .in('game_id', gameIds);

      const map = new Map<string, { score: number; distance: number }>();
      for (const row of data || []) {
        map.set(row.game_id, { score: row.score, distance: row.distance });
      }
      preAnsweredRef.current = map;

      // Now load the first (or resumed) question
      await loadQuestion(startIndex);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load question when index advances
  useEffect(() => {
    if (playState !== 'initializing') {
      loadQuestion(currentIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const handleSubmitGuess = async () => {
    if (!userGuess || !currentGame || isSubmitting) return;
    setIsSubmitting(true);

    const distance = calcDistance(currentGame.location, userGuess);
    const score = calcScore(distance);

    const guess: Guess = {
      id: generateId(),
      gameId: currentGame.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatarSeed: currentUser.avatarSeed,
      location: userGuess,
      distance,
      score,
      timestamp: Date.now(),
    };

    await saveGuess(guess);

    const updated: CollectionProgress = {
      ...progressRef.current,
      completedItems: [
        ...progressRef.current.completedItems,
        { gameId: currentGame.id, score, distance },
      ],
      totalScore: progressRef.current.totalScore + score,
    };
    progressRef.current = updated;
    saveCollectionProgress(updated);

    setMyResult({ score, distance, location: userGuess });
    setIsSubmitting(false);
    setIsMapOpen(true);
    setPlayState('reviewing');
  };

  const handleNext = () => {
    const next = currentIndex + 1;
    setCurrentIndex(next);
    // loadQuestion fires via useEffect
  };

  const handleBack = () => {
    // Progress already saved in ref on each step
    onBack();
  };

  const isLastQuestion = currentIndex === gameIds.length - 1;
  const completedCount = progressRef.current.completedItems.length;

  // ---- LOADING / INITIALIZING ----
  if (playState === 'initializing' || playState === 'loading') {
    return (
      <div className="h-[100dvh] bg-gray-900 flex flex-col">
        <ProgressBar current={completedCount} total={gameIds.length} />
        <div className="flex-1 flex items-center justify-center text-white">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ---- HISTORICAL ANSWER CARD ----
  if (playState === 'historical' && historicalRecord) {
    return (
      <div className="h-[100dvh] bg-gray-900 text-white flex flex-col">
        <ProgressBar current={completedCount} total={gameIds.length} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-5">
          <div className="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-1">你之前答过这道题</p>
            <p className="text-white text-xs">历史记录已自动计入</p>
          </div>
          <div className="flex gap-6 mt-2">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-400">
                {historicalRecord.score.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">历史得分</div>
            </div>
            <div className="w-px bg-gray-700" />
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-300">
                {formatDist(historicalRecord.distance)}
              </div>
              <div className="text-xs text-gray-500 mt-1">误差距离</div>
            </div>
          </div>
        </div>
        <div className="p-4 pb-8">
          <button
            onClick={handleNext}
            className="w-full py-4 bg-orange-500 rounded-2xl font-bold text-white text-lg active:scale-95 transition-transform"
          >
            {isLastQuestion ? '查看结果' : '下一题'}
          </button>
        </div>
      </div>
    );
  }

  // ---- PLAYING + REVIEWING ----
  if (
    (playState === 'playing' || playState === 'reviewing') &&
    currentGame
  ) {
    const isReviewing = playState === 'reviewing';
    const myGuessAsGuess: Guess[] = myResult
      ? [
          {
            id: 'mine',
            gameId: currentGame.id,
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatarSeed: currentUser.avatarSeed,
            location: myResult.location,
            distance: myResult.distance,
            score: myResult.score,
            timestamp: Date.now(),
          },
        ]
      : [];

    return (
      <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
        {/* Progress bar */}
        <div className="absolute top-0 w-full z-20">
          <ProgressBar current={completedCount} total={gameIds.length} />
        </div>

        {/* Header overlay */}
        <div className="absolute top-10 w-full h-14 bg-gradient-to-b from-black/70 to-transparent z-10 flex items-center justify-between px-4 pointer-events-none">
          <button
            onClick={handleBack}
            className="pointer-events-auto p-2 bg-black/30 rounded-full text-white backdrop-blur"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          {isReviewing && myResult && (
            <div className="flex gap-4 pointer-events-none">
              <div className="text-right text-white">
                <div className="text-xs opacity-70">误差</div>
                <div className="font-bold text-lg">{formatDist(myResult.distance)}</div>
              </div>
              <div className="text-right text-white">
                <div className="text-xs opacity-70">得分</div>
                <div className="font-bold text-xl text-orange-400">
                  {myResult.score.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center relative bg-black pt-10">
          <ImageViewer src={currentGame.imageData} />
        </div>

        {/* Floating map button (play mode only) */}
        {!isMapOpen && !isReviewing && (
          <div className="absolute bottom-8 w-full flex justify-end px-6 z-20">
            <button
              onClick={() => setIsMapOpen(true)}
              className="w-16 h-16 bg-orange-500 rounded-full text-white flex items-center justify-center shadow-xl border-4 border-white/20 hover:scale-110 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            </button>
          </div>
        )}

        {/* Backdrop (closes map) */}
        {isMapOpen && !isReviewing && (
          <div
            className="fixed inset-0 z-[25] bg-black/20"
            onClick={() => setIsMapOpen(false)}
            onTouchStart={() => setIsMapOpen(false)}
          />
        )}

        {/* Map sheet */}
        <div
          className={`absolute bottom-0 w-full bg-gray-900 rounded-t-3xl transition-all duration-300 ease-out z-[30] shadow-2xl flex flex-col overflow-hidden ${
            isMapOpen ? (isReviewing ? 'h-[65%]' : 'h-[80%]') : 'h-0'
          }`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {!isReviewing && (
            <button
              onClick={() => setIsMapOpen(false)}
              className="absolute top-3 right-4 w-8 h-8 bg-black/60 rounded-full text-white z-[1100] flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}

          <div className="flex-1 relative bg-gray-200">
            <GameMap
              isOpen={isMapOpen}
              interactive={!isReviewing}
              onLocationSelect={!isReviewing ? setUserGuess : undefined}
              selectedLocation={!isReviewing ? userGuess : null}
              actualLocation={isReviewing ? currentGame.location : undefined}
              guesses={isReviewing ? myGuessAsGuess : undefined}
              currentUserId={currentUser.id}
            />

            {/* Map action button */}
            <div className="absolute bottom-8 w-full flex justify-center px-4 pointer-events-none z-[1000]">
              {!isReviewing && (
                <button
                  onClick={handleSubmitGuess}
                  disabled={!userGuess || isSubmitting}
                  className="pointer-events-auto w-full max-w-sm bg-orange-600 text-white font-bold py-3 rounded-xl shadow-lg disabled:bg-gray-600"
                >
                  {isSubmitting ? '提交中...' : '确定选择'}
                </button>
              )}

              {isReviewing && (
                <button
                  onClick={handleNext}
                  className="pointer-events-auto w-full max-w-sm bg-orange-500 text-white font-bold py-3 rounded-xl shadow-lg"
                >
                  {isLastQuestion ? '查看总成绩' : '下一题 →'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default CollectionPlayer;
