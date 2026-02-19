import React, { useState, useEffect } from 'react';
import { User, GameData, Collection } from '../types';
import { getUserCreatedGames } from '../services/storageService';
import { createCollection } from '../services/collectionService';

interface Props {
  currentUser: User;
  onBack: () => void;
  onPublish: (collection: Collection) => void;
}

const MAX_QUESTIONS = 10;
const MAX_NAME_LEN = 10;

const CollectionCreator: React.FC<Props> = ({ currentUser, onBack, onPublish }) => {
  const [name, setName] = useState('');
  const [myGames, setMyGames] = useState<GameData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    getUserCreatedGames(currentUser.id).then((games) => {
      setMyGames(games);
      setLoading(false);
    });
  }, [currentUser.id]);

  const handleToggle = (gameId: string) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(gameId);
      if (idx >= 0) {
        return prev.filter((id) => id !== gameId);
      }
      if (prev.length >= MAX_QUESTIONS) {
        alert(`最多只能添加 ${MAX_QUESTIONS} 道题`);
        return prev;
      }
      return [...prev, gameId];
    });
  };

  const handlePublish = async () => {
    if (!name.trim()) { alert('请输入集锦名称'); return; }
    if (selectedIds.length === 0) { alert('至少选择 1 道题'); return; }

    setPublishing(true);
    const collection = await createCollection(
      name.trim(),
      selectedIds,
      currentUser.id,
      currentUser.name
    );
    setPublishing(false);

    if (collection) {
      onPublish(collection);
    } else {
      alert('发布失败，请重试');
    }
  };

  const canPublish = name.trim().length > 0 && selectedIds.length >= 1 && !publishing;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="p-2 -ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span className="font-bold">创建集锦</span>
        <button
          onClick={handlePublish}
          disabled={!canPublish}
          className={`px-4 py-1.5 rounded-full font-bold text-sm transition ${
            canPublish ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500'
          }`}
        >
          {publishing ? '发布中...' : '发布'}
        </button>
      </div>

      {/* Name Input */}
      <div className="px-4 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="输入集锦名称（最多10字）"
            value={name}
            maxLength={MAX_NAME_LEN}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-orange-500 pr-12"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            {name.length}/{MAX_NAME_LEN}
          </span>
        </div>
      </div>

      {/* Subtitle */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-sm text-gray-400">选择题目（{selectedIds.length}/{MAX_QUESTIONS}）</span>
        {selectedIds.length > 0 && (
          <button onClick={() => setSelectedIds([])} className="text-xs text-gray-500">
            清空
          </button>
        )}
      </div>

      {/* Game Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : myGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="text-4xl">📷</div>
            <p className="text-gray-400">你还没有出过题</p>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-orange-500 text-white rounded-full font-bold text-sm"
            >
              先去出一道题 →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {myGames.map((game) => {
              const selIdx = selectedIds.indexOf(game.id);
              const isSelected = selIdx >= 0;
              return (
                <div
                  key={game.id}
                  onClick={() => handleToggle(game.id)}
                  className="relative aspect-square cursor-pointer active:scale-95 transition-transform"
                >
                  <img
                    src={game.imageData}
                    alt=""
                    className={`w-full h-full object-cover rounded-xl transition ${
                      isSelected ? 'brightness-75' : 'brightness-100'
                    }`}
                  />
                  {/* Selection badge */}
                  <div
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition ${
                      isSelected
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-black/40 border-white/50 text-transparent'
                    }`}
                  >
                    {isSelected ? selIdx + 1 : ''}
                  </div>
                  {/* Location label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-xl px-2 py-1">
                    <p className="text-white text-xs truncate">{game.locationName || '未知位置'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionCreator;
