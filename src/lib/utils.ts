import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export async function getRoadDistance(lat1: number | undefined, lon1: number | undefined, lat2: number | undefined, lon2: number | undefined, adjustment: number = 1.0): Promise<number> {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined || lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    console.warn('getRoadDistance: Missing coordinates, returning default high distance');
    return 999;
  }
  
  if (lat1 === 0 && lon1 === 0) return 999; // Default for uninitialized coords
  
  try {
    // Using OSRM (Open Source Routing Machine) for exact road distance
    // This is free and doesn't require an API key for basic usage
    // We use a timeout to avoid hanging if the demo server is slow
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      // OSRM returns distance in meters, convert to km
      let distance = data.routes[0].distance / 1000;
      
      // Apply adjustment factor if provided (to match Google Maps or other services)
      if (adjustment && adjustment !== 1.0) {
        distance = distance * adjustment;
      }

      const haversine = calculateDistance(lat1, lon1, lat2, lon2);
      console.log(`[OSRM] Distance: Road=${distance.toFixed(2)}km (Adj=${adjustment}), Radius=${haversine.toFixed(2)}km`);
      return distance;
    }
    
    const haversineFallback = calculateDistance(lat1, lon1, lat2, lon2);
    console.warn(`[OSRM] Failed (${data.code}), falling back to Radius (Haversine): ${haversineFallback.toFixed(2)}km`);
    return haversineFallback;
  } catch (error) {
    const haversineFallback = calculateDistance(lat1, lon1, lat2, lon2);
    console.error(`[OSRM] Error, falling back to Radius (Haversine): ${haversineFallback.toFixed(2)}km`, error);
    return haversineFallback;
  }
}

export async function getCoordsFromAddress(address: string): Promise<{lat: number, lng: number} | null> {
  if (!address || address.length < 5) return null;
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
    );
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

export function getUnitMultiplier(unit: string): number {
  const u = unit.toLowerCase();
  if (u.includes('1kg')) return 1;
  if (u.includes('500g')) return 0.5;
  if (u.includes('250g')) return 0.25;
  if (u.includes('100g')) return 0.1;
  if (u.includes('5kg')) return 5;
  if (u.includes('10kg')) return 10;
  // If no metric unit matches, assume 1 unit is one piece/box/etc.
  return 1;
}
