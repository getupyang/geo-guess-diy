import React, { useState, useEffect } from 'react';
import { GameMode, GameData, LatLng, GuessResult } from './types';
import MosaicCanvas from './components/MosaicCanvas';
import GameMap from './components/GameMap';
import { saveGame, getGameById, generateId, getGames } from './services/storageService';
import { analyzeImageLocation } from './services/geminiService';

// Declare EXIF global from CDN
declare var EXIF: any;

// Constants
const DEFAULT_LOCATION: LatLng = { lat: 39.9055, lng: 116.3976 };

// Icons
const IconMap = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
);
const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
const IconPlus = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);
const IconRobot = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
);

// Checkerboard Mosaic Icon
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
  const R = 6371e3; // metres
  const φ1 = pos1.lat * Math.PI/180;
  const φ2 = pos2.lat * Math.PI/180;
  const Δφ = (pos2.lat - pos1.lat) * Math.PI/180;
  const Δλ = (pos2.lng - pos1.lng) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

const calculateScore = (distance: number): number => {
  if (distance < 50) return 5000;
  const score = 5000 * Math.exp(-distance / 2000000); 
  return Math.round(score);
};

const App = () => {
  const [mode, setMode] = useState<GameMode>(GameMode.HOME);
  const [currentGame, setCurrentGame] = useState<GameData | null>(null);
  
  // Create State
  const [createImage, setCreateImage] = useState<string | null>(null);
  const [createLocation, setCreateLocation] = useState<LatLng | null>(null);
  const [createLocationName, setCreateLocationName] = useState<string>("");
  const [isMosaicMode, setIsMosaicMode] = useState(false);

  // Play/Shared State
  const [userGuess, setUserGuess] = useState<LatLng | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [result, setResult] = useState<GuessResult | null>(null);

  // AI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiGuess, setAiGuess] = useState<LatLng | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string>("");

  // Router simulation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#play/')) {
        const id = hash.split('/')[1];
        const game = getGameById(id);
        if (game) {
          setCurrentGame(game);
          setMode(GameMode.PLAY);
          setResult(null);
          setUserGuess(null);
          setAiGuess(null);
          setAiReasoning("");
          setIsMapOpen(false);
        } else {
          alert('Game not found!');
          window.location.hash = '';
          setMode(GameMode.HOME);
        }
      } else if (hash === '#create') {
        setMode(GameMode.CREATE);
        setCreateImage(null);
        setCreateLocation(null);
        setCreateLocationName("");
        setIsMapOpen(false);
      } else {
        setMode(GameMode.HOME);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Init
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setCreateImage(evt.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Try EXIF
      if (typeof EXIF !== 'undefined') {
          EXIF.getData(file as any, function(this: any) {
              try {
                  const lat = EXIF.getTag(this, "GPSLatitude");
                  const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                  const lng = EXIF.getTag(this, "GPSLongitude");
                  const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

                  if (lat && latRef && lng && lngRef) {
                      const toDecimal = (coord: number[], ref: string) => {
                          let res = coord[0] + coord[1] / 60 + coord[2] / 3600;
                          if (ref === "S" || ref === "W") res *= -1;
                          return res;
                      };
                      const loc = {
                          lat: toDecimal(lat, latRef),
                          lng: toDecimal(lng, lngRef)
                      };
                      setCreateLocation(loc);
                      setCreateLocationName("图片携带 GPS 信息");
                  } else {
                      setCreateLocation(null);
                  }
              } catch (err) {
                  console.warn("EXIF parsing failed", err);
                  setCreateLocation(null);
              }
          });
      }
    }
  };

  const handleCreateGame = () => {
    if (!createImage) {
        alert("请上传图片");
        return;
    }
    if (!createLocation) {
        alert("请在地图上选择并确认位置");
        setIsMapOpen(true);
        return;
    }
    
    const newGame: GameData = {
      id: generateId(),
      imageData: createImage,
      location: createLocation,
      locationName: createLocationName,
      author: 'User',
      createdAt: Date.now()
    };
    saveGame(newGame);
    
    // Reset to Home properly
    window.location.hash = '';
    setMode(GameMode.HOME);
    alert("挑战发布成功！请在列表中选择挑战。");
  };

  const handleCreateLocationSelect = (latlng: LatLng, name?: string) => {
      setCreateLocation(latlng);
      if (name) setCreateLocationName(name);
  };

  const handleGuess = () => {
    if (!userGuess || !currentGame) return;
    const distance = calculateDistance(currentGame.location, userGuess);
    const score = calculateScore(distance);
    setResult({
      distance,
      score,
      guessLocation: userGuess,
      actualLocation: currentGame.location
    });
    setMode(GameMode.RESULT);
    setIsMapOpen(false); // Map becomes part of result view
  };

  const handleAiAnalyze = async () => {
      if (!currentGame?.imageData || isAnalyzing) return;
      setIsAnalyzing(true);
      
      const res = await analyzeImageLocation(currentGame.imageData);
      setIsAnalyzing(false);
      
      if (res.location) {
          setAiGuess(res.location);
          setAiReasoning(res.reasoning);
          setIsMapOpen(true);
          // Optional: Auto set user guess to AI guess? No, let user decide.
      } else {
          alert("AI 无法识别位置: " + res.reasoning);
      }
  };

  // --- Render Views ---

  if (mode === GameMode.HOME) {
    const savedGames = getGames();
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 space-y-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-amber-600 bg-clip-text text-transparent">
          GeoGuesser
        </h1>
        <div className="grid gap-4 w-full max-w-xs">
          <button 
            onClick={() => window.location.hash = '#create'}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg transition-transform active:scale-95"
          >
            <IconPlus /> 创建新挑战
          </button>
        </div>
        {savedGames.length > 0 && (
            <div className="w-full max-w-md mt-8">
                <h2 className="text-lg font-semibold mb-4 text-gray-300">最近的挑战</h2>
                <div className="space-y-3">
                    {savedGames.map(g => (
                        <div key={g.id} 
                             onClick={() => window.location.hash = `#play/${g.id}`}
                             className="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition">
                            <img src={g.imageData} alt="thumb" className="w-12 h-12 object-cover rounded mr-3" />
                            <div className="flex-1 overflow-hidden">
                                <div className="text-sm font-medium text-white truncate">{g.locationName || `挑战 #${g.id}`}</div>
                                <div className="text-xs text-gray-500">{new Date(g.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div className="text-orange-400 font-bold text-sm">Play</div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </div>
    );
  }

  // Unified Layout for Create and Play
  if (mode === GameMode.CREATE || mode === GameMode.PLAY || mode === GameMode.RESULT) {
    
    // Determine what to display
    const displayImage = mode === GameMode.CREATE ? createImage : currentGame?.imageData;
    const isCreate = mode === GameMode.CREATE;
    
    if (!displayImage && isCreate) {
         // Upload Screen
         return (
            <div className="h-[100dvh] flex flex-col bg-gray-900 text-white">
                <div className="h-14 flex items-center justify-between px-4 bg-gray-800 border-b border-gray-700 z-20">
                    <button onClick={() => window.location.hash = ''} className="text-gray-400"><IconClose /></button>
                    <span className="font-bold">创建题目</span>
                    <div className="w-6"></div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-400 border-2 border-dashed border-gray-700 m-4 rounded-xl hover:border-blue-500 transition-colors">
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="upload" />
                    <label htmlFor="upload" className="flex flex-col items-center cursor-pointer w-full h-full justify-center">
                        <IconPlus />
                        <span className="mt-2">点击上传图片</span>
                    </label>
                </div>
            </div>
         );
    }

    return (
      <div className="relative w-full h-[100dvh] overflow-hidden bg-black flex flex-col">
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-between px-4 pt-2">
            <button onClick={() => window.location.hash = ''} className="text-white bg-black/20 p-2 rounded-full backdrop-blur-sm hover:bg-white/20">
                <IconClose />
            </button>
            
            {isCreate ? (
                <button 
                    onClick={handleCreateGame} 
                    className={`px-4 py-1.5 rounded-full font-bold backdrop-blur-md transition ${createLocation ? 'bg-orange-500 text-white shadow-lg' : 'bg-white/10 text-gray-400 cursor-not-allowed'}`}
                >
                    发布挑战
                </button>
            ) : (
                <div className="flex flex-col items-end text-white drop-shadow-md">
                    <span className="text-xs opacity-80">当前回合</span>
                    <span className="font-bold text-lg text-orange-400">1 / 1</span>
                </div>
            )}
        </div>

        {/* Main Image Content */}
        <div className="flex-1 w-full flex items-center justify-center bg-black relative">
            {isCreate ? (
                <MosaicCanvas 
                    imageSrc={displayImage!} 
                    onImageUpdate={setCreateImage}
                    isEditing={isMosaicMode} 
                />
            ) : (
                <img src={displayImage!} className="max-w-full max-h-full object-contain" alt="Game Target" />
            )}
            
            {/* Create Mode: Location Text Display */}
            {isCreate && createLocation && !isMapOpen && (
                <div className="absolute bottom-28 left-0 right-0 flex justify-center z-10 px-6">
                    <div className="bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 border border-white/10 shadow-lg max-w-full">
                        <span className="truncate">{createLocationName || `${createLocation.lat.toFixed(4)}, ${createLocation.lng.toFixed(4)}`}</span>
                        <IconCheck />
                    </div>
                </div>
            )}

             {/* Play Mode: AI Reasoning Toast */}
             {mode === GameMode.PLAY && aiReasoning && (
                <div className="absolute top-20 left-4 right-4 z-10 animate-fade-in-down">
                     <div className="bg-purple-900/90 backdrop-blur-md text-white p-3 rounded-xl border border-purple-500/30 shadow-2xl text-sm">
                        <div className="flex items-center gap-2 mb-1 font-bold text-purple-300">
                             <IconRobot /> AI 分析结果
                        </div>
                        {aiReasoning}
                     </div>
                </div>
            )}
        </div>

        {/* Tools / Overlays for Create Mode */}
        {isCreate && (
             <div className="absolute bottom-10 left-6 right-6 flex justify-between items-end z-20 pointer-events-none">
                 <button 
                    onClick={() => setIsMosaicMode(!isMosaicMode)}
                    className={`pointer-events-auto w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border-2 border-white/10 transition-all active:scale-90 ${isMosaicMode ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-gray-800/90 text-white backdrop-blur-xl'}`}
                    aria-label="Toggle Mosaic"
                >
                    <IconMosaic />
                </button>
                
                <button 
                    onClick={() => { setIsMapOpen(true); setIsMosaicMode(false); }}
                    className="pointer-events-auto w-14 h-14 bg-blue-600 rounded-full shadow-2xl flex items-center justify-center text-white border-2 border-white/10 active:scale-90 transition-transform"
                    aria-label="Set Location"
                >
                    <IconMap />
                </button>
             </div>
        )}

        {/* Play Mode Buttons */}
        {mode === GameMode.PLAY && !isMapOpen && (
            <div className="absolute bottom-8 right-6 z-20 flex flex-col gap-4">
                 {/* AI Button */}
                 <button 
                    onClick={handleAiAnalyze}
                    disabled={isAnalyzing}
                    className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white border-4 border-white/20 transition-all active:scale-95 ${isAnalyzing ? 'bg-gray-600 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                    <IconRobot />
                </button>

                {/* Map Button */}
                <button 
                    onClick={() => setIsMapOpen(true)}
                    className="w-16 h-16 bg-orange-500 rounded-full shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform active:scale-95 border-4 border-white/20"
                >
                    <IconMap />
                </button>
            </div>
        )}

        {/* Unified Map Sheet */}
        <div 
            className={`absolute bottom-0 left-0 right-0 bg-gray-900 transition-all duration-300 ease-out z-30 rounded-t-3xl shadow-[0_-5px_30px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden
            ${mode === GameMode.RESULT ? 'h-[60%]' : isMapOpen ? 'h-[80%]' : 'h-0'}`}
        >
            {/* Handle Bar / Header area */}
            <div 
                className="w-full h-6 flex items-center justify-center cursor-pointer hover:bg-white/5 rounded-t-3xl shrink-0 z-10 relative"
                onClick={() => mode !== GameMode.RESULT && setIsMapOpen(false)}
            >
                 {mode !== GameMode.RESULT && (
                     <div className="w-12 h-1.5 bg-gray-600 rounded-full" />
                 )}
            </div>
            
            {/* Close Button on Map Sheet (Top Right) */}
            {mode === GameMode.PLAY && isMapOpen && (
                <button 
                    onClick={() => setIsMapOpen(false)}
                    className="absolute top-4 right-4 w-10 h-10 bg-black/80 text-white rounded-full flex items-center justify-center z-[1100] border border-white/20 shadow-lg hover:bg-black active:scale-95"
                >
                    <IconClose />
                </button>
            )}

            {/* Map Area */}
            <div className="flex-1 relative mx-0 bg-gray-800 border-t border-gray-700">
                <GameMap 
                   interactive={mode !== GameMode.RESULT}
                   isOpen={isMapOpen} 
                   enableSearch={isCreate}
                   // Important: For PLAY mode, pass null (or undefined) for initialCenter so it defaults to the world view
                   // Only pass specific center if creating or showing result. 
                   // If AI guessed, show that briefly? Maybe not pan to it to avoid direct spoilers if user wants to search. 
                   // Actually, if AI has a guess, showing it might be helpful. Let's show AI marker but not auto-center unless user asks.
                   initialCenter={isCreate ? createLocation : (mode === GameMode.RESULT ? currentGame?.location : (aiGuess || null))}
                   onLocationSelect={isCreate ? handleCreateLocationSelect : (latlng) => setUserGuess(latlng)}
                   selectedLocation={isCreate ? createLocation : (mode === GameMode.PLAY ? userGuess : result?.guessLocation)}
                   actualLocation={mode === GameMode.RESULT ? currentGame?.location : (aiGuess || undefined)} // Use actualLocation prop to show AI guess as a green/secondary marker in play mode? No, GameMap logic treats actualLocation as the "Target" (Green). We shouldn't abuse it.
                />
                
                {/* Action Buttons inside Map Sheet */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none flex justify-center pb-8 z-[1000]">
                     {mode === GameMode.PLAY && (
                         <button 
                            onClick={handleGuess}
                            disabled={!userGuess}
                            className="pointer-events-auto w-full max-w-sm bg-orange-600 disabled:bg-gray-600 disabled:text-gray-300 text-white font-bold py-3 rounded-xl shadow-lg transition-colors text-lg flex items-center justify-center gap-2"
                        >
                            <IconCheck /> 确定选择
                        </button>
                     )}
                     {isCreate && (
                         <button 
                            onClick={() => {
                                if (!createLocation) {
                                    alert("请先在地图上点击选择一个位置");
                                    return;
                                }
                                setIsMapOpen(false);
                            }}
                            className="pointer-events-auto w-full max-w-sm bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 text-lg"
                        >
                            <IconCheck /> 确认位置
                        </button>
                     )}
                </div>
            </div>

            {/* Result Info Overlay */}
            {mode === GameMode.RESULT && result && (
                <div className="absolute top-2 left-4 right-4 z-[2000] pointer-events-none flex justify-center">
                   <div className="bg-gray-800/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-gray-600 text-center shadow-2xl min-w-[200px]">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">距离目标</div>
                        <div className="text-2xl font-black text-white">{(result.distance / 1000).toFixed(2)} km</div>
                        <div className="text-sm font-bold text-orange-500 mt-1">+{result.score} 分</div>
                   </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  return <div>Error State</div>;
};

export default App;