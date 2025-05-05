/**
 * Admin Context for PortfolioLens
 * 
 * This context provides:
 * - Impersonation state management throughout the application
 * - Admin feature flags and capabilities
 * - Access to admin-specific utilities
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ImpersonationStatus } from '../types/adminTypes';
import { getImpersonationStatus, endImpersonation } from '../services/adminService';

interface AdminContextType {
  // Impersonation
  impersonationStatus: ImpersonationStatus | null;
  isImpersonating: boolean;
  refreshImpersonationStatus: () => Promise<void>;
  endCurrentImpersonation: () => Promise<void>;
  
  // Admin state
  isAdminPage: boolean;
  setIsAdminPage: (isAdmin: boolean) => void;
}

const AdminContext = createContext<AdminContextType>({
  // Default values
  impersonationStatus: null,
  isImpersonating: false,
  refreshImpersonationStatus: async () => {},
  endCurrentImpersonation: async () => {},
  isAdminPage: false,
  setIsAdminPage: () => {},
});

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [impersonationStatus, setImpersonationStatus] = useState<ImpersonationStatus | null>(null);
  const [isAdminPage, setIsAdminPage] = useState<boolean>(false);
  
  // Check impersonation status on initial load
  useEffect(() => {
    refreshImpersonationStatus();
    
    // Set up interval to periodically check impersonation status
    const intervalId = setInterval(refreshImpersonationStatus, 60000); // Every minute
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  // Refresh impersonation status
  const refreshImpersonationStatus = async () => {
    try {
      const status = await getImpersonationStatus();
      setImpersonationStatus(status);
    } catch (err) {
      console.error('Error refreshing impersonation status:', err);
      setImpersonationStatus({ isImpersonating: false });
    }
  };
  
  // End current impersonation
  const endCurrentImpersonation = async () => {
    try {
      if (impersonationStatus?.sessionId) {
        await endImpersonation(impersonationStatus.sessionId);
        localStorage.removeItem('impersonation');
        await refreshImpersonationStatus();
      }
    } catch (err) {
      console.error('Error ending impersonation:', err);
    }
  };
  
  const value = {
    impersonationStatus,
    isImpersonating: impersonationStatus?.isImpersonating || false,
    refreshImpersonationStatus,
    endCurrentImpersonation,
    isAdminPage,
    setIsAdminPage,
  };
  
  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => useContext(AdminContext);

export default AdminContext;
