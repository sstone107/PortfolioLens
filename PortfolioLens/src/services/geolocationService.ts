/**
 * Geolocation Service for PortfolioLens
 * 
 * This service handles fetching and caching IP and geolocation data
 * for the current user session.
 */

import { LocationData } from "../types/geoRestrictions";

// Cache location data to avoid excessive API calls
let cachedLocationData: LocationData | null = null;
let cacheTimestamp: number = 0;

// Cache validity period (24 hours in milliseconds)
const CACHE_VALIDITY_MS = 24 * 60 * 60 * 1000;

/**
 * Check if cached location data is still valid
 * @returns Boolean indicating if cache is valid
 */
const isCacheValid = (): boolean => {
  const now = Date.now();
  return (
    cachedLocationData !== null &&
    now - cacheTimestamp < CACHE_VALIDITY_MS
  );
};

/**
 * Get the current user's IP address
 * @returns Promise resolving to IP address
 */
export const getCurrentIpAddress = async (): Promise<string> => {
  if (isCacheValid() && cachedLocationData?.ipAddress) {
    return cachedLocationData.ipAddress;
  }
  
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error fetching IP address:', error);
    return '0.0.0.0'; // Fallback IP
  }
};

/**
 * Get detailed location data for the current user
 * @returns Promise resolving to location data
 */
export const getCurrentLocationData = async (): Promise<LocationData> => {
  // Return cached data if valid
  if (isCacheValid()) {
    return cachedLocationData as LocationData;
  }
  
  try {
    // First get the IP address
    const ipAddress = await getCurrentIpAddress();
    
    // Then get location data for this IP
    const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
    const data = await response.json();
    
    // If API returned an error message
    if (data.error) {
      throw new Error(data.reason || 'Failed to get location data');
    }
    
    // Format location data
    const locationData: LocationData = {
      ipAddress,
      country: data.country_name,
      region: data.region,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude
    };
    
    // Update cache
    cachedLocationData = locationData;
    cacheTimestamp = Date.now();
    
    return locationData;
  } catch (error) {
    console.error('Error fetching location data:', error);
    
    // Return minimal data with just IP address
    const ipAddress = await getCurrentIpAddress();
    return { ipAddress };
  }
};

/**
 * Clear the geolocation cache, forcing a fresh fetch on next call
 */
export const clearGeolocationCache = (): void => {
  cachedLocationData = null;
  cacheTimestamp = 0;
};
