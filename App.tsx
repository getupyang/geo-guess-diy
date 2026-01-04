
import React, { useState, useEffect, useRef } from 'react';
import { GameMode, GameData, LatLng, Guess, User } from './types';
import MosaicCanvas from './components/MosaicCanvas';
import GameMap from './components/GameMap';
import ImageViewer from './components/ImageViewer';
import { 
    saveGame, getGameById, generateId, 
    getCurrentUser, saveCurrentUser, getNextUnplayedGame, 
    saveGuess, getGuessesForGame, getUserGuesses, hasUserPlayed,
    rateGame, getUserCreatedGames
} from './services/storageService';
import { getAddressFromCoords } from './services/geocodingService';

// Declare EXIF global from CDN
declare var EXIF: any;

// Icons
const IconMap = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>;
const IconClose = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconUndo = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>;
const IconPlay = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>;
const IconGrid = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;

// New Heart Icon (Solid and Outline)
const IconHeart = ({ filled }: { filled: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={filled ? "text-red-500" : "text-white"}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
);

const IconMosaic = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M7 7H12V12H7V7Z" fill="currentColor"/>
        <path d="M12 2V7H17V2H12Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M2 7H7V12H2V7Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M17 7H22V12H17V7Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M12 12H17V17H12V12Z" fill="currentColor"/>
        <path d="M7 12H12V17H7V12Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M17 12H22V17H17V12Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M7 17H12V22H7V17Z" fill="currentColor" fillOpacity="0.3"/>
        <path d="M12 17H17V22H12V17Z" fill="currentColor" fillOpacity="0.3"/>
    </svg>
);

// Helpers
const calculateDistance = (pos1: LatLng, pos2: LatLng): number => {
  if (!pos1 || !pos2) return 0;
  const R = 6371e3; 
  const φ1 = pos1.lat * Math.PI/180;
  const φ2 = pos2.lat * Math.PI/180;
  const Δφ = (pos2.lat - pos1.lat) * Math.PI/180;
  const Δλ = (pos2.lng - pos1.lng) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const calculateScore = (distance: number): number => {
  if (distance < 50) return 5000;
  return Math.round(5000 * Math.exp(-distance / 2000000));
};

// Image Compression Helper (Aggressive Optimization)
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Reduced from 1280 to 1024 for significant size savings (approx 100KB target)
            const MAX_WIDTH = 1024; 
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Reduced quality to 0.6 for better compression/speed balance on mobile
                resolve(canvas.toDataURL('image/jpeg', 0.6)); 
            } else {
                resolve(img.src); // Fallback
            }
        };
        img.onerror = () => resolve(URL.createObjectURL(file));
    });
};

const App = () => {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mode, setMode] = useState<GameMode>(GameMode.HOME);
  
  // Data State
  const [currentGame, setCurrentGame] = useState<GameData | null>(null);
  const [currentGuesses, setCurrentGuesses] = useState<Guess[]>([]); // For Review Mode
  
  // Create Mode State
  const [createImage, setCreateImage] = useState<string | null>(null);
  const [createImageHistory, setCreateImageHistory] = useState<string[]>([]);
  const [createLocation, setCreateLocation] = useState<LatLng | null>(null);
  const [createLocationName, setCreateLocationName] = useState<string>("");
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [isMosaicMode, setIsMosaicMode] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Play Mode State
  const [userGuess, setUserGuess] = useState<LatLng | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [myResult, setMyResult] = useState<Guess | null>(null);

  // Review Mode Specific (Likes)
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  // History / Recent
  const [recentPlayed, setRecentPlayed] = useState<Guess[]>([]);
  const [myCreatedGames, setMyCreatedGames] = useState<GameData[]>([]);
  
  // Ref to track if we've already initialized the review map for a specific game
  const lastReviewGameId = useRef<string | null>(null);

  // Init User
  useEffect(() => {
    const init = async () => {
        setLoading(true);
        const user = await getCurrentUser();
        setCurrentUser(user);
        await refreshHistory(user.id);
        setLoading(false);
    };
    init();
  }, []);

  const refreshHistory = async (userId: string) => {
      const history = await getUserGuesses(userId);
      setRecentPlayed(history);
  };

  const loadCreatedGames = async () => {
      if (!currentUser) return;
      setLoading(true);
      const games = await getUserCreatedGames(currentUser.id);
      setMyCreatedGames(games);
      setLoading(false);
  };

  const handleEditName = async () => {
      if (!currentUser) return;
      const newName = prompt("请输入新的昵称:", currentUser.name);
      if (newName && newName.trim()) {
          const updated = { ...currentUser, name: newName.trim() };
          await saveCurrentUser(updated);
          setCurrentUser(updated);
      }
  };

  // Router logic
  useEffect(() => {
    const handleHashChange = async () => {
      if (!currentUser) return;
      
      const hash = window.location.hash;
      
      if (hash.startsWith('#play/')) {
        const id = hash.split('/')[1];
        lastReviewGameId.current = null; // Reset review tracker
        
        setLoading(true);
        const game = await getGameById(id);
        
        if (game) {
            // Check if played
            const played = await hasUserPlayed(id, currentUser.id);
            if (played) {
                window.location.hash = `#review/${id}`;
            } else {
                startPlay(game);
            }
        } else {
          alert('Challenge not found');
          window.location.hash = '';
        }
        setLoading(false);

      } else if (hash.startsWith('#review/')) {
          setLoading(true);
          const id = hash.split('/')[1];
          const game = await getGameById(id);
          if (game) {
              await startReview(game);
          } else {
              window.location.hash = '';
          }
          setLoading(false);

      } else if (hash === '#create') {
        setMode(GameMode.CREATE);
        resetCreateState();

      } else if (hash === '#history') {
        setMode(GameMode.HISTORY);

      } else if (hash === '#created') {
        setMode(GameMode.CREATED_LIST);
        loadCreatedGames();

      } else {
        setMode(GameMode.HOME);
        refreshHistory(currentUser.id);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Execute immediately only if user is ready and we haven't loaded initial route yet
    if (currentUser) {
        handleHashChange(); 
    }
    
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser]); 

  const resetCreateState = () => {
    setCreateImage(null);
    setCreateImageHistory([]);
    setCreateLocation(null);
    setCreateLocationName("");
    setIsLoadingAddress(false);
    setIsMapOpen(false);
    setIsMosaicMode(false);
    setIsPublishing(false);
  };

  const startPlay = (game: GameData) => {
      setCurrentGame(game);
      setMode(GameMode.PLAY);
      setUserGuess(null);
      setIsMapOpen(false);
      setMyResult(null);
  };

  const startReview = async (game: GameData) => {
      setCurrentGame(game);
      setMode(GameMode.REVIEW);
      
      // Init Like State
      setLikeCount(game.likes || 0);
      if (currentUser) {
          const likedInStorage = localStorage.getItem(`geoguesser_liked_${game.id}`);
          setIsLiked(!!likedInStorage);
      }

      const guesses = await getGuessesForGame(game.id);
      setCurrentGuesses(guesses);
      
      // Find my specific result if available
      if (currentUser) {
          const mine = guesses.find(g => g.userId === currentUser.id);
          if (mine) setMyResult(mine);
      }
      
      // FIX: Check if we are already viewing this game ID to avoid re-opening map
      if (lastReviewGameId.current !== game.id) {
          setIsMapOpen(true);
          lastReviewGameId.current = game.id;
      }
  };

  // --- Actions ---

  const handleStartRandom = async () => {
      if (!currentUser) return;
      
      setLoading(true);
      try {
        const game = await getNextUnplayedGame(currentUser.id);
        setLoading(false);
        
        if (game) {
            window.location.hash = `#play/${game.id}`;
        } else {
            alert("太棒了！你已经完成了所有现有挑战。没有新挑战了，欢迎上传你自己的拍摄！");
        }
      } catch (e) {
          setLoading(false);
          alert("获取挑战失败，请检查网络");
      }
  };

  const handleCreateGame = async () => {
    if (!createImage || !createLocation || !currentUser) return;
    
    setIsPublishing(true);

    // If name is still empty (network lag), fallback to coordinate string
    let finalLocationName = createLocationName;
    if (!finalLocationName || finalLocationName.trim() === "") {
        finalLocationName = `${createLocation.lat.toFixed(3)}°N, ${createLocation.lng.toFixed(3)}°E`;
    }

    const newGame: GameData = {
      id: generateId(),
      imageData: createImage,
      location: createLocation,
      locationName: finalLocationName,
      authorId: currentUser.id,
      authorName: currentUser.name,
      createdAt: Date.now()
    };
    
    const success = await saveGame(newGame);
    setIsPublishing(false);

    if (success) {
        alert("挑战发布成功！");
        window.location.hash = '';
    } else {
        alert("发布失败，请重试");
    }
  };

  const handleGuess = async () => {
    if (!userGuess || !currentGame || !currentUser) return;
    
    setLoading(true);
    const distance = calculateDistance(currentGame.location, userGuess);
    const score = calculateScore(distance);
    
    const newGuess: Guess = {
        id: generateId(),
        gameId: currentGame.id,
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatarSeed: currentUser.avatarSeed,
        location: userGuess,
        distance,
        score,
        timestamp: Date.now()
    };
    
    await saveGuess(newGuess);
    // Go to review mode
    window.location.hash = `#review/${currentGame.id}`;
  };

  const handleToggleLike = async () => {
      if (!currentGame || !currentUser) return;

      const newIsLiked = !isLiked;
      const newCount = newIsLiked ? likeCount + 1 : Math.max(0, likeCount - 1);

      // Optimistic UI update
      setIsLiked(newIsLiked);
      setLikeCount(newCount);

      // Local Persistence
      if (newIsLiked) {
          localStorage.setItem(`geoguesser_liked_${currentGame.id}`, 'true');
      } else {
          localStorage.removeItem(`geoguesser_liked_${currentGame.id}`);
      }

      // Backend update
      await rateGame(currentGame.id, newIsLiked ? 'like' : 'unlike');
  };

  // --- Components for Views ---

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1. Extract EXIF first from original file
      if (typeof EXIF !== 'undefined') {
          EXIF.getData(file as any, function(this: any) {
              const lat = EXIF.getTag(this, "GPSLatitude");
              const lng = EXIF.getTag(this, "GPSLongitude");
              if (lat && lng) {
                  const toDecimal = (coord: number[], ref: string) => {
                      let res = coord[0] + coord[1] / 60 + coord[2] / 3600;
                      if (ref === "S" || ref === "W") res *= -1;
                      return res;
                  };
                  const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                  const lngRef = EXIF.getTag(this, "GPSLongitudeRef");
                  if (latRef && lngRef) {
                      const loc = { lat: toDecimal(lat, latRef), lng: toDecimal(lng, lngRef) };
                      setCreateLocation(loc);
                      setCreateLocationName("");
                      setIsLoadingAddress(true);
                      getAddressFromCoords(loc.lat, loc.lng).then(name => {
                          setCreateLocationName(name);
                          setIsLoadingAddress(false);
                      }).catch(() => {
                          setCreateLocationName("未知地点");
                          setIsLoadingAddress(false);
                      });
                  }
              }
          });
      }

      // 2. Compress Image for State
      try {
        const compressedBase64 = await compressImage(file);
        setCreateImage(compressedBase64);
        setCreateImageHistory([]);
      } catch (err) {
          console.error("Compression failed", err);
      }
    }
  };

  // --- Loading View ---
  if (loading && !currentGame && mode !== GameMode.CREATE && mode !== GameMode.CREATED_LIST) {
      return (
          <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
              <div className="text-center">
                  <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p>加载数据中...</p>
              </div>
          </div>
      );
  }

  // --- Views ---

  if (mode === GameMode.HOME) {
    const recentUnique = recentPlayed.slice(0, 2);

    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col p-6">
        {/* Header / Profile */}
        <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-600 bg-clip-text text-transparent">
               GeoGuesser
            </h1>
            <div className="flex items-center gap-2 cursor-pointer" onClick={handleEditName}>
                <div className="text-right">
                    <div className="text-xs text-gray-400">ID: {currentUser?.id.substr(0,4)}</div>
                    <div className="font-bold text-sm">{currentUser?.name}</div>
                </div>
                <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.avatarSeed}&backgroundColor=b6e3f4`} 
                    className="w-10 h-10 rounded-full border border-gray-600 bg-gray-800"
                    alt="avatar"
                />
            </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mb-8">
            <button 
                onClick={handleStartRandom}
                disabled={loading}
                className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-lg flex items-center justify-center gap-3 text-lg font-bold active:scale-95 transition-transform disabled:opacity-50"
            >
                {loading ? '加载中...' : <><IconPlay /> 开始新挑战</>}
            </button>
            
            <button 
                onClick={() => window.location.hash = '#create'}
                className="w-full py-5 bg-gray-800 border border-gray-700 rounded-2xl shadow-lg flex items-center justify-center gap-3 text-lg font-bold hover:bg-gray-700 active:scale-95 transition-transform"
            >
                <IconPlus /> 创建新挑战
            </button>
            
             <button 
                onClick={() => window.location.hash = '#created'}
                className="w-full py-3 bg-gray-900 border border-gray-800 rounded-xl shadow text-gray-400 text-sm font-medium hover:text-white flex items-center justify-center gap-2"
            >
                <IconGrid /> 我发布的挑战
            </button>
        </div>

        {/* Recent Section */}
        <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-200">最近游玩</h2>
                <button onClick={() => window.location.hash = '#history'} className="text-sm text-blue-400 font-medium">查看更多</button>
            </div>
            
            <div className="space-y-4">
                {recentUnique.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">暂无挑战记录，快去开始吧！</div>
                ) : (
                    recentUnique.map(guess => (
                        <AsyncGameCard key={guess.id} guess={guess} />
                    ))
                )}
            </div>
        </div>
      </div>
    );
  }

  if (mode === GameMode.HISTORY) {
      return (
        <div className="min-h-screen bg-gray-900 text-white p-4">
             <div className="flex items-center gap-4 mb-6">
                 <button onClick={() => window.location.hash = ''} className="p-2 bg-gray-800 rounded-full"><IconClose /></button>
                 <h1 className="text-xl font-bold">游玩记录</h1>
             </div>
             <div className="grid grid-cols-2 gap-4 pb-8">
                 {recentPlayed.map(guess => (
                     <AsyncGameCard key={guess.id} guess={guess} simple />
                 ))}
             </div>
        </div>
      );
  }

  if (mode === GameMode.CREATED_LIST) {
      return (
        <div className="min-h-screen bg-gray-900 text-white p-4">
             <div className="flex items-center gap-4 mb-6">
                 <button onClick={() => window.location.hash = ''} className="p-2 bg-gray-800 rounded-full"><IconClose /></button>
                 <h1 className="text-xl font-bold">我发布的</h1>
             </div>
             
             {loading ? (
                  <div className="text-center py-10 text-gray-500">加载中...</div>
             ) : (
                 <div className="grid grid-cols-2 gap-4 pb-8">
                     {myCreatedGames.length === 0 ? (
                         <div className="col-span-2 text-center py-10 text-gray-500">
                             你还没有发布过挑战<br/>
                             <span className="text-sm mt-2 block text-gray-600">点击首页“创建新挑战”来贡献题目</span>
                         </div>
                     ) : (
                         myCreatedGames.map(game => (
                             <div 
                                key={game.id}
                                onClick={() => window.location.hash = `#review/${game.id}`}
                                className="bg-gray-800 rounded-xl overflow-hidden shadow-md active:scale-95 transition-transform cursor-pointer"
                             >
                                <div className="w-full relative h-32">
                                    <img src={game.imageData} className="w-full h-full object-cover" alt="thumb" />
                                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded-full text-xs font-bold text-red-400 flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                        {game.likes || 0}
                                    </div>
                                </div>
                                <div className="p-3">
                                    <div className="truncate text-sm text-gray-300 font-medium">
                                        {game.locationName || "未知位置"}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {new Date(game.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                             </div>
                         ))
                     )}
                 </div>
             )}
        </div>
      );
  }

  // Unified Create / Play / Review View
  if ([GameMode.CREATE, GameMode.PLAY, GameMode.REVIEW].includes(mode)) {
      const isCreate = mode === GameMode.CREATE;
      const isReview = mode === GameMode.REVIEW;
      const displayImage = isCreate ? createImage : currentGame?.imageData;

      // Stats Calculation
      let avgScore = 0;
      let playerCount = 0;
      if (isReview && currentGuesses.length > 2) {
          playerCount = currentGuesses.length;
          const total = currentGuesses.reduce((acc, curr) => acc + curr.score, 0);
          avgScore = Math.round(total / playerCount);
      }

      if (!displayImage && isCreate) {
          return (
             <div className="h-[100dvh] bg-gray-900 text-white flex flex-col">
                 <div className="h-14 flex items-center px-4 border-b border-gray-800">
                     <button onClick={() => window.location.hash = ''}><IconClose /></button>
                     <span className="mx-auto font-bold">上传题目</span>
                     <div className="w-6"/>
                 </div>
                 <div className="flex-1 p-6 flex items-center justify-center">
                     <input type="file" accept="image/*" id="upload" onChange={handleImageUpload} className="hidden" />
                     <label htmlFor="upload" className="flex flex-col items-center gap-4 text-gray-500 p-8 border-2 border-dashed border-gray-700 rounded-xl w-full h-64 justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition">
                         <IconPlus />
                         <span>点击上传照片</span>
                     </label>
                 </div>
             </div>
          )
      }

      return (
          <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
              {/* Header */}
              <div className="absolute top-0 w-full h-16 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-between px-4 pt-2 pointer-events-none">
                  <button onClick={() => window.location.hash = ''} className="pointer-events-auto p-2 bg-black/30 rounded-full text-white backdrop-blur"><IconClose /></button>
                  
                  {isCreate && (
                      <button 
                        onClick={handleCreateGame}
                        disabled={isPublishing}
                        className={`pointer-events-auto px-4 py-1.5 rounded-full font-bold backdrop-blur-md transition ${createLocation && !isPublishing ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400'}`}
                      >{isPublishing ? '发布中...' : '发布'}</button>
                  )}
                  {isReview && myResult && (
                      <div className="flex gap-4">
                          <div className="flex flex-col items-end text-white">
                              <span className="text-xs opacity-70">距离</span>
                              <span className="font-bold text-lg text-white">
                                {myResult.distance < 1000 
                                    ? `${Math.round(myResult.distance)}m` 
                                    : `${(myResult.distance / 1000).toFixed(1)}km`}
                              </span>
                          </div>
                          <div className="flex flex-col items-end text-white">
                              <span className="text-xs opacity-70">得分</span>
                              <span className="font-bold text-xl text-orange-400">{myResult.score}</span>
                          </div>
                      </div>
                  )}
              </div>

              {/* Review Statistics Bar (Overlay below header) */}
              {isReview && playerCount > 2 && (
                  <div className="absolute top-16 left-0 w-full flex justify-center z-10 pointer-events-none">
                      <div className="bg-black/40 backdrop-blur rounded-full px-4 py-1 flex items-center gap-4 text-xs text-white/90 border border-white/10">
                          <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                              {playerCount}人挑战
                          </span>
                          <span className="w-px h-3 bg-white/20"></span>
                          <span>平均分 {avgScore}</span>
                      </div>
                  </div>
              )}

              {/* Content */}
              <div className="flex-1 flex items-center justify-center relative bg-black">
                  {isCreate ? (
                      <MosaicCanvas 
                        imageSrc={displayImage!} 
                        onImageUpdate={(b64) => {
                            if(createImage) setCreateImageHistory(prev => [...prev, createImage].slice(-5));
                            setCreateImage(b64);
                        }}
                        isEditing={isMosaicMode} 
                      />
                  ) : (
                      // Use new ImageViewer for Play/Review
                      <ImageViewer src={displayImage!} />
                  )}

                  {/* Create Location Tag */}
                  {isCreate && createLocation && !isMapOpen && (
                      <div className="absolute bottom-28 bg-black/60 backdrop-blur px-4 py-2 rounded-lg text-white flex items-center gap-2 border border-white/10 pointer-events-none">
                          <span className="text-sm truncate max-w-[200px]">
                            {isLoadingAddress ? "正在解析地址..." : (createLocationName || "未知地点")}
                          </span>
                          {isLoadingAddress ? (
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                          ) : <IconCheck />}
                      </div>
                  )}
              </div>

              {/* Create Tools */}
              {isCreate && (
                  <div className="absolute bottom-8 left-6 right-6 flex justify-between z-20 pointer-events-none">
                      <div className="flex gap-4 pointer-events-auto">
                          <button onClick={() => setIsMosaicMode(!isMosaicMode)} className={`w-12 h-12 rounded-full flex items-center justify-center border-2 border-white/20 shadow-lg ${isMosaicMode ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300'}`}><IconMosaic /></button>
                          <button onClick={() => { if(createImageHistory.length){ setCreateImage(createImageHistory.pop()!); setCreateImageHistory([...createImageHistory]); }}} disabled={!createImageHistory.length} className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center border-2 border-white/20 shadow-lg disabled:opacity-50"><IconUndo /></button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setIsMapOpen(true); setIsMosaicMode(false); }} className="pointer-events-auto w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white/20"><IconMap /></button>
                  </div>
              )}

              {/* Play / Review Mode Floating Actions */}
              {!isMapOpen && !isCreate && (
                  <div className="absolute bottom-8 w-full px-6 flex items-end justify-between z-20 pointer-events-none">
                       {/* Like Button (Review Mode Only) */}
                       {isReview ? (
                           <div className="pointer-events-auto">
                               <button 
                                 onClick={handleToggleLike}
                                 className="flex items-center gap-2 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-3 shadow-lg transition active:scale-95"
                               >
                                   <IconHeart filled={isLiked} />
                                   {likeCount > 0 && (
                                       <span className="text-white font-bold">{likeCount}</span>
                                   )}
                               </button>
                           </div>
                       ) : <div />}

                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsMapOpen(true); }} 
                        className="pointer-events-auto w-16 h-16 bg-orange-500 rounded-full text-white flex items-center justify-center shadow-xl border-4 border-white/20 hover:scale-110 transition"
                      >
                          <IconMap />
                      </button>
                  </div>
              )}

              {/* BACKDROP - Critical Fix for "Map immediately closing" */}
              {isMapOpen && (
                  <div 
                    className="fixed inset-0 z-[25] bg-black/20" 
                    onClick={() => setIsMapOpen(false)}
                    onTouchStart={() => setIsMapOpen(false)}
                  />
              )}

              {/* Map Sheet */}
              <div 
                  className={`absolute bottom-0 w-full bg-gray-900 rounded-t-3xl transition-all duration-300 ease-out z-[30] shadow-2xl flex flex-col overflow-hidden ${isMapOpen ? (isReview ? 'h-[60%]' : 'h-[80%]') : 'h-0'}`}
                  // IMPORTANT: Stop bubbling so clicking the sheet doesn't hit the backdrop or parent listeners
                  onClick={(e) => e.stopPropagation()} 
                  onTouchStart={(e) => e.stopPropagation()}
              >
                  {/* Close Map Btn - Explicit */}
                  <button onClick={() => setIsMapOpen(false)} className="absolute top-3 right-4 w-8 h-8 bg-black/60 rounded-full text-white z-[1100] flex items-center justify-center"><IconClose /></button>

                  <div className="flex-1 relative bg-gray-200">
                      <GameMap
                          isOpen={isMapOpen}
                          interactive={mode !== GameMode.REVIEW}
                          enableSearch={isCreate}
                          initialCenter={isCreate ? createLocation : null}
                          onLocationSelect={isCreate ? (l, n) => {
                              setCreateLocation(l);
                              if (n === undefined) {
                                  // First call (no name yet) - start loading
                                  setIsLoadingAddress(true);
                                  setCreateLocationName("");
                              } else {
                                  // Second call (with name) - done loading
                                  setIsLoadingAddress(false);
                                  setCreateLocationName(n);
                              }
                           } : setUserGuess}
                          selectedLocation={isCreate ? createLocation : (mode === GameMode.PLAY ? userGuess : null)}
                          
                          // Review Props
                          actualLocation={isReview ? currentGame?.location : undefined}
                          guesses={isReview ? currentGuesses : undefined}
                          currentUserId={currentUser?.id}
                      />

                      {/* Map Action Buttons */}
                      <div className="absolute bottom-8 w-full flex justify-center px-4 pointer-events-none z-[1000]">
                          {mode === GameMode.PLAY && (
                              <button onClick={handleGuess} disabled={!userGuess} className="pointer-events-auto w-full max-w-sm bg-orange-600 text-white font-bold py-3 rounded-xl shadow-lg disabled:bg-gray-600">
                                  {loading ? '提交中...' : '确定选择'}
                              </button>
                          )}
                          {isCreate && (
                              <button onClick={() => { if(!createLocation) return; setIsMapOpen(false); }} className="pointer-events-auto w-full max-w-sm bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg">确认位置</button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  return <div>Loading...</div>;
};

// Internal Helper Component for Async List Items
const AsyncGameCard = ({ guess, simple }: { guess: Guess, simple?: boolean }) => {
    const [game, setGame] = useState<GameData | null>(null);

    useEffect(() => {
        getGameById(guess.gameId).then(setGame);
    }, [guess.gameId]);

    if (!game) return (
        <div className={`bg-gray-800 rounded-xl overflow-hidden shadow-md animate-pulse ${simple ? 'h-40' : 'h-48'}`}>
            <div className="bg-gray-700 w-full h-full"></div>
        </div>
    );

    return (
        <div 
            onClick={() => window.location.hash = `#review/${game.id}`}
            className={`bg-gray-800 rounded-xl overflow-hidden shadow-md active:scale-95 transition-transform cursor-pointer ${simple ? '' : ''}`}
        >
            <div className={`w-full relative ${simple ? 'h-32' : 'h-32'}`}>
                <img src={game.imageData} className="w-full h-full object-cover" alt="thumb" />
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs font-bold text-orange-400">
                    {guess.score}分
                </div>
            </div>
            <div className="p-3">
                <div className="truncate text-sm text-gray-300 font-medium">
                    {game.locationName || "未知位置"}
                </div>
                {!simple && (
                    <div className="text-xs text-gray-500 mt-1 flex justify-between">
                        <span>{new Date(guess.timestamp).toLocaleDateString()}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;