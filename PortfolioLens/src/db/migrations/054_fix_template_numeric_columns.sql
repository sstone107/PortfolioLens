-- Fix mapping templates that have column names starting with numbers
-- This ensures templates work correctly with the automatic column renaming

-- Create a function to fix numeric column names in templates
CREATE OR REPLACE FUNCTION fix_template_numeric_columns()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    template_record RECORD;
    updated_mappings jsonb;
    mapping jsonb;
    new_mapping jsonb;
    mapped_name text;
    safe_name text;
BEGIN
    -- Loop through all templates
    FOR template_record IN 
        SELECT id, column_mappings 
        FROM public.mapping_templates 
        WHERE column_mappings IS NOT NULL
    LOOP
        updated_mappings := '[]'::jsonb;
        
        -- Process each mapping in the template
        FOR mapping IN SELECT * FROM jsonb_array_elements(template_record.column_mappings)
        LOOP
            new_mapping := mapping;
            mapped_name := mapping->>'mappedName';
            
            -- Check if mapped column name starts with a number
            IF mapped_name IS NOT NULL AND mapped_name ~ '^\d' THEN
                -- Apply the same transformation as the Edge Function
                safe_name := 'n_' || mapped_name;
                
                -- Update the mapping
                new_mapping := jsonb_set(new_mapping, '{mappedName}', to_jsonb(safe_name));
                
                RAISE NOTICE 'Template %: Renaming column % to %', 
                    template_record.id, mapped_name, safe_name;
            END IF;
            
            updated_mappings := updated_mappings || new_mapping;
        END LOOP;
        
        -- Update the template if any changes were made
        IF template_record.column_mappings != updated_mappings THEN
            UPDATE public.mapping_templates 
            SET column_mappings = updated_mappings,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = template_record.id;
            
            RAISE NOTICE 'Updated template %', template_record.id;
        END IF;
    END LOOP;
END;
$$;

-- Run the fix
SELECT fix_template_numeric_columns();

-- Also create a trigger to automatically fix numeric columns in new templates
CREATE OR REPLACE FUNCTION fix_numeric_columns_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    mapping jsonb;
    new_mapping jsonb;
    mapped_name text;
    safe_name text;
    updated_mappings jsonb := '[]'::jsonb;
    changed boolean := false;
BEGIN
    IF NEW.column_mappings IS NOT NULL THEN
        FOR mapping IN SELECT * FROM jsonb_array_elements(NEW.column_mappings)
        LOOP
            new_mapping := mapping;
            mapped_name := mapping->>'mappedName';
            
            -- Check if mapped column name starts with a number
            IF mapped_name IS NOT NULL AND mapped_name ~ '^\d' THEN
                -- Apply the same transformation as the Edge Function
                safe_name := 'n_' || mapped_name;
                new_mapping := jsonb_set(new_mapping, '{mappedName}', to_jsonb(safe_name));
                changed := true;
            END IF;
            
            updated_mappings := updated_mappings || new_mapping;
        END LOOP;
        
        IF changed THEN
            NEW.column_mappings := updated_mappings;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for new templates
DROP TRIGGER IF EXISTS fix_numeric_columns_before_insert ON public.mapping_templates;
CREATE TRIGGER fix_numeric_columns_before_insert
    BEFORE INSERT OR UPDATE ON public.mapping_templates
    FOR EACH ROW
    EXECUTE FUNCTION fix_numeric_columns_trigger();

-- Clean up the one-time fix function
DROP FUNCTION fix_template_numeric_columns();