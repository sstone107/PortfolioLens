-- Migration file for Loan Collaboration Features
-- Creates tables for loan notes/comments and payment due dates
-- This is the APPLIED version that was successfully run on the database

-- Create loan notes table for collaboration
CREATE TABLE IF NOT EXISTS "loan_notes" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "loan_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "parent_note_id" UUID,
  "content" TEXT NOT NULL,
  "is_internal_only" BOOLEAN DEFAULT FALSE,
  "mention_user_ids" UUID[],
  "is_resolved" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
  FOREIGN KEY ("parent_note_id") REFERENCES "loan_notes" ("id") ON DELETE CASCADE
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_loan_notes_loan_id" ON "loan_notes" ("loan_id");
CREATE INDEX IF NOT EXISTS "idx_loan_notes_user_id" ON "loan_notes" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_loan_notes_parent_note_id" ON "loan_notes" ("parent_note_id");
CREATE INDEX IF NOT EXISTS "idx_loan_notes_created_at" ON "loan_notes" ("created_at");

-- Create a table for loan note attachments
CREATE TABLE IF NOT EXISTS "loan_note_attachments" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "note_id" UUID NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "file_path" VARCHAR(255) NOT NULL,
  "file_size" INTEGER,
  "mime_type" VARCHAR(100),
  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("note_id") REFERENCES "loan_notes" ("id") ON DELETE CASCADE
);

-- Add RLS policies for loan notes
ALTER TABLE "loan_notes" ENABLE ROW LEVEL SECURITY;

-- Basic policy: authenticated users can view all loan notes
CREATE POLICY "Authenticated users can view loan notes" ON "loan_notes"
FOR SELECT USING (auth.role() = 'authenticated');

-- Basic policy: users can create loan notes if authenticated
CREATE POLICY "Authenticated users can create loan notes" ON "loan_notes"
FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

-- Users can update their own notes
CREATE POLICY "Users can update their own notes" ON "loan_notes"
FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own notes
CREATE POLICY "Users can delete their own notes" ON "loan_notes"
FOR DELETE USING (user_id = auth.uid());

-- Add RLS policies for loan note attachments
ALTER TABLE "loan_note_attachments" ENABLE ROW LEVEL SECURITY;

-- Basic policy: authenticated users can view all note attachments
CREATE POLICY "Authenticated users can view note attachments" ON "loan_note_attachments"
FOR SELECT USING (auth.role() = 'authenticated');

-- Basic policy: authenticated users can create note attachments
CREATE POLICY "Authenticated users can create note attachments" ON "loan_note_attachments"
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND
  EXISTS (
    SELECT 1 FROM loan_notes n
    WHERE n.id = loan_note_attachments.note_id AND n.user_id = auth.uid()
  )
);

-- Users can update attachments for their own notes
CREATE POLICY "Users can update attachments for their own notes" ON "loan_note_attachments"
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM loan_notes n
    WHERE n.id = loan_note_attachments.note_id AND n.user_id = auth.uid()
  )
);

-- Users can delete attachments for their own notes
CREATE POLICY "Users can delete attachments for their own notes" ON "loan_note_attachments"
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM loan_notes n
    WHERE n.id = loan_note_attachments.note_id AND n.user_id = auth.uid()
  )
);
