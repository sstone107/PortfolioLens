# PortfolioLens Database Schema Documentation

## Overview

The PortfolioLens database schema is designed to store and manage mortgage loan portfolio data with a focus on:

- Loan information and details
- Borrower records
- Property information
- Payment history
- Delinquency tracking
- Special servicing (Bankruptcy, Foreclosure)
- Billing and accounting

The schema uses UUID primary keys throughout and implements proper indexing for performance optimization.

## Core Entities

### Users and Roles

**users** - System users
- `id` (UUID, PK): Unique identifier
- `email` (VARCHAR): User email, unique
- `encrypted_password` (VARCHAR): Encrypted user password
- `full_name` (VARCHAR): User's full name
- `avatar_url` (TEXT): URL to user's avatar image
- `phone_number` (VARCHAR): User's contact number
- `role_id` (UUID, FK): Reference to roles table
- `last_sign_in_at` (TIMESTAMP): Last login timestamp
- `is_active` (BOOLEAN): Whether user account is active
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**roles** - User permission roles
- `id` (UUID, PK): Unique identifier
- `name` (VARCHAR): Role name (admin, manager, analyst, viewer)
- `description` (TEXT): Description of the role
- `permissions` (JSONB): JSON object defining permissions
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

### Organizations

**servicers** - Loan servicing companies
- `id` (UUID, PK): Unique identifier
- `name` (VARCHAR): Servicer company name
- `seller_servicer_id` (VARCHAR): External servicer ID
- `mers_org_id` (VARCHAR): MERS organization ID
- `address_*` fields: Company address information
- `primary_contact_*` fields: Contact information
- `is_active` (BOOLEAN): Whether the servicer is active
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**investors** - Loan investors/owners
- `id` (UUID, PK): Unique identifier
- `name` (VARCHAR): Investor name
- `investor_id` (VARCHAR): External investor ID
- `investor_type` (VARCHAR): Type of investor (e.g., GSE, private)
- `address_*` fields: Company address information
- `primary_contact_*` fields: Contact information
- `is_active` (BOOLEAN): Whether the investor is active
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**portfolios** - Collections of loans
- `id` (UUID, PK): Unique identifier
- `name` (VARCHAR): Portfolio name
- `portfolio_id` (VARCHAR): External portfolio identifier
- `investor_id` (UUID, FK): Reference to investors table
- `portfolio_type` (VARCHAR): Type of portfolio
- `acquisition_date` (DATE): When portfolio was acquired
- `total_loans` (INTEGER): Number of loans in portfolio
- `total_upb` (DECIMAL): Total unpaid principal balance
- `description` (TEXT): Portfolio description
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

## Loan Data

**loans** - Core loan information
- `id` (UUID, PK): Unique identifier
- `valon_loan_id` (VARCHAR): Loan ID in Valon system
- `investor_loan_id` (VARCHAR): Investor's loan identifier
- `servicer_id` (UUID, FK): Reference to servicers table
- `investor_id` (UUID, FK): Reference to investors table
- `portfolio_id` (UUID, FK): Reference to portfolios table
- `mers_*` fields: MERS registry information
- `origination_date` (DATE): When loan was originated
- `effective_transfer_date` (DATE): Transfer to current servicer
- `original_loan_amount` (DECIMAL): Initial loan amount
- `original_interest_rate` (DECIMAL): Initial interest rate
- `current_upb` (DECIMAL): Current unpaid principal balance
- `current_interest_rate` (DECIMAL): Current interest rate
- `deferred_principal` (DECIMAL): Any deferred principal amount
- `last_paid_date` (DATE): Last payment received date
- `next_due_date` (DATE): Next payment due date
- `days_past_due` (INTEGER): Days delinquent
- `lien_position` (INTEGER): Priority of lien
- `loan_term` (INTEGER): Original term in months
- `maturity_date` (DATE): When loan is due to be paid off
- Additional fields for loan characteristics
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**properties** - Property information
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `address_*` fields: Property address information
- `property_type` (VARCHAR): Type of property
- `occupancy_type` (VARCHAR): How property is occupied
- `number_of_units` (INTEGER): Number of housing units
- Appraisal and valuation fields
- `legal_description` (TEXT): Property legal description
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**borrowers** - Borrower information
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `first_name`, `middle_name`, `last_name` (VARCHAR): Borrower name
- `email` (VARCHAR): Borrower email address
- `phone_number` (VARCHAR): Borrower phone number
- `ssn_last_four` (VARCHAR): Last 4 digits of SSN (for verification)
- `is_primary` (BOOLEAN): Whether this is the primary borrower
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

## Transaction Data

### Loan Default and Special Servicing

**delinquency** - Loan delinquency records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `delinquency_date` (DATE): Date of delinquency
- `days_delinquent` (INTEGER): Number of days delinquent
- `delinquency_status` (TEXT): Current status of delinquency
- `amount_delinquent` (NUMERIC): Amount past due
- `reason_code` (TEXT): Reason for delinquency
- `action_code` (TEXT): Action taken code
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**bankruptcy** - Bankruptcy case records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `borrower_id` (UUID, FK): Reference to borrowers table
- `case_number` (TEXT): Bankruptcy case number
- `filing_date` (DATE): Date bankruptcy was filed
- `bankruptcy_type` (TEXT): Type of bankruptcy
- `bankruptcy_chapter` (TEXT): Chapter of bankruptcy (7, 11, 13)
- `status` (TEXT): Current status of bankruptcy
- `discharge_date` (DATE): Date bankruptcy was discharged
- `attorney_name` (TEXT): Borrower's attorney name
- `attorney_contact` (TEXT): Attorney contact information
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**foreclosure** - Foreclosure process records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `property_id` (UUID, FK): Reference to properties table
- `referral_date` (DATE): Date referred to foreclosure
- `sale_date` (DATE): Scheduled/actual foreclosure sale date
- `status` (TEXT): Current status of foreclosure
- `attorney_name` (TEXT): Foreclosure attorney name
- `attorney_contact` (TEXT): Attorney contact information
- `foreclosure_type` (TEXT): Type of foreclosure process
- `estimated_value` (NUMERIC): Estimated property value
- `sale_amount` (NUMERIC): Actual sale amount if sold
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**loss_mitigation** - Loss mitigation activities
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `mitigation_type` (TEXT): Type of loss mitigation
- `start_date` (DATE): Start date of mitigation plan
- `end_date` (DATE): End date of mitigation plan
- `status` (TEXT): Current status
- `result` (TEXT): Result of mitigation effort
- `forbearance_amount` (NUMERIC): Amount in forbearance
- `modification_terms` (TEXT): Terms of modification
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

### Loan-Related Financial Records

**expenses** - Loan-related expense records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `expense_date` (DATE): Date of expense
- `expense_type` (TEXT): Type of expense
- `expense_category` (TEXT): Category classification
- `amount` (NUMERIC): Expense amount
- `description` (TEXT): Description of expense
- `invoice_number` (TEXT): Associated invoice number
- `vendor` (TEXT): Vendor or service provider
- `payment_status` (TEXT): Payment status
- `payment_date` (DATE): Date payment was made
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**trailing_payments** - Trailing payment records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `payment_date` (DATE): Date of payment
- `payment_amount` (NUMERIC): Payment amount
- `payment_type` (TEXT): Type of payment
- `payment_method` (TEXT): Method of payment
- `payment_status` (TEXT): Status of payment
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**insurance** - Property and loan insurance policies
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `property_id` (UUID, FK): Reference to properties table
- `policy_number` (TEXT): Insurance policy number
- `carrier` (TEXT): Insurance carrier company
- `coverage_type` (TEXT): Type of insurance coverage
- `coverage_amount` (NUMERIC): Amount of coverage
- `premium_amount` (NUMERIC): Premium amount
- `effective_date` (DATE): Policy effective date
- `expiration_date` (DATE): Policy expiration date
- `is_active` (BOOLEAN): Whether policy is active
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**covid_19** - COVID-19 relief and forbearance records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `relief_type` (TEXT): Type of COVID relief
- `start_date` (DATE): Start date of relief
- `end_date` (DATE): End date of relief
- `status` (TEXT): Current status
- `forbearance_amount` (NUMERIC): Amount in forbearance
- `hardship_reason` (TEXT): Reason for hardship
- `notes` (TEXT): Additional notes
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

### Loan Information

**loan_information** - Detailed loan information
- `id` (UUID, PK): Unique identifier
- `loan_id` (TEXT): External loan identifier
- `loan_number` (TEXT): Loan number
- `origination_date` (DATE): Loan origination date
- `maturity_date` (DATE): Loan maturity date
- `original_balance` (NUMERIC): Original loan amount
- `current_balance` (NUMERIC): Current loan balance
- `interest_rate` (NUMERIC): Interest rate
- `loan_status` (TEXT): Current loan status
- `loan_type` (TEXT): Type of loan
- `property_id` (UUID, FK): Reference to properties table
- `borrower_id` (UUID, FK): Reference to borrowers table
- `servicer_id` (UUID, FK): Reference to servicers table
- `investor_id` (UUID, FK): Reference to investors table
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**payments** - Payment records
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `transaction_date` (DATE): Date payment was received
- `effective_date` (DATE): Date payment was applied
- `amount` (DECIMAL): Total payment amount
- `principal_amount` (DECIMAL): Amount applied to principal
- `interest_amount` (DECIMAL): Amount applied to interest
- `escrow_amount` (DECIMAL): Amount applied to escrow
- `late_charges_amount` (DECIMAL): Late fees applied
- `other_fees_amount` (DECIMAL): Other fees applied
- `payment_type` (VARCHAR): Type of payment
- `payment_source` (VARCHAR): Source of payment
- `transaction_id` (VARCHAR): External transaction ID
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**loan_servicing_expenses** - Expenses associated with loan servicing
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `expense_date` (DATE): Date expense incurred
- `expense_type` (VARCHAR): Type of expense
- `amount` (DECIMAL): Expense amount
- `description` (TEXT): Description of expense
- `recoverable` (BOOLEAN): Whether expense is recoverable
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

## Tracking Records

**delinquency_records** - Delinquency tracking
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `report_date` (DATE): Date of the delinquency record
- `days_delinquent` (INTEGER): Days loan is past due
- `amount_due` (DECIMAL): Amount past due
- `next_payment_due_date` (DATE): Next payment date
- `status` (VARCHAR): Current delinquency status
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**insurance_records** - Insurance policy information
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `insurance_type` (VARCHAR): Type of insurance
- `carrier_name` (VARCHAR): Insurance company name
- `policy_number` (VARCHAR): Policy identifier
- `coverage_amount` (DECIMAL): Amount of coverage
- `premium_amount` (DECIMAL): Premium amount
- `effective_date` (DATE): Policy start date
- `expiration_date` (DATE): Policy end date
- `is_force_placed` (BOOLEAN): Whether insurance was force-placed
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**bankruptcy_records** - Bankruptcy tracking
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `filing_date` (DATE): Date bankruptcy was filed
- `bankruptcy_case_number` (VARCHAR): Case identifier
- `bankruptcy_chapter` (VARCHAR): Chapter of bankruptcy
- `bankruptcy_status` (VARCHAR): Current status
- `date_dismissed` (DATE): Date bankruptcy was dismissed
- `date_discharged` (DATE): Date bankruptcy was discharged
- `post_petition_due_date` (DATE): First post-petition due date
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**foreclosure_records** - Foreclosure tracking
- `id` (UUID, PK): Unique identifier
- `loan_id` (UUID, FK): Reference to loans table
- `first_legal_date` (DATE): Date of first legal action
- `foreclosure_start_date` (DATE): Foreclosure process start
- `scheduled_sale_date` (DATE): Scheduled auction date
- `actual_sale_date` (DATE): Actual foreclosure sale date
- `foreclosure_status` (VARCHAR): Current status
- `estimated_reo_date` (DATE): Estimated REO date
- `actual_reo_date` (DATE): Actual REO date
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

## Billing and Accounting

**billing_records** - Billing header records
- `id` (UUID, PK): Unique identifier
- `report_date` (DATE): Date of billing report
- `servicer_id` (UUID, FK): Reference to servicers table
- `investor_id` (UUID, FK): Reference to investors table
- `loan_count` (INTEGER): Number of loans in billing
- `total_upb` (DECIMAL): Total UPB in billing
- `service_fee_rate` (DECIMAL): Service fee rate
- `service_fee_amount` (DECIMAL): Service fee amount
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

**billing_line_items** - Detailed billing line items
- `id` (UUID, PK): Unique identifier
- `billing_record_id` (UUID, FK): Reference to billing_records
- `loan_id` (UUID, FK): Reference to loans table
- `line_item_type` (VARCHAR): Type of billing item
- `amount` (DECIMAL): Amount of the line item
- `description` (TEXT): Description of line item
- `created_at` / `updated_at` (TIMESTAMP): Record timestamps

## Audit and Logging

**audit_logs** - System audit trail
- `id` (UUID, PK): Unique identifier
- `user_id` (UUID, FK): Reference to users table
- `action` (VARCHAR): Action performed
- `table_name` (VARCHAR): Table that was modified
- `record_id` (UUID): Primary key of affected record
- `old_values` (JSONB): Previous values (for updates)
- `new_values` (JSONB): New values
- `ip_address` (VARCHAR): IP address of user
- `user_agent` (TEXT): User agent information
- `created_at` (TIMESTAMP): When the action occurred

## Security Implementation

The database uses Row-Level Security (RLS) policies to restrict access to data based on user roles. Each table with sensitive information has RLS enabled and appropriate policies defined.

## Indexing Strategy

Indexes are defined on:
- All primary keys
- All foreign key columns
- Common search fields (status, dates, names)
- Lookup columns used in reports and dashboards

This ensures efficient query performance for both OLTP and reporting workloads.

## Triggers and Functions

A trigger on each table automatically updates the `updated_at` timestamp whenever a record is modified, ensuring accurate tracking of when data changes occur.
