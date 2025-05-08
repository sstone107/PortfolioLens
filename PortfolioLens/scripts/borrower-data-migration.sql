-- Migration script for inserting borrower test data
-- Need to insert the data directly in Supabase

-- First, clear any existing borrower data for our test loans
DELETE FROM borrowers WHERE loan_id IN (
  'f2defe8c-19ec-4176-ae4c-4c45bbc06766',
  '610910f9-7a0a-4e11-a970-e87a49324500',
  'b91dac82-9c64-4ff6-8238-bd2eeb3ed571',
  '68f9a114-cfd9-409d-9743-d398887bc415',
  '7f086687-fac7-48f8-ae40-daf222ae8fa0',
  '34892e71-a9bb-45ad-9483-d8bb763e6bde',
  '5b00fb39-fb35-417e-a63a-e8fbe538926a',
  'a7f64c07-5e7b-4ab9-be17-ab938319a7ee',
  'fd258f16-e962-4d85-b5a4-7422d3efc6c0',
  '0c27aa06-fd94-4894-ad28-6ab097e1511a'
);

-- Insert primary borrowers for each loan with remapped columns
INSERT INTO borrowers (
  loan_id, first_name, middle_name, last_name, email, phone_number,
  ssn_last_four, is_primary, borrower_first_name, borrower_middle_name, 
  borrower_last_name, borrower_email_address, borrower_phone_number_cell,
  borrower_mailing_address_1, borrower_mailing_city, borrower_mailing_state,
  borrower_mailing_zipcode, borrower_current_credit_score, annual_income
) VALUES
  ('f2defe8c-19ec-4176-ae4c-4c45bbc06766', 'John', 'A', 'Smith', 'john.smith@example.com', '555-123-1001', 
   '5001', true, 'John', 'A', 'Smith', 'john.smith@example.com', 5551231001,
   '101 Main Street', 'Springfield', 'IL', '62901', 680, 75000.00),
  
  ('610910f9-7a0a-4e11-a970-e87a49324500', 'James', 'B', 'Johnson', 'james.johnson@example.com', '555-123-1002', 
   '5002', true, 'James', 'B', 'Johnson', 'james.johnson@example.com', 5551231002,
   '102 Main Street', 'Springfield', 'IL', '62902', 685, 77500.00),
  
  ('b91dac82-9c64-4ff6-8238-bd2eeb3ed571', 'Robert', null, 'Williams', 'robert.williams@example.com', '555-123-1003', 
   '5003', true, 'Robert', null, 'Williams', 'robert.williams@example.com', 5551231003,
   '103 Main Street', 'Springfield', 'IL', '62903', 690, 80000.00),
  
  ('68f9a114-cfd9-409d-9743-d398887bc415', 'Michael', 'D', 'Brown', 'michael.brown@example.com', '555-123-1004', 
   '5004', true, 'Michael', 'D', 'Brown', 'michael.brown@example.com', 5551231004,
   '104 Main Street', 'Springfield', 'IL', '62904', 695, 82500.00),
  
  ('7f086687-fac7-48f8-ae40-daf222ae8fa0', 'David', 'E', 'Jones', 'david.jones@example.com', '555-123-1005', 
   '5005', true, 'David', 'E', 'Jones', 'david.jones@example.com', 5551231005,
   '105 Main Street', 'Springfield', 'IL', '62905', 700, 85000.00),
  
  ('34892e71-a9bb-45ad-9483-d8bb763e6bde', 'William', 'F', 'Miller', 'william.miller@example.com', '555-123-1006', 
   '5006', true, 'William', 'F', 'Miller', 'william.miller@example.com', 5551231006,
   '106 Main Street', 'Springfield', 'IL', '62906', 705, 87500.00),
  
  ('5b00fb39-fb35-417e-a63a-e8fbe538926a', 'Richard', null, 'Davis', 'richard.davis@example.com', '555-123-1007', 
   '5007', true, 'Richard', null, 'Davis', 'richard.davis@example.com', 5551231007,
   '107 Main Street', 'Springfield', 'IL', '62907', 710, 90000.00),
  
  ('a7f64c07-5e7b-4ab9-be17-ab938319a7ee', 'Joseph', 'H', 'Garcia', 'joseph.garcia@example.com', '555-123-1008', 
   '5008', true, 'Joseph', 'H', 'Garcia', 'joseph.garcia@example.com', 5551231008,
   '108 Main Street', 'Springfield', 'IL', '62908', 715, 92500.00),
  
  ('fd258f16-e962-4d85-b5a4-7422d3efc6c0', 'Thomas', 'I', 'Rodriguez', 'thomas.rodriguez@example.com', '555-123-1009', 
   '5009', true, 'Thomas', 'I', 'Rodriguez', 'thomas.rodriguez@example.com', 5551231009,
   '109 Main Street', 'Springfield', 'IL', '62909', 720, 95000.00),
  
  ('0c27aa06-fd94-4894-ad28-6ab097e1511a', 'Charles', 'J', 'Wilson', 'charles.wilson@example.com', '555-123-1010', 
   '5010', true, 'Charles', 'J', 'Wilson', 'charles.wilson@example.com', 5551231010,
   '110 Main Street', 'Springfield', 'IL', '62910', 725, 97500.00);

-- Add co-borrowers for even-numbered loans
INSERT INTO borrowers (
  loan_id, first_name, middle_name, last_name, email, phone_number,
  ssn_last_four, is_primary, co_borrower_first_name, co_borrower_middle_name, 
  co_borrower_last_name, co_borrower_email_address, co_borrower_phone_number_cell,
  co_borrower_mailing_address_1, co_borrower_mailing_city, co_borrower_mailing_state,
  co_borrower_mailing_zipcode, co_borrower_current_credit_score, annual_income
) VALUES
  ('f2defe8c-19ec-4176-ae4c-4c45bbc06766', 'Jane', 'L', 'Smith', 'jane.smith@example.com', '555-456-2001', 
   '6001', false, 'Jane', 'L', 'Smith', 'jane.smith@example.com', 5554562001,
   '101 Main Street', 'Springfield', 'IL', '62901', 700, 65000.00),
  
  ('b91dac82-9c64-4ff6-8238-bd2eeb3ed571', 'Mary', 'N', 'Williams', 'mary.williams@example.com', '555-456-2003', 
   '6003', false, 'Mary', 'N', 'Williams', 'mary.williams@example.com', 5554562003,
   '103 Main Street', 'Springfield', 'IL', '62903', 710, 70000.00),
  
  ('7f086687-fac7-48f8-ae40-daf222ae8fa0', 'Susan', 'P', 'Jones', 'susan.jones@example.com', '555-456-2005', 
   '6005', false, 'Susan', 'P', 'Jones', 'susan.jones@example.com', 5554562005,
   '105 Main Street', 'Springfield', 'IL', '62905', 715, 75000.00),
  
  ('5b00fb39-fb35-417e-a63a-e8fbe538926a', 'Karen', null, 'Davis', 'karen.davis@example.com', '555-456-2007', 
   '6007', false, 'Karen', null, 'Davis', 'karen.davis@example.com', 5554562007,
   '107 Main Street', 'Springfield', 'IL', '62907', 720, 80000.00),
  
  ('fd258f16-e962-4d85-b5a4-7422d3efc6c0', 'Nancy', 'S', 'Rodriguez', 'nancy.rodriguez@example.com', '555-456-2009', 
   '6009', false, 'Nancy', 'S', 'Rodriguez', 'nancy.rodriguez@example.com', 5554562009,
   '109 Main Street', 'Springfield', 'IL', '62909', 725, 85000.00);