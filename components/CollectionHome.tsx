import React, { useState, useEffect } from 'react';
import { User, GameData, Collection } from '../types';
import { getGameById } from '../services/storageService';
import {
  getCollection,
  getCollectionProgress,
  getCollectionLeaderboard,
  getCollectionStats,
  CollectionWithStats,
  CollectionStats,
} from '../services/collectionService';
import { CollectionAttempt } from '../types';
import CollectionLeaderboard from './CollectionLeaderboard';

interface Props {
  collectionId: string;
  currentUser: User;
  onBack: () => void;
  onStartPlay: (collectionId: string, gameIds: string[], startIndex: number) => void;
}

// Lazily loads one game thumbnail
const GameThumb: React.FC<{ gameId: string; index: number; avgScore?: number }> = ({
  gameId,
  index,
  avgScore,
}) => {
  const [game, setGame] = useState<GameData | null>(null);
  useEffect(() => {
    getGameById(gameId).then(setGame);
  }, [gameId]);

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-6 text-center text-xs text-gray-500 font-bold flex-shrink-0">
        {index + 1}
      </span>
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
        {game ? (
          <img src={game.imageData} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-700 animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 truncate">{game?.locationName || '加载中...'}</p>
        {avgScore !== undefined && (
          <p className="text-xs text-gray-500 mt-0.5">平均得分 {avgScore.toLocaleString()} 分</p>
        )}
      </div>
    </div>
  );
};

const CollectionHome: React.FC<Props> = ({ collectionId, currentUser, onBack, onStartPlay }) => {
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [gameIds, setGameIds] = useState<string[]>([]);

  // Creator-specific
  const [stats, setStats] = useState<CollectionStats | null>(null);

  // Player-specific
  const [leaderboard, setLeaderboard] = useState<{
    topTen: CollectionAttempt[];
    myRecord: CollectionAttempt | null;
  } | null>(null);

  const [isCreator, setIsCreator] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasProgress, setHasProgress] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [shareToast, setShareToast] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result = await getCollection(collectionId);
      if (!result) {
        setLoading(false);
        return;
      }

      const { collection: coll, gameIds: ids } = result;
      setCollection(coll);
      setGameIds(ids);

      const creator = coll.authorId === currentUser.id;
      setIsCreator(creator);

      if (creator) {
        const s = await getCollectionStats(collectionId);
        setStats(s);
      } else {
        // Check progress
        const progress = getCollectionProgress(collectionId, currentUser.id);
        if (progress?.isCompleted) {
          setIsCompleted(true);
        } else if (progress) {
          setHasProgress(true);
          setStartIndex(progress.completedItems.length);
        }

        // Load leaderboard for completed players (and non-completed who want to peek)
        if (progress?.isCompleted) {
          const lb = await getCollectionLeaderboard(collectionId, currentUser.id);
          setLeaderboard(lb);
        }
      }

      setLoading(false);
    };

    load();
  }, [collectionId, currentUser.id]);

  const handleShare = async () => {
    if (!collection) return;
    const url = `${window.location.origin}/?collection=${collectionId}`;
    const progress = getCollectionProgress(collectionId, currentUser.id);

    let text: string;
    if (isCreator) {
      text = `我出了一套地理猜谜集锦《${collection.name}》，共 ${collection.itemCount} 道题，快来挑战看看你能得多少分？`;
    } else if (isCompleted && leaderboard?.myRecord) {
      text = `我在《${collection.name}》中得了 ${leaderboard.myRecord.totalScore.toLocaleString()} 分，快来挑战看看能不能超过我？`;
    } else {
      text = `我正在挑战《${collection.name}》地理猜谜集锦，来一起玩！`;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    } catch {
      prompt('复制以下内容分享：', `${text}\n${url}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white gap-4">
        <p className="text-gray-400">集锦不存在或已被删除</p>
        <button onClick={onBack} className="px-6 py-2 bg-gray-800 rounded-full text-sm">
          返回
        </button>
      </div>
    );
  }

  // ---- CREATOR VIEW ----
  if (isCreator) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center gap-4 px-4 h-14 border-b border-gray-800 flex-shrink-0">
          <button onClick={onBack} className="p-2 -ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 className="font-bold text-lg flex-1 truncate">{collection.name}</h1>
          <span className="text-xs text-gray-500">{collection.itemCount} 道题</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-2xl p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">{stats.totalCompletions}</div>
                <div className="text-xs text-gray-400 mt-1">完成人数</div>
              </div>
              <div className="bg-gray-800 rounded-2xl p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {stats.totalCompletions > 0 ? stats.avgTotalScore.toLocaleString() : '—'}
                </div>
                <div className="text-xs text-gray-400 mt-1">平均总分</div>
              </div>
            </div>
          )}

          {/* Per-question list */}
          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">题目列表</h2>
            <div className="divide-y divide-gray-700">
              {gameIds.map((gid, idx) => {
                const avg = stats?.perGameAvgScore.find((p) => p.gameId === gid);
                return (
                  <GameThumb
                    key={gid}
                    gameId={gid}
                    index={idx}
                    avgScore={stats && stats.totalCompletions > 0 ? avg?.avgScore : undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Share button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800">
          <button
            onClick={handleShare}
            className="w-full py-3.5 bg-orange-500 rounded-2xl font-bold text-white active:scale-95 transition-transform"
          >
            {shareToast ? '✓ 已复制到剪贴板' : '分享集锦'}
          </button>
        </div>
      </div>
    );
  }

  // ---- COMPLETED PLAYER VIEW ----
  if (isCompleted && leaderboard) {
    const myScore = leaderboard.myRecord?.totalScore ?? 0;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center gap-4 px-4 h-14 border-b border-gray-800 flex-shrink-0">
          <button onClick={onBack} className="p-2 -ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 className="font-bold text-lg flex-1 truncate">{collection.name}</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
          {/* Celebration banner */}
          <div className="bg-gradient-to-br from-orange-500/20 to-yellow-500/10 border border-orange-500/30 rounded-3xl p-6 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-xl font-bold text-white mb-1">恭喜完成！</p>
            <p className="text-sm text-gray-400">
              {collection.name} · {collection.itemCount} 道题
            </p>
            <p className="text-xs text-gray-500 mt-0.5">由 {collection.authorName} 创建</p>
            <div className="mt-5">
              <div className="text-5xl font-bold text-orange-400 leading-none">
                {myScore.toLocaleString()}
              </div>
              <p className="text-sm text-gray-400 mt-1">你的总得分</p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">排行榜</h2>
            <CollectionLeaderboard
              topTen={leaderboard.topTen}
              myRecord={leaderboard.myRecord}
              currentUserId={currentUser.id}
            />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800">
          <button
            onClick={handleShare}
            className="w-full py-3.5 bg-orange-500 rounded-2xl font-bold text-white active:scale-95 transition-transform"
          >
            {shareToast ? '✓ 已复制到剪贴板' : '分享成绩'}
          </button>
        </div>
      </div>
    );
  }

  // ---- UNCOMPLETED PLAYER VIEW ----
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="flex items-center gap-4 px-4 h-14 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="p-2 -ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="font-bold text-lg flex-1 truncate">{collection.name}</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
        <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        </div>
        <h2 className="text-2xl font-bold">{collection.name}</h2>
        <p className="text-gray-400 text-sm">
          由 <span className="text-gray-200">{collection.authorName}</span> 创建
        </p>
        <p className="text-gray-500 text-sm">{collection.itemCount} 道题</p>

        {hasProgress && (
          <div className="mt-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-2 text-sm text-orange-300">
            你上次答到第 {startIndex}/{collection.itemCount} 题
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 pb-8">
        <button
          onClick={() => onStartPlay(collectionId, gameIds, startIndex)}
          className="w-full py-4 bg-orange-500 rounded-2xl font-bold text-lg text-white active:scale-95 transition-transform"
        >
          {hasProgress ? '继续答题' : '开始答题'}
        </button>
        <button
          onClick={handleShare}
          className="w-full py-3 bg-gray-800 rounded-2xl font-bold text-gray-300 text-sm active:scale-95 transition-transform border border-gray-700"
        >
          {shareToast ? '✓ 已复制到剪贴板' : '分享给朋友'}
        </button>
      </div>
    </div>
  );
};

export default CollectionHome;
