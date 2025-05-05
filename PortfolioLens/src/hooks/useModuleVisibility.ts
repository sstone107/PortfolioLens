/**
 * Module Visibility Hook for PortfolioLens
 * 
 * This hook provides functions to check if modules are visible to the current user
 * based on their roles and the module visibility settings in the database.
 */

import { useState, useEffect, useCallback } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { ModuleType } from '../types/adminTypes';
import { isModuleVisible } from '../services/adminService';
import { useUserRoles } from '../contexts/userRoleContext';
import { UserRoleType } from '../types/userRoles';

// Module visibility cache to avoid excessive database calls
interface VisibilityCache {
  [moduleType: string]: {
    visible: boolean;
    timestamp: number;
  };
}

// Validity period for cache (5 minutes)
const CACHE_VALIDITY_MS = 5 * 60 * 1000;

export const useModuleVisibility = () => {
  const [visibilityCache, setVisibilityCache] = useState<VisibilityCache>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const { data: user } = useGetIdentity<{ id: string, email: string }>();
  const { userWithRoles } = useUserRoles();
  
  /**
   * Check if a specific module is visible to the current user
   * 
   * @param moduleType The module type to check visibility for
   * @param skipCache Whether to bypass the cache and force a fresh check
   * @returns Promise resolving to boolean indicating if module is visible
   */
  const checkModuleVisibility = useCallback(async (
    moduleType: ModuleType,
    skipCache: boolean = false
  ): Promise<boolean> => {
    setError(null);
    
    try {
      // Admin role always has access to all modules
      if (userWithRoles?.roles.includes(UserRoleType.Admin)) {
        return true;
      }
      
      // Check cache first unless skipCache is true
      const now = Date.now();
      const cachedValue = visibilityCache[moduleType];
      
      if (!skipCache && cachedValue && (now - cachedValue.timestamp) < CACHE_VALIDITY_MS) {
        return cachedValue.visible;
      }
      
      // If cache miss or skipCache, check with server
      setLoading(true);
      const visible = await isModuleVisible(moduleType);
      
      // Update cache
      setVisibilityCache(prev => ({
        ...prev,
        [moduleType]: {
          visible,
          timestamp: now,
        }
      }));
      
      return visible;
    } catch (err) {
      console.error(`Error checking visibility for module ${moduleType}:`, err);
      setError(`Failed to check module visibility for ${moduleType}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [userWithRoles?.roles, visibilityCache]);
  
  /**
   * Check if multiple modules are visible to the current user
   * 
   * @param moduleTypes Array of module types to check visibility for
   * @param skipCache Whether to bypass the cache and force a fresh check
   * @returns Promise resolving to map of module types to visibility
   */
  const checkMultipleModules = useCallback(async (
    moduleTypes: ModuleType[],
    skipCache: boolean = false
  ): Promise<Record<ModuleType, boolean>> => {
    const results: Record<ModuleType, boolean> = {} as Record<ModuleType, boolean>;
    
    await Promise.all(
      moduleTypes.map(async (moduleType) => {
        results[moduleType] = await checkModuleVisibility(moduleType, skipCache);
      })
    );
    
    return results;
  }, [checkModuleVisibility]);
  
  /**
   * Clear the visibility cache, forcing fresh checks on next calls
   */
  const clearCache = useCallback(() => {
    setVisibilityCache({});
  }, []);
  
  // Clear cache when user changes
  useEffect(() => {
    clearCache();
  }, [user?.id, clearCache]);
  
  return {
    checkModuleVisibility,
    checkMultipleModules,
    clearCache,
    loading,
    error,
  };
};

export default useModuleVisibility;
