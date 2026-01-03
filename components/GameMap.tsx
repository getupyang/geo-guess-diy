
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LatLng, Guess } from '../types';
import { searchAddress, getAddressFromCoords } from '../services/geocodingService';

// WGS84 to GCJ-02 coordinate conversion (for China map services)
// Source: https://github.com/wandergis/coordtransform
const PI = 3.1415926535897932384626;
const a = 6378245.0; // 长半轴
const ee = 0.00669342162296594323; // 偏心率平方

function transformLat(lng: number, lat: number): number {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * PI) + 40.0 * Math.sin(lng / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * PI) + 300.0 * Math.sin(lng / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function wgs84ToGcj02(wgsLat: number, wgsLng: number): { lat: number; lng: number } {
  if (outOfChina(wgsLng, wgsLat)) {
    return { lat: wgsLat, lng: wgsLng };
  }
  let dLat = transformLat(wgsLng - 105.0, wgsLat - 35.0);
  let dLng = transformLng(wgsLng - 105.0, wgsLat - 35.0);
  const radLat = wgsLat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
  return { lat: wgsLat + dLat, lng: wgsLng + dLng };
}

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
  
  // References for cleanup
  const markersRef = useRef<L.Marker[]>([]);
  const linesRef = useRef<L.Polyline[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Default center (China)
  const defaultCenter = { lat: 35.8617, lng: 104.1954 };
  const rawCenter = initialCenter || defaultCenter;
  const safeCenter = wgs84ToGcj02(rawCenter.lat, rawCenter.lng);

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
    }).setView([safeCenter.lat, safeCenter.lng], initialCenter ? 13 : 3);

    // GaoDe Map (AutoNavi) for Chinese labels globally
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      maxZoom: 18,
      subdomains: '1234',
      attribution: '高德地图'
    }).addTo(mapRef.current);

    mapRef.current.on('click', async (e) => {
      // Only allow setting a marker if interactive is true
      if (!interactive || !onLocationSelect) return;

      // IMPORTANT: Use a single location object to avoid coordinate mismatch
      const clickedLocation = { lat: e.latlng.lat, lng: e.latlng.lng };

      if (enableSearch) {
          // Create Mode: First call with location only (immediate feedback)
          onLocationSelect(clickedLocation);

          // Then fetch address and call again with same location + name
          try {
              const name = await getAddressFromCoords(clickedLocation.lat, clickedLocation.lng);
              // Pass the SAME location object to ensure coordinates match
              onLocationSelect(clickedLocation, name);
          } catch (error) {
              console.error('Failed to fetch address:', error);
              // If address fetch fails, still keep the location set
          }
      } else {
          // Play Mode: Single call, no address needed
          onLocationSelect(clickedLocation);
      }
    });

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

  }, []);

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
            const actualConverted = wgs84ToGcj02(actualLocation.lat, actualLocation.lng);
            const bounds = L.latLngBounds([actualConverted.lat, actualConverted.lng], [actualConverted.lat, actualConverted.lng]);
            guesses.forEach(g => {
                const guessConverted = wgs84ToGcj02(g.location.lat, g.location.lng);
                bounds.extend([guessConverted.lat, guessConverted.lng]);
            });
            mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }, 350); // 350ms > 300ms transition duration
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, actualLocation, guesses]);

  // Handle Initial Center Update (rarely needed but good for re-centering)
  useEffect(() => {
      if (mapRef.current && initialCenter) {
          const converted = wgs84ToGcj02(initialCenter.lat, initialCenter.lng);
          mapRef.current.setView([converted.lat, converted.lng], 13);
      }
  }, [initialCenter?.lat, initialCenter?.lng]);


  // --- Render Markers & Logic ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear existing layers
    markersRef.current.forEach(m => m.remove());
    linesRef.current.forEach(l => l.remove());
    markersRef.current = [];
    linesRef.current = [];

    // Helper to add marker with WGS84 to GCJ-02 conversion
    const addMarker = (lat: number, lng: number, icon: L.Icon | L.DivIcon) => {
        const converted = wgs84ToGcj02(lat, lng);
        const m = L.marker([converted.lat, converted.lng], { icon }).addTo(map);
        markersRef.current.push(m);
        return m;
    };

    // 1. Render Actual Location (Target) - Only if provided (Review Mode)
    if (actualLocation) {
        const flagIcon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="relative">
                     <div class="absolute -bottom-1 left-1 w-4 h-1 bg-black/30 rounded-full blur-[2px]"></div>
                     <div class="text-3xl filter drop-shadow-md">🚩</div>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [6, 30]
        });
        addMarker(actualLocation.lat, actualLocation.lng, flagIcon);
    }

    // 2. Render User Selection (Play Mode - Temporary Pin)
    if (selectedLocation && interactive) {
        const tempIcon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg animate-bounce"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const m = addMarker(selectedLocation.lat, selectedLocation.lng, tempIcon);

        // Only pan in search mode (Creation), not play mode
        if (enableSearch) {
            const convertedForPan = wgs84ToGcj02(selectedLocation.lat, selectedLocation.lng);
            map.panTo([convertedForPan.lat, convertedForPan.lng]);
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

            addMarker(g.location.lat, g.location.lng, icon);

            // Draw line with coordinate conversion
            const guessConverted = wgs84ToGcj02(g.location.lat, g.location.lng);
            const actualConverted = wgs84ToGcj02(actualLocation.lat, actualLocation.lng);
            const line = L.polyline([
                [guessConverted.lat, guessConverted.lng],
                [actualConverted.lat, actualConverted.lng]
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

  }, [selectedLocation, actualLocation, guesses, currentUserId, interactive]);

  // --- Handlers ---

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      setIsSearching(true);
      const results = await searchAddress(searchQuery);
      setIsSearching(false);
      if (results.length > 0) {
          const loc = { lat: results[0].lat, lng: results[0].lng };
          const displayName = results[0].displayName;

          // Update map view with coordinate conversion
          const converted = wgs84ToGcj02(loc.lat, loc.lng);
          mapRef.current?.setView([converted.lat, converted.lng], 15);
          onLocationSelect?.(loc, displayName);

          // Clear search query for better UX
          setSearchQuery('');
      } else {
          alert('未找到地址，请尝试其他关键词');
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
                <form onSubmit={handleSearch} className="flex flex-col gap-1.5">
                    <div className="flex gap-2 shadow-lg">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索地点或地址..."
                            className="flex-1 bg-white text-black px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                            type="submit"
                            disabled={isSearching}
                            className="bg-blue-600 text-white px-4 py-2 rounded-full font-bold text-sm hover:bg-blue-700 disabled:bg-gray-400 transition"
                        >
                            {isSearching ? '...' : '搜索'}
                        </button>
                    </div>
                    <p className="text-[10px] text-white/70 px-2 bg-black/30 backdrop-blur rounded-full py-0.5 self-start">
                        💡 可以直接点击地图选点
                    </p>
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
