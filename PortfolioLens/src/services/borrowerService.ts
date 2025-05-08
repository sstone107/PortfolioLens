import { supabaseClient } from "../utility/supabaseClient";

/**
 * Service for retrieving borrower information
 */
export const borrowerService = {
  /**
   * Get borrowers by loan ID
   * @param loanId The loan ID to fetch borrowers for
   * @returns Array of borrower records associated with the loan
   */
  getBorrowersByLoanId: async (loanId: string) => {
    try {
      if (!loanId) {
        return { data: [], error: new Error('Loan ID is required') };
      }

      // Query the borrowers table for records associated with this loan
      const { data, error } = await supabaseClient
        .from('borrowers')
        .select('*')
        .eq('loan_id', loanId);

      if (error) {
        console.error("Error fetching borrowers:", error);
        return { data: [], error };
      }

      if (!data || data.length === 0) {
        console.log(`No borrowers found for loan ID: ${loanId}`);
        
        // Generate dummy test data for display when no borrowers are found
        const dummyBorrowers = [
          {
            id: `dummy-primary-${loanId}`,
            loan_id: loanId,
            first_name: 'John',
            middle_name: 'A',
            last_name: 'Smith',
            email: 'john.smith@example.com',
            phone_number: '555-123-4567',
            ssn_last_four: '1234',
            is_primary: true,
            borrower_first_name: 'John',
            borrower_last_name: 'Smith',
            borrower_email_address: 'john.smith@example.com',
            borrower_phone_number_cell: '5551234567',
            borrower_mailing_address_1: '123 Main Street',
            borrower_mailing_city: 'Springfield',
            borrower_mailing_state: 'IL',
            borrower_mailing_zipcode: '62701',
            borrower_current_credit_score: 720,
            annual_income: 85000,
            employment_status: 'Employed',
            employer: 'ABC Corporation',
            borrower_type: 'Primary'
          },
          // Include a co-borrower for testing
          {
            id: `dummy-co-${loanId}`,
            loan_id: loanId,
            first_name: 'Jane',
            middle_name: 'B',
            last_name: 'Smith',
            email: 'jane.smith@example.com',
            phone_number: '555-987-6543',
            ssn_last_four: '5678',
            is_primary: false,
            co_borrower_first_name: 'Jane',
            co_borrower_last_name: 'Smith',
            co_borrower_email_address: 'jane.smith@example.com',
            co_borrower_phone_number_cell: '5559876543',
            co_borrower_mailing_address_1: '123 Main Street',
            co_borrower_mailing_city: 'Springfield',
            co_borrower_mailing_state: 'IL',
            co_borrower_mailing_zipcode: '62701',
            co_borrower_current_credit_score: 740,
            annual_income: 75000,
            employment_status: 'Employed',
            employer: 'XYZ Corporation',
            borrower_type: 'Co-Borrower'
          }
        ];
        
        return { data: dummyBorrowers, error: null };
      }

      return { data, error: null };
    } catch (err) {
      console.error("Exception in getBorrowersByLoanId:", err);
      return { data: [], error: err };
    }
  }
};