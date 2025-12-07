
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LatLng } from '../types';
import { searchAddress, getAddressFromCoords } from '../services/geocodingService';

interface GameMapProps {
  initialCenter?: LatLng | null; // Allow null for safety
  onLocationSelect?: (latlng: LatLng, name?: string) => void;
  selectedLocation?: LatLng | null;
  actualLocation?: LatLng | null;
  interactive?: boolean;
  isOpen?: boolean;
  enableSearch?: boolean; // New prop to enable search bar
}

const GameMap: React.FC<GameMapProps> = ({ 
  initialCenter, 
  onLocationSelect, 
  selectedLocation,
  actualLocation,
  interactive = true,
  isOpen = false,
  enableSearch = false
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const actualMarkerRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Default to a zoomed out view (e.g., Center of China) if no initialCenter provided
  // to avoid spoiling the location in Play mode.
  const defaultCenter = { lat: 35.8617, lng: 104.1954 }; 
  const safeCenter = initialCenter || defaultCenter;
  const initialZoom = initialCenter ? 13 : 3;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      zoomControl: false, // Disable default zoom control to use custom ones
      attributionControl: false,
      preferCanvas: true,
      zoomSnap: 0.5 // Smoother zooming
    }).setView([safeCenter.lat, safeCenter.lng], initialZoom);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapRef.current);

    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    L.Marker.prototype.options.icon = defaultIcon;

    mapRef.current.on('click', async (e) => {
      if (!interactive || !onLocationSelect) return;
      
      // Optimistic update
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
      
      // Async fetch name if creating
      if (enableSearch) {
          const name = await getAddressFromCoords(e.latlng.lat, e.latlng.lng);
          onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng }, name);
      }
    });

  }, []);

  // Resize handler
  useEffect(() => {
    if (isOpen && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 300);
      mapRef.current.invalidateSize();
    }
  }, [isOpen]);

  // View update on center change - ONLY if specifically passed (e.g. from search or result)
  useEffect(() => {
    if (mapRef.current && initialCenter) {
      // Only fly to specific initial center if it's different significantly or we are not in initial load
      // For play mode, we generally don't want to auto-pan unless it's a result
      mapRef.current.setView([initialCenter.lat, initialCenter.lng], 13);
    }
  }, [initialCenter?.lat, initialCenter?.lng]);

  // Marker update
  useEffect(() => {
    if (!mapRef.current) return;

    if (selectedLocation) {
      if (markerRef.current) {
        markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lng]);
      } else {
        markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lng]).addTo(mapRef.current);
      }
      // Do NOT auto pan to selection in Play mode to allow free exploration, 
      // unless it's the very first selection or user interaction logic changes.
      // But for Create mode, we usually want to see where we clicked.
      if (interactive && isOpen && enableSearch) {
          mapRef.current.panTo([selectedLocation.lat, selectedLocation.lng]);
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }
  }, [selectedLocation, interactive, isOpen, enableSearch]);

  // Result mode logic
  useEffect(() => {
    if (!mapRef.current || !actualLocation) return;

    const greenIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    if (!actualMarkerRef.current) {
      actualMarkerRef.current = L.marker(
        [actualLocation.lat, actualLocation.lng], 
        { icon: greenIcon }
      ).addTo(mapRef.current);
    }

    if (selectedLocation) {
      if (lineRef.current) lineRef.current.remove();
      lineRef.current = L.polyline([
        [selectedLocation.lat, selectedLocation.lng],
        [actualLocation.lat, actualLocation.lng]
      ], { color: '#f97316', weight: 3, dashArray: '5, 10' }).addTo(mapRef.current);
      
      mapRef.current.fitBounds(lineRef.current.getBounds(), { padding: [50, 50] });
    } else {
        mapRef.current.setView([actualLocation.lat, actualLocation.lng], 5);
    }
  }, [actualLocation, selectedLocation]);

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      
      setIsSearching(true);
      const results = await searchAddress(searchQuery);
      setIsSearching(false);

      if (results.length > 0) {
          const first = results[0];
          const loc = { lat: first.lat, lng: first.lng };
          
          if (mapRef.current) {
              mapRef.current.setView([loc.lat, loc.lng], 15);
          }
          if (onLocationSelect) {
              onLocationSelect(loc, first.displayName);
          }
      } else {
          alert('未找到地址，请尝试更详细的描述');
      }
  };

  const handleZoomIn = (e: React.MouseEvent) => {
      e.stopPropagation();
      mapRef.current?.zoomIn();
  };

  const handleZoomOut = (e: React.MouseEvent) => {
      e.stopPropagation();
      mapRef.current?.zoomOut();
  };

  return (
    <div className="relative w-full h-full group">
        {/* Search Bar (Only Create Mode) */}
        {enableSearch && isOpen && (
            <div className="absolute top-4 left-4 right-16 z-[1000]">
                <form onSubmit={handleSearch} className="flex gap-2 shadow-lg">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="输入地址..."
                        className="flex-1 bg-white text-black px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button 
                        type="submit" 
                        disabled={isSearching}
                        className="bg-blue-600 text-white px-4 py-2 rounded-full font-bold disabled:opacity-50 whitespace-nowrap text-sm"
                    >
                        {isSearching ? '...' : '搜索'}
                    </button>
                </form>
            </div>
        )}

        {/* Custom Zoom Controls */}
        <div className="absolute top-20 left-4 z-[900] flex flex-col gap-3">
             <button 
                onClick={handleZoomIn}
                className="w-10 h-10 bg-white rounded-full text-gray-800 shadow-lg flex items-center justify-center hover:bg-gray-100 active:scale-95 transition-transform"
                aria-label="Zoom In"
             >
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
             <button 
                onClick={handleZoomOut}
                className="w-10 h-10 bg-white rounded-full text-gray-800 shadow-lg flex items-center justify-center hover:bg-gray-100 active:scale-95 transition-transform"
                aria-label="Zoom Out"
             >
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
        </div>

        <div ref={mapContainerRef} className="w-full h-full bg-gray-200" />
    </div>
  );
};

export default GameMap;
