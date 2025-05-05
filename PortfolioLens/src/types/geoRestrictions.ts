/**
 * Geography and IP Restriction Types for PortfolioLens
 * 
 * This file contains TypeScript types for representing and managing
 * location-based access restrictions for the application.
 */

/**
 * Types of geographic or network restrictions
 */
export enum RestrictionType {
  IP_RANGE = 'ip_range',
  COUNTRY = 'country',
  REGION = 'region',
  CITY = 'city'
}

/**
 * Mode for each restriction (allow or deny)
 */
export enum RestrictionMode {
  ALLOW = 'allow',
  DENY = 'deny'
}

/**
 * A single geographic or IP restriction
 */
export interface GeoRestriction {
  id: string;
  name: string;
  description?: string;
  type: RestrictionType;
  mode: RestrictionMode;
  value: string; // IP range, country code, region name, or city name
  isActive: boolean;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Database format for geo restriction
 */
export interface GeoRestrictionDB {
  id: string;
  name: string;
  description?: string;
  type: string;
  mode: string;
  value: string;
  is_active: boolean;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

/**
 * Association between a restriction and a user role
 */
export interface RoleGeoRestriction {
  id: string;
  roleId: string;
  roleName?: string; // For display purposes
  restrictionId: string;
  restrictionName?: string; // For display purposes
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Database format for role geo restriction
 */
export interface RoleGeoRestrictionDB {
  id: string;
  role_id: string;
  restriction_id: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

/**
 * Record of a user login location
 */
export interface UserLoginLocation {
  id: string;
  userId: string;
  userEmail?: string; // For display purposes
  ipAddress: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  loginTime: Date;
  isAllowed: boolean;
  restrictionMatched?: string;
  restrictionName?: string; // For display purposes
}

/**
 * Database format for user login location
 */
export interface UserLoginLocationDB {
  id: string;
  user_id: string;
  ip_address: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  login_time: string;
  is_allowed: boolean;
  restriction_matched?: string;
}

/**
 * Request to create a new geo restriction
 */
export interface CreateGeoRestrictionRequest {
  name: string;
  description?: string;
  type: RestrictionType;
  mode: RestrictionMode;
  value: string;
  isActive?: boolean;
  roleIds?: string[]; // IDs of roles to associate with this restriction
}

/**
 * Request to update an existing geo restriction
 */
export interface UpdateGeoRestrictionRequest {
  id: string;
  name?: string;
  description?: string;
  type?: RestrictionType;
  mode?: RestrictionMode;
  value?: string;
  isActive?: boolean;
}

/**
 * Location data for validation
 */
export interface LocationData {
  ipAddress: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Response from a location validation request
 */
export interface LocationValidationResponse {
  isAllowed: boolean;
  restrictionId?: string;
  restrictionName?: string;
  locationData: LocationData;
}
