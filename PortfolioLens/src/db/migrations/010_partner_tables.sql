-- Migration for Partner Tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update modified column function (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create table for Document Custodians
CREATE TABLE IF NOT EXISTS "doc_custodians" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "contact_name" VARCHAR(100),
    "contact_email" VARCHAR(100),
    "contact_phone" VARCHAR(20),
    "active" BOOLEAN DEFAULT TRUE,
    "global_attributes" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create table for Sellers
CREATE TABLE IF NOT EXISTS "sellers" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "contact_name" VARCHAR(100),
    "contact_email" VARCHAR(100),
    "contact_phone" VARCHAR(20),
    "active" BOOLEAN DEFAULT TRUE,
    "global_attributes" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create table for Prior Servicers
CREATE TABLE IF NOT EXISTS "prior_servicers" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "contact_name" VARCHAR(100),
    "contact_email" VARCHAR(100),
    "contact_phone" VARCHAR(20),
    "active" BOOLEAN DEFAULT TRUE,
    "global_attributes" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_doc_custodians_name ON doc_custodians(name);
CREATE INDEX IF NOT EXISTS idx_sellers_name ON sellers(name);
CREATE INDEX IF NOT EXISTS idx_prior_servicers_name ON prior_servicers(name);

-- Apply update trigger to all new tables
DO $$
DECLARE
    tables text[] := ARRAY['doc_custodians', 'sellers', 'prior_servicers'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('
          DROP TRIGGER IF EXISTS set_updated_at ON %I;
          CREATE TRIGGER set_updated_at
          BEFORE UPDATE ON %I
          FOR EACH ROW
          EXECUTE FUNCTION update_modified_column()', 
          t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add references to loan table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'loans') THEN
    -- Add columns only if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'doc_custodian_id') THEN
      ALTER TABLE "loans" ADD COLUMN "doc_custodian_id" UUID REFERENCES "doc_custodians"(id) NULL;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'seller_id') THEN
      ALTER TABLE "loans" ADD COLUMN "seller_id" UUID REFERENCES "sellers"(id) NULL;
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'loans' AND column_name = 'prior_servicer_id') THEN
      ALTER TABLE "loans" ADD COLUMN "prior_servicer_id" UUID REFERENCES "prior_servicers"(id) NULL;
    END IF;
  END IF;
END
$$;

-- Add RLS policies to the tables
ALTER TABLE "doc_custodians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sellers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prior_servicers" ENABLE ROW LEVEL SECURITY;

-- Create default policies (allow all operations for authenticated users)
CREATE POLICY "Enable all operations for authenticated users" ON "doc_custodians"
  FOR ALL USING (auth.role() = 'authenticated');
  
CREATE POLICY "Enable all operations for authenticated users" ON "sellers"
  FOR ALL USING (auth.role() = 'authenticated');
  
CREATE POLICY "Enable all operations for authenticated users" ON "prior_servicers"
  FOR ALL USING (auth.role() = 'authenticated');