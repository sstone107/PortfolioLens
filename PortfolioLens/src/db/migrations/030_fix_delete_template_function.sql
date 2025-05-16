-- Migration: Fix Delete Template Function
-- Description: Fixes the boolean comparison issue in delete_mapping_template RPC function

-- Drop existing delete_mapping_template function
DROP FUNCTION IF EXISTS delete_mapping_template(uuid);

-- Recreate function with corrected return logic
CREATE OR REPLACE FUNCTION delete_mapping_template(p_id uuid)
RETURNS boolean AS $$
DECLARE
  v_current_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_row_count int;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM users u 
    JOIN roles r ON u.role_id = r.id 
    WHERE u.id = v_current_user AND r.name = 'admin'
  ) INTO v_is_admin;
  
  -- Check if user is owner
  SELECT EXISTS (
    SELECT 1 FROM mapping_templates
    WHERE (id = p_id OR "templateId" = p_id)
    AND (owner_id = v_current_user OR created_by = v_current_user::text)
  ) INTO v_is_owner;
  
  -- Only owner or admin can delete
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'Not authorized to delete this template';
  END IF;
  
  -- Delete the template
  DELETE FROM mapping_templates
  WHERE id = p_id OR "templateId" = p_id;
  
  -- Get number of rows affected
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  -- Return true if at least one row was deleted, false otherwise
  RETURN v_row_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to function
GRANT EXECUTE ON FUNCTION delete_mapping_template(uuid) TO authenticated;

-- Refresh schema cache to make function available
SELECT refresh_schema_cache();