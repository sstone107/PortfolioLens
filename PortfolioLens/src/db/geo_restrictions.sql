-- IP and Geography Restrictions for PortfolioLens
-- This schema defines tables and functions for controlling access
-- based on IP addresses and geographic locations

-- Enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "cidr"; -- For IP address handling

-- Restriction types enum
CREATE TYPE restriction_type AS ENUM ('ip_range', 'country', 'region', 'city');

-- Restriction modes enum (allow vs deny)
CREATE TYPE restriction_mode AS ENUM ('allow', 'deny');

-- Table to store IP and geography restrictions
CREATE TABLE geo_restrictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  type restriction_type NOT NULL,
  mode restriction_mode NOT NULL DEFAULT 'allow',
  value TEXT NOT NULL, -- IP range, country code, region name, or city name
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Table to associate restrictions with specific user roles
CREATE TABLE role_geo_restrictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES user_roles(id),
  restriction_id UUID NOT NULL REFERENCES geo_restrictions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(role_id, restriction_id)
);

-- Table to track user login locations for auditing
CREATE TABLE user_login_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ip_address TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  login_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_allowed BOOLEAN NOT NULL,
  restriction_matched UUID REFERENCES geo_restrictions(id)
);

-- Function to check if an IP address is within a CIDR range
CREATE OR REPLACE FUNCTION is_ip_in_range(ip TEXT, cidr_range TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN ip::inet <<= cidr_range::cidr;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a user is allowed to login from a specific location
CREATE OR REPLACE FUNCTION is_location_allowed(
  p_user_id UUID,
  p_ip_address TEXT,
  p_country TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_roles UUID[];
  v_restriction_found BOOLEAN := false;
  v_restriction_id UUID;
  v_restriction_mode restriction_mode;
  v_allowed BOOLEAN := true;
BEGIN
  -- Get all roles for the user
  SELECT array_agg(role_id) INTO v_user_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id;
  
  -- If no roles found, default to allowed (can be changed to false if needed)
  IF v_user_roles IS NULL OR array_length(v_user_roles, 1) = 0 THEN
    RETURN true;
  END IF;
  
  -- Check for IP restrictions
  SELECT 
    gr.id, 
    gr.mode INTO v_restriction_id, v_restriction_mode
  FROM geo_restrictions gr
  JOIN role_geo_restrictions rgr ON gr.id = rgr.restriction_id
  WHERE 
    rgr.role_id = ANY(v_user_roles)
    AND gr.type = 'ip_range' 
    AND gr.is_active = true
    AND is_ip_in_range(p_ip_address, gr.value)
  LIMIT 1;
  
  -- If IP restriction found
  IF v_restriction_id IS NOT NULL THEN
    v_restriction_found := true;
    v_allowed := (v_restriction_mode = 'allow');
  END IF;
  
  -- If no IP restriction matched and country is provided, check country restrictions
  IF NOT v_restriction_found AND p_country IS NOT NULL THEN
    SELECT 
      gr.id, 
      gr.mode INTO v_restriction_id, v_restriction_mode
    FROM geo_restrictions gr
    JOIN role_geo_restrictions rgr ON gr.id = rgr.restriction_id
    WHERE 
      rgr.role_id = ANY(v_user_roles)
      AND gr.type = 'country' 
      AND gr.is_active = true
      AND gr.value = p_country
    LIMIT 1;
    
    -- If country restriction found
    IF v_restriction_id IS NOT NULL THEN
      v_restriction_found := true;
      v_allowed := (v_restriction_mode = 'allow');
    END IF;
  END IF;
  
  -- If no restriction matched and region is provided, check region restrictions
  IF NOT v_restriction_found AND p_region IS NOT NULL THEN
    SELECT 
      gr.id, 
      gr.mode INTO v_restriction_id, v_restriction_mode
    FROM geo_restrictions gr
    JOIN role_geo_restrictions rgr ON gr.id = rgr.restriction_id
    WHERE 
      rgr.role_id = ANY(v_user_roles)
      AND gr.type = 'region' 
      AND gr.is_active = true
      AND gr.value = p_region
    LIMIT 1;
    
    -- If region restriction found
    IF v_restriction_id IS NOT NULL THEN
      v_restriction_found := true;
      v_allowed := (v_restriction_mode = 'allow');
    END IF;
  END IF;
  
  -- If no restriction matched and city is provided, check city restrictions
  IF NOT v_restriction_found AND p_city IS NOT NULL THEN
    SELECT 
      gr.id, 
      gr.mode INTO v_restriction_id, v_restriction_mode
    FROM geo_restrictions gr
    JOIN role_geo_restrictions rgr ON gr.id = rgr.restriction_id
    WHERE 
      rgr.role_id = ANY(v_user_roles)
      AND gr.type = 'city' 
      AND gr.is_active = true
      AND gr.value = p_city
    LIMIT 1;
    
    -- If city restriction found
    IF v_restriction_id IS NOT NULL THEN
      v_restriction_found := true;
      v_allowed := (v_restriction_mode = 'allow');
    END IF;
  END IF;
  
  -- Log the login attempt
  INSERT INTO user_login_locations (
    user_id, 
    ip_address, 
    country, 
    region, 
    city, 
    is_allowed, 
    restriction_matched
  )
  VALUES (
    p_user_id,
    p_ip_address,
    p_country,
    p_region,
    p_city,
    v_allowed,
    v_restriction_id
  );
  
  -- If no restriction was matched, default to allowed
  IF NOT v_restriction_found THEN
    RETURN true;
  END IF;
  
  RETURN v_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for geo_restrictions table
ALTER TABLE geo_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage geo_restrictions"
  ON geo_restrictions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS policies for role_geo_restrictions table
ALTER TABLE role_geo_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage role_geo_restrictions"
  ON role_geo_restrictions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS policies for user_login_locations table
ALTER TABLE user_login_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own login locations"
  ON user_login_locations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all login locations"
  ON user_login_locations
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- API function to validate a login location
CREATE OR REPLACE FUNCTION validate_login_location(
  p_user_id UUID,
  p_ip_address TEXT,
  p_country TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_location_allowed(p_user_id, p_ip_address, p_country, p_region, p_city);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
