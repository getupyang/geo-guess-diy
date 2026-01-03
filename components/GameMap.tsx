
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LatLng, Guess } from '../types';
import { searchAddress, getAddressFromCoords } from '../services/geocodingService';

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
  const center = initialCenter || defaultCenter;

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
    }).setView([center.lat, center.lng], initialCenter ? 13 : 3);

    // TianDiTu (天地图) - China's official map service
    // Uses CGCS2000 coordinates (nearly identical to WGS84, no conversion needed)
    // Base layer: vector map
    L.tileLayer('http://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=', {
      maxZoom: 18,
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      attribution: '天地图'
    }).addTo(mapRef.current);

    // Label layer: Chinese labels overlay (critical for global Chinese labels)
    L.tileLayer('http://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=', {
      maxZoom: 18,
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7']
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
            const bounds = L.latLngBounds([actualLocation.lat, actualLocation.lng], [actualLocation.lat, actualLocation.lng]);
            guesses.forEach(g => {
                bounds.extend([g.location.lat, g.location.lng]);
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
          mapRef.current.setView([initialCenter.lat, initialCenter.lng], 13);
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

    // Helper to add marker (no conversion needed - TianDiTu uses CGCS2000 ≈ WGS84)
    const addMarker = (lat: number, lng: number, icon: L.Icon | L.DivIcon) => {
        const m = L.marker([lat, lng], { icon }).addTo(map);
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
            map.panTo([selectedLocation.lat, selectedLocation.lng]);
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

            // Draw line from guess to actual location
            const line = L.polyline([
                [g.location.lat, g.location.lng],
                [actualLocation.lat, actualLocation.lng]
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

          // Update map view (no conversion needed - TianDiTu uses CGCS2000 ≈ WGS84)
          mapRef.current?.setView([loc.lat, loc.lng], 15);
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
