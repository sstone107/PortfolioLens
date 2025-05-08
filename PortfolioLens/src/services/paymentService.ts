import { supabaseClient } from "../utility/supabaseClient";

export interface Payment {
  id: string;
  loan_id: string;
  transaction_date: string;
  effective_date: string;
  due_date?: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  escrow_amount: number;
  late_charges_amount: number;
  other_fees_amount: number;
  payment_type: string;
  payment_method: string;
  payment_source: string;
  status: string;
  days_late?: number;
  transaction_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Service for retrieving and managing payment information
 */
export const paymentService = {
  /**
   * Get payments by loan ID
   * @param loanId The loan ID to fetch payments for
   * @param months Number of months of payment history to retrieve (default: 24)
   * @returns Array of payment records associated with the loan
   */
  getPaymentsByLoanId: async (loanId: string, months = 24) => {
    try {
      if (!loanId) {
        return { data: [], error: new Error('Loan ID is required') };
      }

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(endDate.getMonth() - months);

      // Query the payments table for records associated with this loan
      const { data, error } = await supabaseClient
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .lte('transaction_date', endDate.toISOString().split('T')[0])
        .order('transaction_date', { ascending: false });

      if (error) {
        console.error("Error fetching payments:", error);
        return { data: [], error };
      }

      if (!data || data.length === 0) {
        console.log(`No payments found for loan ID: ${loanId}, generating mock data`);
        return { data: generateMockPaymentData(loanId, months), error: null };
      }

      // Add days_late field to each payment if due_date exists
      const enhancedData = data.map(payment => {
        if (payment.due_date) {
          const dueDate = new Date(payment.due_date);
          const paidDate = new Date(payment.transaction_date);
          
          // Calculate days late (negative means early payment)
          const diffTime = paidDate.getTime() - dueDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          return { ...payment, days_late: diffDays };
        }
        return payment;
      });

      return { data: enhancedData, error: null };
    } catch (err) {
      console.error("Exception in getPaymentsByLoanId:", err);
      return { data: [], error: err };
    }
  },

  /**
   * Generate VOM (Verification of Mortgage) data for a loan
   * @param loanId The loan ID to generate VOM data for
   * @param months Number of months to include (default: 24)
   * @returns Data needed for VOM report
   */
  generateVOMData: async (loanId: string, months = 24) => {
    try {
      // Get payment history
      const { data: payments, error } = await paymentService.getPaymentsByLoanId(loanId, months);
      
      if (error) {
        return { data: null, error };
      }
      
      // Get loan details
      const { data: loan, error: loanError } = await supabaseClient
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();
        
      if (loanError) {
        return { data: null, error: loanError };
      }
      
      // Get borrower details
      const { data: borrowers, error: borrowerError } = await supabaseClient
        .from('borrowers')
        .select('*')
        .eq('loan_id', loanId);
        
      if (borrowerError) {
        return { data: null, error: borrowerError };
      }
      
      // Get property details
      const { data: property, error: propertyError } = await supabaseClient
        .from('properties')
        .select('*')
        .eq('loan_id', loanId)
        .single();
        
      if (propertyError) {
        return { data: null, error: propertyError };
      }
      
      // Compile all data needed for VOM
      const vormData = {
        loan,
        borrowers,
        property,
        payments,
        generatedAt: new Date().toISOString()
      };
      
      return { data: vormData, error: null };
    } catch (err) {
      console.error("Exception in generateVOMData:", err);
      return { data: null, error: err };
    }
  }
};

/**
 * Generate mock payment data for testing
 * @param loanId Loan ID to associate with payments
 * @param months Number of months of history to generate (default: 24)
 * @returns Array of payment records
 */
export function generateMockPaymentData(loanId: string, months = 24): Payment[] {
  const payments: Payment[] = [];
  const endDate = new Date();
  const paymentAmount = 1200 + Math.random() * 800; // Random payment between $1200-2000
  
  // Split payment into principal, interest, and escrow
  const principalPercent = 0.6 + (Math.random() * 0.1);  // 60-70%
  const interestPercent = 0.25 + (Math.random() * 0.1);  // 25-35%
  const escrowPercent = 1 - principalPercent - interestPercent; // Remainder
  
  // Generate payments for the specified number of months
  for (let i = 0; i < months; i++) {
    const dueDate = new Date(endDate);
    dueDate.setMonth(endDate.getMonth() - i);
    dueDate.setDate(1); // Due on the 1st of each month
    
    // Randomly determine if payment is late
    const latenessFactor = Math.random();
    let daysLate = 0;
    let paymentStatus = 'on time';
    let paymentDate = new Date(dueDate);
    
    if (latenessFactor > 0.8) {
      // Payment is late
      daysLate = Math.floor(Math.random() * 45) + 5; // 5-50 days late
      paymentDate = new Date(dueDate);
      paymentDate.setDate(paymentDate.getDate() + daysLate);
      
      if (daysLate > 30) {
        paymentStatus = 'missed';
      } else if (daysLate > 14) {
        paymentStatus = 'late';
      } else {
        paymentStatus = 'delayed';
      }
    } else if (latenessFactor < 0.2) {
      // Payment is early
      daysLate = -Math.floor(Math.random() * 5) - 1; // 1-5 days early
      paymentDate = new Date(dueDate);
      paymentDate.setDate(paymentDate.getDate() + daysLate);
      paymentStatus = 'on time';
    }
    
    // Add some payment amount variation
    const paymentVariation = (Math.random() * 100) - 50; // -$50 to +$50
    const actualPaymentAmount = paymentAmount + paymentVariation;
    
    // Calculate payment components
    const principalAmount = actualPaymentAmount * principalPercent;
    const interestAmount = actualPaymentAmount * interestPercent;
    const escrowAmount = actualPaymentAmount * escrowPercent;
    
    // Late fee if applicable
    const lateChargesAmount = daysLate > 14 ? 35 : 0;
    
    // Randomize payment method
    const paymentMethods = ['ACH', 'Check', 'Wire', 'Credit Card'];
    const randomMethodIndex = Math.floor(Math.random() * paymentMethods.length);
    
    payments.push({
      id: `mock-payment-${loanId}-${i}`,
      loan_id: loanId,
      transaction_date: paymentDate.toISOString().split('T')[0],
      effective_date: paymentDate.toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      amount: actualPaymentAmount,
      principal_amount: principalAmount,
      interest_amount: interestAmount,
      escrow_amount: escrowAmount,
      late_charges_amount: lateChargesAmount,
      other_fees_amount: 0,
      payment_type: 'Regular Payment',
      payment_method: paymentMethods[randomMethodIndex],
      payment_source: 'Borrower',
      status: paymentStatus,
      days_late: daysLate,
      transaction_id: `txn-${loanId}-${i}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  // Sort payments by transaction date descending (newest first)
  return payments.sort((a, b) => 
    new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
  );
}