/**
 * Types related to the loan portfolio mapping feature
 */

export interface LoanPortfolioMapping {
  id: string;
  investor_loan_number: string;
  portfolio_id: string;
  linked_at: string;
  linked_by: string;
  updated_at: string;
  created_at: string;
}

export interface UnmappedLoan {
  loan_id: string;
  investor_loan_id: string;
  investor_id: string;
  investor_name: string;
}

export interface InconsistentLoanMapping {
  investor_loan_number: string;
  portfolio_id: string;
  portfolio_name: string | null;
  loan_id: string | null;
  investor_id: string | null;
  investor_name: string | null;
}

export interface LoanMappingResult {
  successful: number;
  failed: number;
  invalid: number;
  duplicates: number;
  details: {
    success: string[];
    failure: string[];
    invalid: string[];
    duplicate: string[];
  }
}

export interface LoanMappingImportOptions {
  clearExisting?: boolean;
  skipDuplicates?: boolean;
  allowReassignment?: boolean;
}