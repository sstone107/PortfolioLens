import { supabaseClient } from "../utility/supabaseClient";

/**
 * Service for validating and ensuring user records exist
 * This helps prevent foreign key errors when creating records that reference users
 */
export const userValidationService = {
  /**
   * Validates that a user ID exists in the users table
   * @param userId The user ID to validate
   * @returns True if user exists, false otherwise
   */
  validateUserId: async (userId: string): Promise<boolean> => {
    try {
      if (!userId) return false;
      
      // Check if the user exists in the users table
      const { data, error } = await supabaseClient
        .rpc('is_valid_user_id', { user_id: userId });
      
      if (error) {
        console.error("Error validating user ID:", error);
        return false;
      }
      
      return data === true;
    } catch (err) {
      console.error("Exception in validateUserId:", err);
      return false;
    }
  },
  
  /**
   * Ensures a user exists in the users table by syncing from auth if necessary
   * @param userId The user ID to ensure exists
   * @returns True if user exists or was created, false on failure
   */
  ensureUserExists: async (userId: string): Promise<boolean> => {
    try {
      if (!userId) return false;
      
      // First check if user already exists
      const exists = await userValidationService.validateUserId(userId);
      if (exists) return true;
      
      // If not, try to create a placeholder user record
      // The database trigger will sync with auth.users
      const { error } = await supabaseClient
        .from('users')
        .insert([{ 
          id: userId,
          email: 'pending-sync@example.com', // This will be replaced by the trigger
          full_name: 'Pending Sync',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
      
      if (error) {
        // If error relates to duplicate key, the user already exists
        if (error.code === '23505') { // unique_violation
          return true;
        }
        
        console.error("Error ensuring user exists:", error);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error("Exception in ensureUserExists:", err);
      return false;
    }
  },
  
  /**
   * Get the currently authenticated user ID
   * @returns The current user ID or null
   */
  getCurrentUserId: async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      return user?.id || null;
    } catch (err) {
      console.error("Exception in getCurrentUserId:", err);
      return null;
    }
  },
  
  /**
   * Validate and process user ID from various sources
   * Ensures consistent handling of user IDs across the application
   * @param userId The user ID to validate
   * @returns Validated user ID or null if invalid
   */
  processUserId: async (userId?: string): Promise<string | null> => {
    try {
      // If userId is not provided, use the current user's ID
      const effectiveUserId = userId || await userValidationService.getCurrentUserId();
      
      if (!effectiveUserId) {
        console.warn("No user ID available");
        return null;
      }
      
      // Ensure the user exists in the system
      const exists = await userValidationService.ensureUserExists(effectiveUserId);
      
      return exists ? effectiveUserId : null;
    } catch (err) {
      console.error("Exception in processUserId:", err);
      return null;
    }
  }
};

export default userValidationService;