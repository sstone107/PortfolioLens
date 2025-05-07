-- Create the saved_filters table for storing user-defined search filters
-- This supports the advanced loan search and filter system

-- Create table for saved filters
CREATE TABLE IF NOT EXISTS "saved_filters" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "filter_criteria" JSONB NOT NULL DEFAULT '{}',
    "is_favorite" BOOLEAN DEFAULT FALSE,
    "last_used" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Add comment explaining the table's purpose
COMMENT ON TABLE "saved_filters" IS 'Stores user-defined loan search filters for reuse';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_is_favorite ON saved_filters(is_favorite);
CREATE INDEX IF NOT EXISTS idx_saved_filters_last_used ON saved_filters(last_used);

-- Setup RLS policies for saved_filters
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved filters
CREATE POLICY saved_filters_select_policy
    ON saved_filters
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own saved filters 
CREATE POLICY saved_filters_insert_policy
    ON saved_filters
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own saved filters
CREATE POLICY saved_filters_update_policy
    ON saved_filters
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can only delete their own saved filters
CREATE POLICY saved_filters_delete_policy
    ON saved_filters
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add triggers for updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'set_updated_at' 
        AND tgrelid = 'saved_filters'::regclass
    ) THEN
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', 'saved_filters');
    END IF;
END;
$$ LANGUAGE plpgsql;