import { supabaseClient } from "../utility/supabaseClient";
import { LoanPortfolioMapping, UnmappedLoan, InconsistentLoanMapping, LoanMappingResult, LoanMappingImportOptions } from "../types/loanPortfolioMapping";

/**
 * Service for managing loan-portfolio mappings
 */
export class LoanPortfolioMappingService {
  
  /**
   * Map loan numbers to a portfolio
   * @param loanNumbers Array of investor loan numbers to map
   * @param portfolioId Target portfolio ID
   * @param userId User performing the action
   * @param options Import options
   */
  async mapLoansToPortfolio(
    loanNumbers: string[],
    portfolioId: string,
    userId: string,
    options: LoanMappingImportOptions = {}
  ): Promise<LoanMappingResult> {
    const result: LoanMappingResult = {
      successful: 0,
      failed: 0,
      invalid: 0,
      duplicates: 0,
      details: {
        success: [],
        failure: [],
        invalid: [],
        duplicate: []
      }
    };

    // Validate loan numbers (non-empty)
    const validLoanNumbers = loanNumbers.filter(num => num && num.trim().length > 0);
    const invalidLoanNumbers = loanNumbers.filter(num => !num || num.trim().length === 0);
    
    result.invalid = invalidLoanNumbers.length;
    invalidLoanNumbers.forEach(num => result.details.invalid.push(num || "[empty]"));

    if (validLoanNumbers.length === 0) {
      return result;
    }

    // Check portfolio exists
    const { data: portfolio, error: portfolioError } = await supabaseClient
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .single();

    if (portfolioError || !portfolio) {
      validLoanNumbers.forEach(num => {
        result.failed++;
        result.details.failure.push(num);
      });
      return result;
    }

    // If requested, clear existing mappings for the specified portfolio
    if (options.clearExisting) {
      await supabaseClient
        .from("loan_portfolio_mappings")
        .delete()
        .eq("portfolio_id", portfolioId);
    }

    // Check for existing mappings
    const { data: existingMappings } = await supabaseClient
      .from("loan_portfolio_mappings")
      .select("investor_loan_number")
      .in("investor_loan_number", validLoanNumbers);

    const existingMappedLoanNumbers = existingMappings?.map(m => m.investor_loan_number) || [];
    
    // Handle duplicates based on options
    if (existingMappedLoanNumbers.length > 0 && !options.allowReassignment) {
      if (options.skipDuplicates) {
        // Skip duplicates but process the rest
        existingMappedLoanNumbers.forEach(num => {
          result.duplicates++;
          result.details.duplicate.push(num);
        });
        
        // Filter out duplicates from the list to process
        const filteredLoanNumbers = validLoanNumbers.filter(num => !existingMappedLoanNumbers.includes(num));
        
        if (filteredLoanNumbers.length === 0) {
          return result;
        }
        
        // Continue with filtered list
        return this.insertMappings(filteredLoanNumbers, portfolioId, userId, result);
      } else {
        // Fail the entire operation if duplicates exist and we're not skipping them
        existingMappedLoanNumbers.forEach(num => {
          result.duplicates++;
          result.details.duplicate.push(num);
        });
        
        validLoanNumbers
          .filter(num => !existingMappedLoanNumbers.includes(num))
          .forEach(num => {
            result.failed++;
            result.details.failure.push(num);
          });
          
        return result;
      }
    } else if (existingMappedLoanNumbers.length > 0 && options.allowReassignment) {
      // Update existing mappings first
      try {
        const { error: updateError } = await supabaseClient
          .from("loan_portfolio_mappings")
          .update({
            portfolio_id: portfolioId,
            linked_by: userId,
            linked_at: new Date().toISOString()
          })
          .in("investor_loan_number", existingMappedLoanNumbers);
          
        if (updateError) {
          throw updateError;
        }
        
        // Track success
        existingMappedLoanNumbers.forEach(num => {
          result.successful++;
          result.details.success.push(num);
        });
        
        // Process new mappings 
        const newLoanNumbers = validLoanNumbers.filter(num => !existingMappedLoanNumbers.includes(num));
        
        if (newLoanNumbers.length === 0) {
          return result;
        }
        
        return this.insertMappings(newLoanNumbers, portfolioId, userId, result);
      } catch (error) {
        // If update fails, mark all existing mappings as failed
        existingMappedLoanNumbers.forEach(num => {
          result.failed++;
          result.details.failure.push(num);
        });
        
        // Try to process the new mappings anyway
        const newLoanNumbers = validLoanNumbers.filter(num => !existingMappedLoanNumbers.includes(num));
        
        if (newLoanNumbers.length === 0) {
          return result;
        }
        
        return this.insertMappings(newLoanNumbers, portfolioId, userId, result);
      }
    }
    
    // If no duplicates or reassignment allowed, proceed with all valid loan numbers
    return this.insertMappings(validLoanNumbers, portfolioId, userId, result);
  }
  
  /**
   * Insert new mappings
   * Helper function to insert new loan-portfolio mappings
   */
  private async insertMappings(
    loanNumbers: string[],
    portfolioId: string,
    userId: string,
    result: LoanMappingResult
  ): Promise<LoanMappingResult> {
    // Break into batches of 100 for better performance
    const batchSize = 100;
    for (let i = 0; i < loanNumbers.length; i += batchSize) {
      const batch = loanNumbers.slice(i, i + batchSize);
      
      const mappings = batch.map(loanNumber => ({
        investor_loan_number: loanNumber,
        portfolio_id: portfolioId,
        linked_by: userId
      }));
      
      try {
        const { error: insertError } = await supabaseClient
          .from("loan_portfolio_mappings")
          .insert(mappings);
          
        if (insertError) {
          throw insertError;
        }
        
        // Track successful batch
        batch.forEach(num => {
          result.successful++;
          result.details.success.push(num);
        });
      } catch (error) {
        // Mark entire batch as failed
        batch.forEach(num => {
          result.failed++;
          result.details.failure.push(num);
        });
      }
    }
    
    return result;
  }
  
  /**
   * Remove mappings for specific loan numbers
   * @param loanNumbers Array of investor loan numbers to unmap
   * @returns Count of removed mappings
   */
  async removeLoansFromMappings(loanNumbers: string[]): Promise<number> {
    if (!loanNumbers || loanNumbers.length === 0) {
      return 0;
    }
    
    const { count, error } = await supabaseClient
      .from("loan_portfolio_mappings")
      .delete()
      .in("investor_loan_number", loanNumbers)
      .select("count", { count: "exact" });
      
    if (error) {
      throw error;
    }
    
    return count || 0;
  }
  
  /**
   * Get all loan-portfolio mappings
   */
  async getAllMappings(): Promise<LoanPortfolioMapping[]> {
    const { data, error } = await supabaseClient
      .from("loan_portfolio_mappings")
      .select(`
        id,
        investor_loan_number,
        portfolio_id,
        linked_at,
        linked_by,
        updated_at,
        created_at
      `);
      
    if (error) {
      throw error;
    }
    
    return data || [];
  }
  
  /**
   * Get mappings for a specific portfolio
   * @param portfolioId Portfolio ID to get mappings for
   */
  async getMappingsByPortfolio(portfolioId: string): Promise<LoanPortfolioMapping[]> {
    const { data, error } = await supabaseClient
      .from("loan_portfolio_mappings")
      .select(`
        id,
        investor_loan_number,
        portfolio_id,
        linked_at,
        linked_by,
        updated_at,
        created_at
      `)
      .eq("portfolio_id", portfolioId);
      
    if (error) {
      throw error;
    }
    
    return data || [];
  }
  
  /**
   * Get unmapped loans (loans that exist but have no mapping)
   */
  async getUnmappedLoans(): Promise<UnmappedLoan[]> {
    const { data, error } = await supabaseClient
      .from("unmapped_loans")
      .select(`
        loan_id,
        investor_loan_id,
        investor_id,
        investor_name
      `);
      
    if (error) {
      throw error;
    }
    
    return data || [];
  }
  
  /**
   * Get inconsistent mappings (mappings to non-existent loans or portfolios)
   */
  async getInconsistentMappings(): Promise<InconsistentLoanMapping[]> {
    const { data, error } = await supabaseClient
      .from("inconsistent_loan_mappings")
      .select(`
        investor_loan_number,
        portfolio_id,
        portfolio_name,
        loan_id,
        investor_id,
        investor_name
      `);
      
    if (error) {
      throw error;
    }
    
    return data || [];
  }
}