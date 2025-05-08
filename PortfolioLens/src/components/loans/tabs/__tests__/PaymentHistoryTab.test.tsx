import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaymentHistoryTab } from '../PaymentHistoryTab';
import { paymentService } from '../../../../services/paymentService';

// Mock the payment service
jest.mock('../../../../services/paymentService', () => ({
  paymentService: {
    getPaymentsByLoanId: jest.fn(),
    generateVOMData: jest.fn(),
  },
  generateMockPaymentData: jest.fn(),
}));

// Mock PDF generator
jest.mock('../../../../utility/pdfGenerator', () => ({
  downloadVOMPdf: jest.fn(),
}));

// Mock useList hook
jest.mock('@refinedev/core', () => ({
  useList: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

describe('PaymentHistoryTab', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock payment data
    const mockPayments = [
      {
        id: 'payment-1',
        loan_id: 'loan-1',
        transaction_date: '2023-05-01',
        effective_date: '2023-05-01',
        due_date: '2023-05-01',
        amount: 1500,
        principal_amount: 1000,
        interest_amount: 400,
        escrow_amount: 100,
        payment_method: 'ACH',
        status: 'on time',
        days_late: 0,
      },
      {
        id: 'payment-2',
        loan_id: 'loan-1',
        transaction_date: '2023-04-01',
        effective_date: '2023-04-01',
        due_date: '2023-04-01',
        amount: 1500,
        principal_amount: 1000,
        interest_amount: 400,
        escrow_amount: 100,
        payment_method: 'Check',
        status: 'on time',
        days_late: 0,
      },
      {
        id: 'payment-3',
        loan_id: 'loan-1',
        transaction_date: '2023-03-15',
        effective_date: '2023-03-15',
        due_date: '2023-03-01',
        amount: 1500,
        principal_amount: 1000,
        interest_amount: 400,
        escrow_amount: 100,
        payment_method: 'ACH',
        status: 'late',
        days_late: 14,
      },
    ];
    
    // Mock payment service response
    (paymentService.getPaymentsByLoanId as jest.Mock).mockResolvedValue({
      data: mockPayments,
      error: null,
    });
    
    // Mock VOM data generation
    (paymentService.generateVOMData as jest.Mock).mockResolvedValue({
      data: {
        loan: { id: 'loan-1', loan_number: '12345' },
        borrowers: [{ id: 'borrower-1', first_name: 'John', last_name: 'Doe' }],
        property: { address_line1: '123 Main St' },
        payments: mockPayments,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    });
  });

  test('renders payment summary cards with correct data', async () => {
    render(<PaymentHistoryTab loanId="loan-1" isLoading={false} />);
    
    // Wait for payment data to load
    await waitFor(() => {
      // Check if total payments is displayed
      expect(screen.getByText('3')).toBeInTheDocument();
      
      // Check if total amount is displayed
      expect(screen.getByText('$4,500.00')).toBeInTheDocument();
      
      // Check if average payment is displayed
      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
      
      // Check if on-time rate is displayed
      expect(screen.getByText('2 On Time')).toBeInTheDocument();
      expect(screen.getByText('1 Late')).toBeInTheDocument();
    });
  });

  test('switches between timeline and table views', async () => {
    render(<PaymentHistoryTab loanId="loan-1" isLoading={false} />);
    
    // Wait for content to load
    await waitFor(() => {
      expect(screen.getByText('Payment Timeline')).toBeInTheDocument();
    });
    
    // Check if in timeline view by default
    expect(screen.getByText('Payment Timeline')).toBeInTheDocument();
    
    // Switch to table view
    fireEvent.click(screen.getByRole('tab', { name: /detailed view/i }));
    
    // Check if in table view
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /payment date/i })).toBeInTheDocument();
    
    // Switch back to timeline view
    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    
    // Check if back in timeline view
    expect(screen.getByText('Payment Timeline')).toBeInTheDocument();
  });

  test('exports VOM PDF when button is clicked', async () => {
    render(<PaymentHistoryTab loanId="loan-1" isLoading={false} />);
    
    // Wait for content to load
    await waitFor(() => {
      expect(screen.getByText('Export VOM')).toBeInTheDocument();
    });
    
    // Click export button
    fireEvent.click(screen.getByText('Export VOM'));
    
    // Check if VOM data generation was called
    await waitFor(() => {
      expect(paymentService.generateVOMData).toHaveBeenCalledWith('loan-1');
    });
  });
});