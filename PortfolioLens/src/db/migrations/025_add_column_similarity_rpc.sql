-- Migration: Add column similarity RPC function
-- Description: Creates a server-side function for calculating column to field similarity
-- This endpoint offloads heavy string similarity calculations to the database server

CREATE OR REPLACE FUNCTION compute_column_similarity(
  sheet_columns TEXT[],
  db_fields TEXT[],
  skip_exact_matches BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  similarity_matrix JSONB := '{}'::JSONB;
  best_matches JSONB := '{}'::JSONB;
  similarity FLOAT;
  col TEXT;
  field TEXT;
  normalized_col TEXT;
  normalized_field TEXT;
  db_normalized_col TEXT;
  db_normalized_field TEXT;
  found_exact_match BOOLEAN;
  stripped_col TEXT;
  stripped_field TEXT;
BEGIN
  -- Process exact matches first (fast path)
  IF NOT skip_exact_matches THEN
    FOREACH col IN ARRAY sheet_columns
    LOOP
      found_exact_match := FALSE;
      
      -- Create normalized versions
      normalized_col := lower(regexp_replace(col, '[^a-zA-Z0-9]', '', 'g'));
      db_normalized_col := lower(regexp_replace(regexp_replace(col, '[^a-zA-Z0-9_\s]', '_', 'g'), '\s+', '_', 'g'));
      
      -- Check for exact match (case-insensitive)
      FOREACH field IN ARRAY db_fields
      LOOP
        -- Try different normalization techniques
        normalized_field := lower(regexp_replace(field, '[^a-zA-Z0-9]', '', 'g'));
        db_normalized_field := lower(regexp_replace(regexp_replace(field, '[^a-zA-Z0-9_\s]', '_', 'g'), '\s+', '_', 'g'));
        
        -- Direct comparison
        IF lower(col) = lower(field) THEN
          similarity_matrix := jsonb_set(
            similarity_matrix,
            ARRAY[col, field],
            to_jsonb(100)
          );
          
          -- Add to best matches
          best_matches := jsonb_set(
            best_matches,
            ARRAY[col],
            jsonb_build_object('field', field, 'score', 100)
          );
          
          found_exact_match := TRUE;
          EXIT; -- No need to check other fields
        -- Normalized comparison (alphanumeric only)
        ELSIF normalized_col = normalized_field AND normalized_col <> '' THEN
          similarity_matrix := jsonb_set(
            similarity_matrix,
            ARRAY[col, field],
            to_jsonb(100)
          );
          
          -- Add to best matches
          best_matches := jsonb_set(
            best_matches,
            ARRAY[col],
            jsonb_build_object('field', field, 'score', 100)
          );
          
          found_exact_match := TRUE;
          EXIT; -- No need to check other fields
        -- DB-style normalized comparison
        ELSIF db_normalized_col = db_normalized_field AND db_normalized_col <> '' THEN
          similarity_matrix := jsonb_set(
            similarity_matrix,
            ARRAY[col, field],
            to_jsonb(100)
          );
          
          -- Add to best matches
          best_matches := jsonb_set(
            best_matches,
            ARRAY[col],
            jsonb_build_object('field', field, 'score', 100)
          );
          
          found_exact_match := TRUE;
          EXIT; -- No need to check other fields
        END IF;
      END LOOP;
      
      -- If we found an exact match, skip similarity calculation
      IF found_exact_match THEN
        CONTINUE;
      END IF;
    END LOOP;
  END IF;
  
  -- Calculate similarity for all non-exact matches
  FOREACH col IN ARRAY sheet_columns
  LOOP
    -- Skip if we already found an exact match
    IF best_matches ? col THEN
      CONTINUE; 
    END IF;
    
    -- Pre-process for similarity calculation
    normalized_col := lower(regexp_replace(col, '[^a-zA-Z0-9]', '', 'g'));
    
    FOREACH field IN ARRAY db_fields
    LOOP
      -- Skip if we already calculated this pair
      IF similarity_matrix ? col AND (similarity_matrix->col) ? field THEN
        CONTINUE;
      END IF;
      
      normalized_field := lower(regexp_replace(field, '[^a-zA-Z0-9]', '', 'g'));
      
      -- Handle pluralization (e.g., loan/loans)
      IF (normalized_col || 's') = normalized_field OR 
         (normalized_field || 's') = normalized_col OR
         (normalized_col LIKE '%s' AND substring(normalized_col, 1, length(normalized_col)-1) = normalized_field) OR
         (normalized_field LIKE '%s' AND substring(normalized_field, 1, length(normalized_field)-1) = normalized_col) THEN
        similarity := 95;
      -- Handle substring containment with position awareness
      ELSIF normalized_col <> '' AND normalized_field <> '' AND 
            (normalized_col LIKE '%' || normalized_field || '%' OR normalized_field LIKE '%' || normalized_col || '%') THEN
        -- Calculate containment ratio based on length
        IF length(normalized_col) < length(normalized_field) THEN
          stripped_col := normalized_col;
          stripped_field := normalized_field;
        ELSE
          stripped_col := normalized_field;
          stripped_field := normalized_col;
        END IF;
        
        -- Check position of containment (beginning/end is stronger than middle)
        IF stripped_field LIKE stripped_col || '%' OR stripped_field LIKE '%' || stripped_col THEN
          similarity := LEAST(90, 85 + (length(stripped_col)::FLOAT / length(stripped_field)::FLOAT * 10));
        ELSE
          similarity := LEAST(85, 75 + (length(stripped_col)::FLOAT / length(stripped_field)::FLOAT * 15));
        END IF;
      ELSE
        -- Default similarity using trigram similarity
        similarity := similarity(col, field) * 100;
      END IF;
      
      -- Store in similarity matrix
      similarity_matrix := jsonb_set(
        similarity_matrix,
        ARRAY[col, field],
        to_jsonb(similarity)
      );
      
      -- Update best match if this is better
      IF NOT best_matches ? col OR (best_matches->col->>'score')::FLOAT < similarity THEN
        best_matches := jsonb_set(
          best_matches,
          ARRAY[col],
          jsonb_build_object('field', field, 'score', similarity)
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- Return both the matrix and best matches
  RETURN jsonb_build_object(
    'similarityMatrix', similarity_matrix,
    'bestMatches', best_matches
  );
END;
$$;

-- Grant permission to authenticated users
GRANT EXECUTE ON FUNCTION compute_column_similarity(TEXT[], TEXT[], BOOLEAN) TO authenticated;

-- Comment function
COMMENT ON FUNCTION compute_column_similarity IS 'Compute similarity between sheet columns and database fields with various heuristics';