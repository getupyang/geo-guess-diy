
import { LatLng } from "../types";

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface SearchResult {
  lat: number;
  lng: number;
  displayName: string;
}

export const searchAddress = async (query: string): Promise<SearchResult[]> => {
  try {
    const response = await fetch(`${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&accept-language=zh-CN`);
    const data = await response.json();
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name
    }));
  } catch (error) {
    console.error("Geocoding error:", error);
    return [];
  }
};

export const getAddressFromCoords = async (lat: number, lng: number): Promise<string> => {
  try {
    const response = await fetch(`${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-CN`);
    const data = await response.json();
    
    // Construct a simpler name
    const addr = data.address;
    let name = data.display_name;
    
    // Try to be smart about the name if detailed address exists
    if (addr) {
       const parts = [];
       if (addr.state) parts.push(addr.state);
       if (addr.city && addr.city !== addr.state) parts.push(addr.city);
       if (addr.road) parts.push(addr.road);
       if (addr.building || addr.tourism || addr.leisure || addr.amenity) {
           parts.push(addr.building || addr.tourism || addr.leisure || addr.amenity);
       }
       if (parts.length > 0) {
           name = parts.join(' ');
       }
    }
    
    return name || "未知地点";
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return "未知地点";
  }
};
