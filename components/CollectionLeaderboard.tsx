import React from 'react';
import { CollectionAttempt } from '../types';

interface Props {
  topTen: CollectionAttempt[];
  myRecord: CollectionAttempt | null;
  currentUserId: string;
}

const medals = ['🥇', '🥈', '🥉'];

const CollectionLeaderboard: React.FC<Props> = ({ topTen, myRecord, currentUserId }) => {
  if (topTen.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <div className="text-2xl mb-2">🎉</div>
        <div className="font-bold text-white mb-1">你是第一个完成这个集锦的人！</div>
        <div>快去分享，看看朋友能超过你吗？</div>
      </div>
    );
  }

  const myRankInTop = myRecord ? topTen.findIndex((a) => a.userId === myRecord.userId) : -1;
  const myIsOutsideTop = myRecord && myRankInTop === -1;

  return (
    <div className="space-y-2">
      {topTen.map((attempt, index) => {
        const isMe = attempt.userId === currentUserId;
        return (
          <div
            key={attempt.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              isMe ? 'bg-orange-500/20 border border-orange-500/40' : 'bg-gray-800'
            }`}
          >
            <span className="w-6 text-center text-sm font-bold">
              {index < 3 ? medals[index] : <span className="text-gray-400">{index + 1}</span>}
            </span>
            <span className={`flex-1 text-sm font-medium truncate ${isMe ? 'text-orange-300' : 'text-gray-200'}`}>
              {attempt.userName}
              {isMe && <span className="text-xs ml-1 text-orange-400">（你）</span>}
            </span>
            <span className={`font-bold text-sm ${isMe ? 'text-orange-400' : 'text-gray-300'}`}>
              {attempt.totalScore.toLocaleString()} 分
            </span>
          </div>
        );
      })}

      {/* User's row when outside top 10 */}
      {myIsOutsideTop && myRecord && (
        <>
          <div className="text-center text-gray-600 text-xs py-1">···</div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/20 border border-orange-500/40">
            <span className="w-6 text-center text-gray-400 text-sm font-bold">—</span>
            <span className="flex-1 text-sm font-medium text-orange-300 truncate">
              {myRecord.userName}
              <span className="text-xs ml-1 text-orange-400">（你）</span>
            </span>
            <span className="font-bold text-sm text-orange-400">
              {myRecord.totalScore.toLocaleString()} 分
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default CollectionLeaderboard;
