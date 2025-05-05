// PortfolioLens/src/components/import/services/RecordMetadataService.ts
import { executeSql } from '../../../utility/supabaseMcp'; // Assuming MCP utilities are available

/**
 * Service dedicated to record-level metadata operations like tagging and global attributes.
 */
export class RecordMetadataService {

  constructor() {
    // Constructor can be expanded if dependencies are needed (e.g., Supabase client)
  }

  /**
   * Get record IDs associated with specific sub-servicer tags for a given table.
   * @param tableName - Target table name.
   * @param tagIds - Array of sub-servicer tag IDs to filter by.
   * @param limit - Maximum number of record IDs to return.
   * @returns Promise resolving to an array of record IDs.
   */
  async getRecordsByTags(
    tableName: string,
    tagIds: string[],
    limit: number = 100
  ): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) {
      console.log('[RecordMetadataService] No tag IDs provided, returning empty array.');
      return [];
    }
    if (!tableName) {
        console.error('[RecordMetadataService] Table name is required for getRecordsByTags.');
        return [];
    }

    // Basic sanitization
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const safeTagIds = tagIds.map(id => `'${id.replace(/'/g, "''")}'`); // Escape single quotes

    if (safeTableName !== tableName) {
        console.error(`[RecordMetadataService] Invalid table name detected: ${tableName}`);
        return [];
    }

    try {
      const query = `
        SELECT DISTINCT record_id::text -- Ensure record_id is text
        FROM public.record_tags -- Explicitly use public schema
        WHERE table_name = $1
        AND tag_id IN (${safeTagIds.join(', ')}) -- Use sanitized tag IDs directly in IN clause
        LIMIT $2;
      `;

      // Use executeSql with parameters if supported, otherwise basic replacement
      // Assuming executeSql might need direct substitution for IN clause
      const parameterizedQuery = query
          .replace('$1', `'${safeTableName}'`)
          .replace('$2', String(limit));

      console.log(`[RecordMetadataService] Fetching records for table ${safeTableName} with tags: ${tagIds.join(', ')}`);
      const recordsResult = await executeSql(parameterizedQuery); // Adjust if executeSql supports parameters differently

      if (recordsResult.data && recordsResult.data.length > 0) {
        const recordIds = recordsResult.data.map((record: any) => record.record_id);
        console.log(`[RecordMetadataService] Found ${recordIds.length} records matching tags.`);
        return recordIds;
      } else if (recordsResult.error) {
          console.error(`[RecordMetadataService] Error fetching records by tags for ${safeTableName}:`, recordsResult.error.message);
          return [];
      } else {
          console.log(`[RecordMetadataService] No records found matching tags for ${safeTableName}.`);
          return [];
      }
    } catch (error: any) {
      console.error(`[RecordMetadataService] Exception getting records by tags for ${safeTableName}:`, error);
      return [];
    }
  }

  /**
   * Apply a set of global attributes to all records in a table.
   * Assumes a 'global_attributes' JSONB column exists on the target table.
   * @param tableName - Target table name.
   * @param attributeSetId - ID of the global attribute set to apply (fetched from 'global_attributes' table).
   * @returns Promise resolving to an object indicating success status and a message.
   */
  async applyGlobalAttributes(
    tableName: string,
    attributeSetId: string
  ): Promise<{ success: boolean, message: string }> {
     if (!tableName || !attributeSetId) {
        console.error('[RecordMetadataService] Table name and attributeSetId are required.');
        return { success: false, message: 'Table name and attributeSetId are required.' };
     }
     const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
     const safeAttributeSetId = attributeSetId.replace(/'/g, "''");

     if (safeTableName !== tableName) {
        console.error(`[RecordMetadataService] Invalid table name detected: ${tableName}`);
        return { success: false, message: `Invalid table name: ${tableName}` };
     }

    try {
      // 1. Fetch the attribute set definition
      const fetchAttrQuery = `
        SELECT attributes -- Assuming attributes are stored in a JSON(B) column
        FROM public.global_attributes -- Explicit schema
        WHERE id = $1;
      `;
      console.log(`[RecordMetadataService] Fetching global attribute set: ${safeAttributeSetId}`);
      const attributesResult = await executeSql(fetchAttrQuery.replace('$1', `'${safeAttributeSetId}'`)); // Parameter substitution

      if (attributesResult.error || !attributesResult.data || attributesResult.data.length === 0) {
        const errorMsg = attributesResult.error?.message || `Global attribute set ID ${safeAttributeSetId} not found.`;
        console.error(`[RecordMetadataService] Failed to fetch attribute set:`, errorMsg);
        return { success: false, message: `Attribute set not found: ${errorMsg}` };
      }

      const attributesToApply = attributesResult.data[0].attributes; // This should be a JS object/JSON
      if (typeof attributesToApply !== 'object' || attributesToApply === null || Object.keys(attributesToApply).length === 0) {
        console.log('[RecordMetadataService] Attribute set is empty, nothing to apply.');
        return { success: true, message: 'Attribute set is empty, no attributes applied.' };
      }

      // 2. Build the UPDATE statement to merge attributes
      // Use jsonb_set or jsonb_insert depending on desired behavior (overwrite vs. add)
      // Using jsonb_set for overwriting existing keys, jsonb_insert might error if key exists
      // A safer approach is merging: existing_attributes || new_attributes
      const attributesJsonString = JSON.stringify(attributesToApply).replace(/'/g, "''"); // Escape single quotes for SQL string

      const updateQuery = `
        UPDATE public."${safeTableName}"
        SET global_attributes = COALESCE(global_attributes, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW() -- Assuming an updated_at column exists
        -- WHERE clause can be added if needed, e.g., WHERE some_condition;
      `;

      console.log(`[RecordMetadataService] Applying global attributes to table ${safeTableName}...`);
      const updateResult = await executeSql(updateQuery.replace('$1', `'${attributesJsonString}'`)); // Parameter substitution

      if (updateResult.error) {
        console.error(`[RecordMetadataService] Error applying global attributes to ${safeTableName}:`, updateResult.error.message);
        return { success: false, message: `Failed to apply attributes: ${updateResult.error.message}` };
      }

      // Note: executeSql might not return affected row count easily.
      console.log(`[RecordMetadataService] Successfully initiated application of global attributes to ${safeTableName}.`);
      return { success: true, message: `Successfully applied global attributes to ${safeTableName}.` };

    } catch (error: any) {
      console.error(`[RecordMetadataService] Exception applying global attributes to ${tableName}:`, error);
      return { success: false, message: `Failed to apply attributes: ${error.message || 'Unknown error'}` };
    }
  }

  /**
   * Apply sub-servicer tags to specific records in the 'record_tags' table.
   * Performs a batch insert, ignoring conflicts if a tag already exists for a record.
   * @param tableName - The name of the table the records belong to.
   * @param recordIds - Array of record IDs (as strings) to tag.
   * @param tagIds - Array of sub-servicer tag IDs (as strings) to apply.
   * @returns Promise resolving to an object indicating success status and a message.
   */
  async applySubServicerTags(
    tableName: string,
    recordIds: string[],
    tagIds: string[]
  ): Promise<{ success: boolean, message: string }> {
    if (!recordIds || recordIds.length === 0 || !tagIds || tagIds.length === 0) {
      return { success: true, message: 'No tags or records provided to apply.' };
    }
     if (!tableName) {
        console.error('[RecordMetadataService] Table name is required for applySubServicerTags.');
        return { success: false, message: 'Table name is required.' };
     }

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
     if (safeTableName !== tableName) {
        console.error(`[RecordMetadataService] Invalid table name detected: ${tableName}`);
        return { success: false, message: `Invalid table name: ${tableName}` };
     }

    try {
      const values: string[] = [];
      const now = new Date().toISOString();

      // Prepare values for batch insert, ensuring proper escaping
      for (const recordId of recordIds) {
        const safeRecordId = String(recordId).replace(/'/g, "''"); // Ensure string and escape
        for (const tagId of tagIds) {
          const safeTagId = String(tagId).replace(/'/g, "''"); // Ensure string and escape
          values.push(`('${safeRecordId}', '${safeTagId}', '${safeTableName}', '${now}')`);
        }
      }

      if (values.length === 0) {
          return { success: true, message: 'No valid tag combinations to apply.' };
      }

      // Batch insert into 'record_tags' table
      const insertQuery = `
        INSERT INTO public.record_tags (record_id, tag_id, table_name, created_at)
        VALUES ${values.join(', ')}
        ON CONFLICT (record_id, tag_id, table_name) DO NOTHING; -- Ignore if tag already exists for the record
      `;

      console.log(`[RecordMetadataService] Applying ${tagIds.length} tags to ${recordIds.length} records in ${safeTableName}...`);
      const insertResult = await executeSql(insertQuery);

      if (insertResult.error) {
        console.error('[RecordMetadataService] Error applying sub-servicer tags:', insertResult.error.message);
        return { success: false, message: `Failed to apply tags: ${insertResult.error.message}` };
      }

      // Note: executeSql might not easily return affected rows for INSERT ON CONFLICT
      console.log(`[RecordMetadataService] Successfully applied tags.`);
      return { success: true, message: `Successfully applied ${tagIds.length} tags to ${recordIds.length} records.` };

    } catch (error: any) {
      console.error('[RecordMetadataService] Exception applying sub-servicer tags:', error);
      return { success: false, message: `Failed to apply tags: ${error.message || 'Unknown error'}` };
    }
  }
}