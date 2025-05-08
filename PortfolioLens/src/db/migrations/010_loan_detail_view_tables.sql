-- Migration file for Loan Detail View tables
-- This adds tables for loan documents and status logs

-- Create loan documents table
CREATE TABLE IF NOT EXISTS "loan_documents" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "loan_id" UUID NOT NULL,
  "document_type" VARCHAR(50) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "file_path" VARCHAR(255) NOT NULL,
  "file_size" INTEGER,
  "mime_type" VARCHAR(100),
  "source" VARCHAR(50),
  "tags" VARCHAR(255)[],
  "uploaded_by" UUID NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE
  -- Note: Removed FK to auth.users as it doesn't exist in this structure
);

-- Create loan status logs table
CREATE TABLE IF NOT EXISTS "loan_status_logs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "loan_id" UUID NOT NULL,
  "previous_status" VARCHAR(50),
  "new_status" VARCHAR(50) NOT NULL,
  "changed_by" UUID NOT NULL,
  "change_reason" TEXT,
  "is_system_generated" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE
  -- Note: Removed FK to auth.users as it doesn't exist in this structure
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_loan_documents_loan_id" ON "loan_documents" ("loan_id");
CREATE INDEX IF NOT EXISTS "idx_loan_documents_document_type" ON "loan_documents" ("document_type");
CREATE INDEX IF NOT EXISTS "idx_loan_status_logs_loan_id" ON "loan_status_logs" ("loan_id");
CREATE INDEX IF NOT EXISTS "idx_loan_status_logs_new_status" ON "loan_status_logs" ("new_status");

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_loan_documents_updated_at ON "loan_documents";
CREATE TRIGGER update_loan_documents_updated_at
BEFORE UPDATE ON "loan_documents"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create a trigger function to log loan status changes
CREATE OR REPLACE FUNCTION log_loan_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.loan_status IS DISTINCT FROM NEW.loan_status THEN
        INSERT INTO loan_status_logs (
            loan_id,
            previous_status,
            new_status,
            changed_by,
            is_system_generated
        ) VALUES (
            NEW.id,
            OLD.loan_status,
            NEW.loan_status,
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for loan status changes
DROP TRIGGER IF EXISTS log_loan_status_change_trigger ON "loans";
CREATE TRIGGER log_loan_status_change_trigger
AFTER UPDATE ON "loans"
FOR EACH ROW
WHEN (OLD.loan_status IS DISTINCT FROM NEW.loan_status)
EXECUTE FUNCTION log_loan_status_change();

-- Add RLS policies
ALTER TABLE "loan_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loan_status_logs" ENABLE ROW LEVEL SECURITY;

-- Policies for loan_documents
CREATE POLICY "Allow authenticated users to view loan documents"
  ON "loan_documents"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow users to insert their own documents"
  ON "loan_documents"
  FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Allow users to update their own documents"
  ON "loan_documents"
  FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid());

CREATE POLICY "Allow users to delete their own documents"
  ON "loan_documents"
  FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Policies for loan_status_logs
CREATE POLICY "Allow authenticated users to view loan status logs"
  ON "loan_status_logs"
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow users to insert loan status logs"
  ON "loan_status_logs"
  FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());