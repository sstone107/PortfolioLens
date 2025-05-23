-- Fix audit_logs table schema conflict
-- This migration resolves the conflict between migrations 001 and 023
-- by dropping the old table and recreating with the enhanced schema

-- Drop existing audit_logs table and related policies
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- Create audit_logs table with enhanced schema from migration 023
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "audit_logs_select_policy"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "audit_logs_insert_policy"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);

-- Grant permissions
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- Add comment
COMMENT ON TABLE public.audit_logs IS 'Enhanced audit logging table for tracking user actions on entities';