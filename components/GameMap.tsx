
import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LatLng, Guess } from '../types';
import { searchAddress, getAddressFromCoords } from '../services/geocodingService';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../services/coordTransform';

interface GameMapProps {
  initialCenter?: LatLng | null;
  onLocationSelect?: (latlng: LatLng, name?: string) => void;
  selectedLocation?: LatLng | null; // The current user's temporary selection in PLAY mode
  
  // Review Mode Props
  actualLocation?: LatLng | null;
  guesses?: Guess[]; // List of all guesses to display in REVIEW mode
  currentUserId?: string; // To highlight the current user
  
  interactive?: boolean; // If true, allows selecting points. If false, just viewing (but panning/zooming still allowed)
  isOpen?: boolean;
  enableSearch?: boolean;
}

type TileSource = 'globalZh' | 'gaode';

const GameMap: React.FC<GameMapProps> = ({ 
  initialCenter, 
  onLocationSelect, 
  selectedLocation,
  actualLocation,
  guesses = [],
  currentUserId,
  interactive = true,
  isOpen = false,
  enableSearch = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const prevTileSourceRef = useRef<TileSource | null>(null);
  
  // References for cleanup
  const markersRef = useRef<L.Marker[]>([]);
  const linesRef = useRef<L.Polyline[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const isInChina = (loc: LatLng) => loc.lng >= 73 && loc.lng <= 135 && loc.lat >= 18 && loc.lat <= 54;

  // Tile Source (auto-detected)
  const defaultCenter = { lat: 35.8617, lng: 104.1954 };
  const safeCenter = initialCenter || defaultCenter;
  const getTileSourceFor = (loc: LatLng): TileSource => (isInChina(loc) ? 'gaode' : 'globalZh');
  const [tileSource, setTileSource] = useState<TileSource>(() =>
    getTileSourceFor(initialCenter || actualLocation || selectedLocation || safeCenter)
  );

  const toMapCoords = useCallback(
    (loc: LatLng, source: TileSource = tileSource): LatLng => {
      return source === 'gaode' ? wgs84ToGcj02(loc.lat, loc.lng) : loc;
    },
    [tileSource]
  );

  const fromMapCoords = useCallback(
    (loc: LatLng, source: TileSource = tileSource): LatLng => {
      return source === 'gaode' ? gcj02ToWgs84(loc.lat, loc.lng) : loc;
    },
    [tileSource]
  );

  const applyTileSourceToMap = useCallback((map: L.Map, source: TileSource) => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (source === 'gaode') {
      tileLayerRef.current = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        maxZoom: 18,
        subdomains: '1234',
        attribution: '高德地图'
      });
    } else {
      tileLayerRef.current = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=zh-CN&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        subdomains: '0123',
        attribution: 'Google 地图'
      });
    }

    tileLayerRef.current.addTo(map);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // We allow dragging/zoom even if interactive is false (Review Mode),
    // "interactive" here specifically means "Can I click to guess?"
    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomSnap: 0.5,
      dragging: true, // Always allow panning
      touchZoom: true,
      scrollWheelZoom: true
    }).setView([toMapCoords(safeCenter).lat, toMapCoords(safeCenter).lng], initialCenter ? 13 : 3);

    applyTileSourceToMap(mapRef.current, tileSource);

    // Add Resize Observer to handle mobile address bar resizing/keyboard showing
    resizeObserver.current = new ResizeObserver(() => {
        if (mapRef.current) {
            mapRef.current.invalidateSize();
        }
    });
    resizeObserver.current.observe(mapContainerRef.current);

    return () => {
        if (resizeObserver.current) {
            resizeObserver.current.disconnect();
        }
    }

  }, [applyTileSourceToMap, initialCenter, safeCenter, tileSource, toMapCoords]);

  // Re-apply tile source & keep current view consistent
  useEffect(() => {
    const anchor = selectedLocation || actualLocation || initialCenter || safeCenter;
    const nextSource = getTileSourceFor(anchor);
    if (nextSource !== tileSource) {
      setTileSource(nextSource);
    }
  }, [actualLocation, getTileSourceFor, initialCenter, safeCenter, selectedLocation, tileSource]);

  // Keep the tile layer in sync while preserving the current view
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const prevSource = prevTileSourceRef.current || tileSource;
    const currentCenterOnMap = map.getCenter();
    const currentZoom = map.getZoom();
    const centerInWgs = fromMapCoords({ lat: currentCenterOnMap.lat, lng: currentCenterOnMap.lng }, prevSource);

    applyTileSourceToMap(map, tileSource);

    const centerOnNewSource = toMapCoords(centerInWgs, tileSource);
    map.setView([centerOnNewSource.lat, centerOnNewSource.lng], currentZoom, { animate: false });

    prevTileSourceRef.current = tileSource;
  }, [applyTileSourceToMap, fromMapCoords, tileSource, toMapCoords]);

  // Auto-detect tile source on map navigation
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMoveEnd = () => {
      if (!mapRef.current) return;

      const centerOnMap = mapRef.current.getCenter();
      const centerInWgs = fromMapCoords({ lat: centerOnMap.lat, lng: centerOnMap.lng });
      const nextSource = getTileSourceFor(centerInWgs);
      if (nextSource !== tileSource) {
        setTileSource(nextSource);
      }
    };

    mapRef.current.on('moveend', handleMoveEnd);
    return () => {
      mapRef.current?.off('moveend', handleMoveEnd);
    };
  }, [fromMapCoords, getTileSourceFor, tileSource]);

  // Register click handler with correct coordinate system
  useEffect(() => {
    if (!mapRef.current) return;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      if (!interactive || !onLocationSelect) return;
      const wgsPoint = fromMapCoords({ lat: e.latlng.lat, lng: e.latlng.lng });

      onLocationSelect(wgsPoint);

      if (enableSearch) {
          const name = await getAddressFromCoords(wgsPoint.lat, wgsPoint.lng);
          onLocationSelect(wgsPoint, name);
      }
    };

    mapRef.current.on('click', handleClick);
    return () => {
      mapRef.current?.off('click', handleClick);
    };
  }, [enableSearch, fromMapCoords, interactive, onLocationSelect]);

  // Handle Resize Trigger from Parent & Auto Fit Bounds
  // CRITICAL FIX: We must wait for the transition animation (300ms) to finish before fitting bounds,
  // otherwise Leaflet calculates bounds based on a 0-height container.
  useEffect(() => {
    if (isOpen && mapRef.current) {
      // Immediate invalidate just in case
      mapRef.current.invalidateSize();

      const timer = setTimeout(() => {
        if (!mapRef.current) return;

        mapRef.current.invalidateSize();

        // Only auto-fit bounds in REVIEW mode (when actualLocation exists)
        // In PLAY mode, we usually want to keep the user's manual view or default center
        if (actualLocation && guesses.length > 0) {
            const bounds = L.latLngBounds(
              [toMapCoords(actualLocation).lat, toMapCoords(actualLocation).lng],
              [toMapCoords(actualLocation).lat, toMapCoords(actualLocation).lng]
            );
            guesses.forEach(g => {
              const guessPoint = toMapCoords(g.location);
              bounds.extend([guessPoint.lat, guessPoint.lng]);
            });
            mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }, 350); // 350ms > 300ms transition duration
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, actualLocation, guesses, toMapCoords]);

  // Handle Initial Center Update (rarely needed but good for re-centering)
  useEffect(() => {
      if (mapRef.current && initialCenter) {
          const mapPoint = toMapCoords(initialCenter);
          mapRef.current.setView([mapPoint.lat, mapPoint.lng], 13);
      }
  }, [initialCenter?.lat, initialCenter?.lng, toMapCoords]);


  // --- Render Markers & Logic ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear existing layers
    markersRef.current.forEach(m => m.remove());
    linesRef.current.forEach(l => l.remove());
    markersRef.current = [];
    linesRef.current = [];

    // Helper to add marker
    const addMarker = (lat: number, lng: number, icon: L.Icon | L.DivIcon) => {
        const m = L.marker([lat, lng], { icon }).addTo(map);
        markersRef.current.push(m);
        return m;
    };

    // 1. Render Actual Location (Target) - Only if provided (Review Mode)
    if (actualLocation) {
        const actualPoint = toMapCoords(actualLocation);
        const flagIcon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="relative">
                     <div class="absolute -bottom-1 left-1 w-4 h-1 bg-black/30 rounded-full blur-[2px]"></div>
                     <div class="text-3xl filter drop-shadow-md">🚩</div>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [6, 30]
        });
        addMarker(actualPoint.lat, actualPoint.lng, flagIcon);
    }

    // 2. Render User Selection (Play Mode - Temporary Pin)
    if (selectedLocation && interactive) {
        const selectionPoint = toMapCoords(selectedLocation);
        const tempIcon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg animate-bounce"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const m = addMarker(selectionPoint.lat, selectionPoint.lng, tempIcon);

        // Only pan in search mode (Creation), not play mode
        if (enableSearch) {
            map.panTo([selectionPoint.lat, selectionPoint.lng]);
        }
    }

    // 3. Render Guesses (Review Mode - Multiple Avatars)
    if (guesses.length > 0 && actualLocation) {
        // Sort guesses: Current user last (so it's on top z-index), others first
        const sortedGuesses = [...guesses].sort((a, b) => {
            if (a.userId === currentUserId) return 1;
            if (b.userId === currentUserId) return -1;
            return 0;
        });

        // Limit to 10 other players + 1 self + 1 actual = approx 12 max
        const displayGuesses = sortedGuesses.slice(0, 12);

        displayGuesses.forEach(g => {
            const isMe = g.userId === currentUserId;
            const guessPoint = toMapCoords(g.location);

            // Generate Avatar Icon
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${g.userAvatarSeed || g.userId}&backgroundColor=b6e3f4`;
            
            // Logic change: If it's me, show label ALWAYS. If other, show on hover (desktop).
            const html = `
                <div class="relative group">
                    <!-- Avatar Circle -->
                    <div class="w-8 h-8 rounded-full border-2 ${isMe ? 'border-orange-500 z-50 scale-110' : 'border-white z-10'} bg-gray-800 overflow-hidden shadow-lg box-border transition-transform hover:scale-125">
                        <img src="${avatarUrl}" class="w-full h-full object-cover" />
                    </div>
                    <!-- Name Bubble -->
                    <div class="absolute -top-9 left-1/2 -translate-x-1/2 ${isMe ? 'block bg-orange-500 text-white z-[70] border-orange-600' : 'hidden group-hover:block bg-white/90 text-gray-900 z-[60] border-gray-200'} text-[10px] px-2 py-0.5 rounded shadow-sm whitespace-nowrap font-bold border">
                        ${g.userName} ${(g.distance/1000).toFixed(1)}km
                    </div>
                </div>
            `;

            const icon = L.divIcon({
                className: 'bg-transparent',
                html: html,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            addMarker(guessPoint.lat, guessPoint.lng, icon);

            // Draw line ONLY for current user
            const line = L.polyline([
                [guessPoint.lat, guessPoint.lng],
                [toMapCoords(actualLocation).lat, toMapCoords(actualLocation).lng]
            ], {
                color: isMe ? '#f97316' : '#9ca3af', // Orange for me, Gray for others
                weight: isMe ? 3 : 1, 
                opacity: isMe ? 1 : 0.3,
                dashArray: '4, 6' 
            }).addTo(map);
            linesRef.current.push(line);
        });
        
        // Note: We removed the immediate fitBounds here because it often runs before the map is fully visible/sized.
        // We now rely on the useEffect([isOpen...]) with delay to handle the fitting.
    }
  }, [selectedLocation, actualLocation, guesses, currentUserId, interactive, toMapCoords]);

  // --- Handlers ---

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      setIsSearching(true);
      const results = await searchAddress(searchQuery);
      setIsSearching(false);
      if (results.length > 0) {
          const loc = { lat: results[0].lat, lng: results[0].lng };
          const mapLoc = toMapCoords(loc);
          mapRef.current?.setView([mapLoc.lat, mapLoc.lng], 15);
          onLocationSelect?.(loc, results[0].displayName);
      } else {
          alert('未找到地址');
      }
  };

  const handleZoom = (delta: number) => {
      if (delta > 0) mapRef.current?.zoomIn();
      else mapRef.current?.zoomOut();
  };

  return (
    <div className="relative w-full h-full bg-gray-100 touch-auto">
        {/* Search Bar (Only Create Mode) */}
        {enableSearch && isOpen && (
            <div className="absolute top-4 left-4 right-16 z-[1000]">
                <form onSubmit={handleSearch} className="flex gap-2 shadow-lg">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索地点..."
                        className="flex-1 bg-white text-black px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button 
                        type="submit" 
                        disabled={isSearching}
                        className="bg-blue-600 text-white px-4 py-2 rounded-full font-bold text-sm"
                    >
                        {isSearching ? '...' : '搜索'}
                    </button>
                </form>
            </div>
        )}

        {/* Custom Zoom Controls */}
        <div className="absolute top-20 left-4 z-[900] flex flex-col gap-3">
             <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleZoom(1); }} className="w-10 h-10 bg-white rounded-full text-gray-800 shadow-lg flex items-center justify-center hover:bg-gray-100">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
             <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleZoom(-1); }} className="w-10 h-10 bg-white rounded-full text-gray-800 shadow-lg flex items-center justify-center hover:bg-gray-100">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
        </div>

        <div ref={mapContainerRef} className="w-full h-full" style={{ touchAction: 'none' }} />
    </div>
  );
};

export default GameMap;
