import { AuthBindings } from "@refinedev/core";

import { supabaseClient } from "./utility";
import { getCurrentLocationData } from "./services/geolocationService";
import { validateUserLocation } from "./services/geoRestrictionService";
import { LocationData } from "./types/geoRestrictions";

const authProvider: AuthBindings = {
  login: async ({ email, password, providerName }) => {
    // sign in with oauth
    try {
      if (providerName) {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider: providerName,
        });

        if (error) {
          return {
            success: false,
            error,
          };
        }

        if (data?.url) {
          return {
            success: true,
            redirectTo: "/",
          };
        }
      }

      // sign in with email and password
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }
      
      // Validate location if user was successfully authenticated
      if (data?.user) {
        try {
          // Get current location data
          const locationData: LocationData = await getCurrentLocationData();
          
          // Validate the location
          const validationResult = await validateUserLocation(data.user.id, locationData);
          
          if (!validationResult.isAllowed) {
            // User is not allowed to access from this location
            // Sign them out immediately
            await supabaseClient.auth.signOut();
            
            return {
              success: false,
              error: {
                name: "Location Restricted",
                message: `Access denied from your location (${locationData.city || locationData.country || locationData.ipAddress}). Please contact your administrator.`
              }
            };
          }
        } catch (locationError) {
          console.error("Error validating user location:", locationError);
          // We don't block login if the location check fails, just log the error
          // This is a fail-open approach - change to fail-closed if stricter security is needed
        }
      }

      if (data?.user) {
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Login failed",
        name: "Invalid email or password",
      },
    };
  },
  register: async ({ email, password }) => {
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Register failed",
        name: "Invalid email or password",
      },
    };
  },
  forgotPassword: async ({ email }) => {
    try {
      const { data, error } = await supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/update-password`,
        }
      );

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Forgot password failed",
        name: "Invalid email",
      },
    };
  },
  updatePassword: async ({ password }) => {
    try {
      const { data, error } = await supabaseClient.auth.updateUser({
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }
    return {
      success: false,
      error: {
        message: "Update password failed",
        name: "Invalid password",
      },
    };
  },
  logout: async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: true,
      redirectTo: "/",
    };
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
  check: async () => {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const { session } = data;

      if (!session) {
        return {
          authenticated: false,
          error: {
            message: "Check failed",
            name: "Session not found",
          },
          logout: true,
          redirectTo: "/login",
        };
      }
      
      // Periodically verify location access (once per hour based on session check)
      // Use a 1/60 chance to avoid doing this on every request
      if (Math.random() < 0.016) { // ~1/60 probability
        try {
          // Get current location data
          const locationData: LocationData = await getCurrentLocationData();
          
          // Validate the location
          const validationResult = await validateUserLocation(session.user.id, locationData);
          
          if (!validationResult.isAllowed) {
            // User is not allowed to access from this location anymore
            // Sign them out immediately
            await supabaseClient.auth.signOut();
            
            return {
              authenticated: false,
              error: {
                name: "Location Restricted",
                message: `Access denied from your current location. Please contact your administrator.`
              },
              logout: true,
              redirectTo: "/login",
            };
          }
        } catch (locationError) {
          console.error("Error validating user location during session check:", locationError);
          // We don't block access if the location check fails, just log the error
        }
      }
    } catch (error: any) {
      return {
        authenticated: false,
        error: error || {
          message: "Check failed",
          name: "Not authenticated",
        },
        logout: true,
        redirectTo: "/login",
      };
    }

    return {
      authenticated: true,
    };
  },
  getPermissions: async () => {
    const user = await supabaseClient.auth.getUser();

    if (user) {
      return user.data.user?.role;
    }

    return null;
  },
  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getUser();

    if (data?.user) {
      return {
        ...data.user,
        name: data.user.email,
      };
    }

    return null;
  },
};

export default authProvider;
