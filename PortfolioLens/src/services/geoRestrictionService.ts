/**
 * Geo Restriction Service for PortfolioLens
 * 
 * This service handles all operations related to geographic and IP-based
 * access restrictions, including creating, updating, and validating restrictions.
 */

import { supabaseClient } from "../utility";
import {
  GeoRestriction,
  GeoRestrictionDB,
  RoleGeoRestriction,
  RoleGeoRestrictionDB,
  UserLoginLocation,
  UserLoginLocationDB,
  CreateGeoRestrictionRequest,
  UpdateGeoRestrictionRequest,
  LocationData,
  LocationValidationResponse,
  RestrictionMode,
  RestrictionType
} from "../types/geoRestrictions";

// Convert DB format to frontend format
const mapGeoRestriction = (restriction: GeoRestrictionDB): GeoRestriction => ({
  id: restriction.id,
  name: restriction.name,
  description: restriction.description,
  type: restriction.type as RestrictionType,
  mode: restriction.mode as RestrictionMode,
  value: restriction.value,
  isActive: restriction.is_active,
  createdAt: new Date(restriction.created_at),
  createdBy: restriction.created_by,
  updatedAt: new Date(restriction.updated_at),
  updatedBy: restriction.updated_by,
});

// Convert DB format to frontend format
const mapRoleGeoRestriction = (roleRestriction: RoleGeoRestrictionDB): RoleGeoRestriction => ({
  id: roleRestriction.id,
  roleId: roleRestriction.role_id,
  restrictionId: roleRestriction.restriction_id,
  createdAt: new Date(roleRestriction.created_at),
  createdBy: roleRestriction.created_by,
  updatedAt: new Date(roleRestriction.updated_at),
  updatedBy: roleRestriction.updated_by,
});

// Convert DB format to frontend format
const mapUserLoginLocation = (location: UserLoginLocationDB): UserLoginLocation => ({
  id: location.id,
  userId: location.user_id,
  ipAddress: location.ip_address,
  country: location.country,
  region: location.region,
  city: location.city,
  latitude: location.latitude,
  longitude: location.longitude,
  loginTime: new Date(location.login_time),
  isAllowed: location.is_allowed,
  restrictionMatched: location.restriction_matched,
});

/**
 * Get all geo restrictions
 * 
 * @returns List of all geo restrictions
 */
export const getAllGeoRestrictions = async (): Promise<GeoRestriction[]> => {
  const { data, error } = await supabaseClient
    .from('geo_restrictions')
    .select('*')
    .order('name');
  
  if (error) {
    console.error("Error getting geo restrictions:", error);
    throw new Error(`Failed to get geo restrictions: ${error.message}`);
  }
  
  return (data as GeoRestrictionDB[]).map(mapGeoRestriction);
};

/**
 * Get a specific geo restriction by ID
 * 
 * @param id Restriction ID
 * @returns The geo restriction
 */
export const getGeoRestrictionById = async (id: string): Promise<GeoRestriction> => {
  const { data, error } = await supabaseClient
    .from('geo_restrictions')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error("Error getting geo restriction:", error);
    throw new Error(`Failed to get geo restriction: ${error.message}`);
  }
  
  return mapGeoRestriction(data as GeoRestrictionDB);
};

/**
 * Create a new geo restriction
 * 
 * @param restriction Restriction data to create
 * @returns The created geo restriction
 */
export const createGeoRestriction = async (
  restriction: CreateGeoRestrictionRequest
): Promise<GeoRestriction> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    throw new Error("You must be logged in to create geo restrictions");
  }
  
  const { data, error } = await supabaseClient
    .from('geo_restrictions')
    .insert({
      name: restriction.name,
      description: restriction.description,
      type: restriction.type,
      mode: restriction.mode,
      value: restriction.value,
      is_active: restriction.isActive !== undefined ? restriction.isActive : true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();
  
  if (error) {
    console.error("Error creating geo restriction:", error);
    throw new Error(`Failed to create geo restriction: ${error.message}`);
  }
  
  const createdRestriction = mapGeoRestriction(data as GeoRestrictionDB);
  
  // Associate with roles if provided
  if (restriction.roleIds && restriction.roleIds.length > 0) {
    const roleAssociations = restriction.roleIds.map(roleId => ({
      role_id: roleId,
      restriction_id: createdRestriction.id,
      created_by: user.id,
      updated_by: user.id,
    }));
    
    const { error: associationError } = await supabaseClient
      .from('role_geo_restrictions')
      .insert(roleAssociations);
    
    if (associationError) {
      console.error("Error associating restriction with roles:", associationError);
      // We don't throw here because the restriction was created successfully
    }
  }
  
  return createdRestriction;
};

/**
 * Update an existing geo restriction
 * 
 * @param restriction Restriction data to update
 * @returns The updated geo restriction
 */
export const updateGeoRestriction = async (
  restriction: UpdateGeoRestrictionRequest
): Promise<GeoRestriction> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    throw new Error("You must be logged in to update geo restrictions");
  }
  
  const updateData: any = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  
  // Only include fields that are provided
  if (restriction.name !== undefined) updateData.name = restriction.name;
  if (restriction.description !== undefined) updateData.description = restriction.description;
  if (restriction.type !== undefined) updateData.type = restriction.type;
  if (restriction.mode !== undefined) updateData.mode = restriction.mode;
  if (restriction.value !== undefined) updateData.value = restriction.value;
  if (restriction.isActive !== undefined) updateData.is_active = restriction.isActive;
  
  const { data, error } = await supabaseClient
    .from('geo_restrictions')
    .update(updateData)
    .eq('id', restriction.id)
    .select('*')
    .single();
  
  if (error) {
    console.error("Error updating geo restriction:", error);
    throw new Error(`Failed to update geo restriction: ${error.message}`);
  }
  
  return mapGeoRestriction(data as GeoRestrictionDB);
};

/**
 * Delete a geo restriction
 * 
 * @param id Restriction ID to delete
 * @returns Success boolean
 */
export const deleteGeoRestriction = async (id: string): Promise<boolean> => {
  // First, delete any role associations
  const { error: associationError } = await supabaseClient
    .from('role_geo_restrictions')
    .delete()
    .eq('restriction_id', id);
  
  if (associationError) {
    console.error("Error deleting role associations:", associationError);
    throw new Error(`Failed to delete role associations: ${associationError.message}`);
  }
  
  // Then delete the restriction
  const { error } = await supabaseClient
    .from('geo_restrictions')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error("Error deleting geo restriction:", error);
    throw new Error(`Failed to delete geo restriction: ${error.message}`);
  }
  
  return true;
};

/**
 * Associate a geo restriction with a role
 * 
 * @param restrictionId Restriction ID
 * @param roleId Role ID
 * @returns The created association
 */
export const associateRestrictionWithRole = async (
  restrictionId: string,
  roleId: string
): Promise<RoleGeoRestriction> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    throw new Error("You must be logged in to associate restrictions with roles");
  }
  
  // Check if association already exists
  const { data: existingData } = await supabaseClient
    .from('role_geo_restrictions')
    .select('*')
    .eq('role_id', roleId)
    .eq('restriction_id', restrictionId)
    .maybeSingle();
  
  if (existingData) {
    return mapRoleGeoRestriction(existingData as RoleGeoRestrictionDB);
  }
  
  // Create new association
  const { data, error } = await supabaseClient
    .from('role_geo_restrictions')
    .insert({
      role_id: roleId,
      restriction_id: restrictionId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();
  
  if (error) {
    console.error("Error associating restriction with role:", error);
    throw new Error(`Failed to associate restriction with role: ${error.message}`);
  }
  
  return mapRoleGeoRestriction(data as RoleGeoRestrictionDB);
};

/**
 * Remove an association between a geo restriction and a role
 * 
 * @param restrictionId Restriction ID
 * @param roleId Role ID
 * @returns Success boolean
 */
export const removeRestrictionFromRole = async (
  restrictionId: string,
  roleId: string
): Promise<boolean> => {
  const { error } = await supabaseClient
    .from('role_geo_restrictions')
    .delete()
    .eq('role_id', roleId)
    .eq('restriction_id', restrictionId);
  
  if (error) {
    console.error("Error removing restriction from role:", error);
    throw new Error(`Failed to remove restriction from role: ${error.message}`);
  }
  
  return true;
};

/**
 * Get all restrictions associated with a role
 * 
 * @param roleId Role ID
 * @returns List of geo restrictions associated with the role
 */
export const getRestrictionsForRole = async (roleId: string): Promise<GeoRestriction[]> => {
  const { data, error } = await supabaseClient
    .from('geo_restrictions')
    .select(`
      *,
      role_geo_restrictions!inner(role_id)
    `)
    .eq('role_geo_restrictions.role_id', roleId)
    .order('name');
  
  if (error) {
    console.error("Error getting restrictions for role:", error);
    throw new Error(`Failed to get restrictions for role: ${error.message}`);
  }
  
  return (data as GeoRestrictionDB[]).map(mapGeoRestriction);
};

/**
 * Get user login history
 * 
 * @param userId Optional user ID (defaults to current user)
 * @param limit Number of records to return (default: 20)
 * @param offset Offset for pagination (default: 0)
 * @returns List of user login locations
 */
export const getUserLoginHistory = async (
  userId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<UserLoginLocation[]> => {
  // Get current user if userId not provided
  let user_id = userId;
  
  if (!user_id) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    user_id = user?.id;
  }
  
  if (!user_id) {
    throw new Error("No user ID available");
  }
  
  const { data, error } = await supabaseClient
    .from('user_login_locations')
    .select('*')
    .eq('user_id', user_id)
    .order('login_time', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error("Error getting user login history:", error);
    throw new Error(`Failed to get user login history: ${error.message}`);
  }
  
  return (data as UserLoginLocationDB[]).map(mapUserLoginLocation);
};

/**
 * Get all login attempts for admin view
 * 
 * @param limit Number of records to return (default: 50)
 * @param offset Offset for pagination (default: 0)
 * @returns List of user login locations
 */
export const getAllLoginAttempts = async (
  limit: number = 50,
  offset: number = 0
): Promise<UserLoginLocation[]> => {
  const { data, error } = await supabaseClient
    .from('user_login_locations')
    .select('*')
    .order('login_time', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error("Error getting all login attempts:", error);
    throw new Error(`Failed to get all login attempts: ${error.message}`);
  }
  
  return (data as UserLoginLocationDB[]).map(mapUserLoginLocation);
};

/**
 * Validate a user's location
 * 
 * @param userId User ID to validate
 * @param locationData Location data for validation
 * @returns Response indicating if the location is allowed
 */
export const validateUserLocation = async (
  userId: string,
  locationData: LocationData
): Promise<LocationValidationResponse> => {
  const { data, error } = await supabaseClient.rpc(
    'validate_login_location',
    {
      p_user_id: userId,
      p_ip_address: locationData.ipAddress,
      p_country: locationData.country,
      p_region: locationData.region,
      p_city: locationData.city
    }
  );
  
  if (error) {
    console.error("Error validating user location:", error);
    throw new Error(`Failed to validate user location: ${error.message}`);
  }
  
  // Check if there's a restriction that matched
  let restrictionId: string | undefined;
  let restrictionName: string | undefined;
  
  // If not allowed, there should be a matching restriction
  if (!data) {
    const { data: loginData } = await supabaseClient
      .from('user_login_locations')
      .select('restriction_matched')
      .eq('user_id', userId)
      .eq('ip_address', locationData.ipAddress)
      .order('login_time', { ascending: false })
      .limit(1)
      .single();
      
    if (loginData?.restriction_matched) {
      restrictionId = loginData.restriction_matched;
      
      // Get restriction name
      const { data: restrictionData } = await supabaseClient
        .from('geo_restrictions')
        .select('name')
        .eq('id', restrictionId)
        .single();
        
      if (restrictionData) {
        restrictionName = restrictionData.name;
      }
    }
  }
  
  return {
    isAllowed: !!data,
    restrictionId,
    restrictionName,
    locationData
  };
};
