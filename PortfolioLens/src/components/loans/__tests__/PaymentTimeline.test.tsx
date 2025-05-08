import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PaymentTimeline } from '../PaymentTimeline';

describe('PaymentTimeline', () => {
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
      late_charges_amount: 0,
      other_fees_amount: 0,
      payment_type: 'Regular Payment',
      payment_source: 'Borrower',
      transaction_id: 'txn-1',
      created_at: '2023-05-01T12:00:00Z',
      updated_at: '2023-05-01T12:00:00Z',
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
      late_charges_amount: 0,
      other_fees_amount: 0,
      payment_type: 'Regular Payment',
      payment_source: 'Borrower',
      transaction_id: 'txn-2',
      created_at: '2023-04-01T12:00:00Z',
      updated_at: '2023-04-01T12:00:00Z',
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
      late_charges_amount: 0,
      other_fees_amount: 0,
      payment_type: 'Regular Payment',
      payment_source: 'Borrower',
      transaction_id: 'txn-3',
      created_at: '2023-03-15T12:00:00Z',
      updated_at: '2023-03-15T12:00:00Z',
    },
    {
      id: 'payment-4',
      loan_id: 'loan-1',
      transaction_date: '2023-02-20',
      effective_date: '2023-02-20',
      due_date: '2023-02-01',
      amount: 1500,
      principal_amount: 1000,
      interest_amount: 400,
      escrow_amount: 100,
      payment_method: 'ACH',
      status: 'missed',
      days_late: 19,
      late_charges_amount: 35,
      other_fees_amount: 0,
      payment_type: 'Regular Payment',
      payment_source: 'Borrower',
      transaction_id: 'txn-4',
      created_at: '2023-02-20T12:00:00Z',
      updated_at: '2023-02-20T12:00:00Z',
    },
  ];

  const mockExportVOM = jest.fn();
  const mockViewDetails = jest.fn();

  test('renders timeline with correct payment markers', () => {
    render(
      <PaymentTimeline
        payments={mockPayments}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Check if timeline header is displayed
    expect(screen.getByText('Payment Timeline')).toBeInTheDocument();
    
    // Check if legend is displayed
    expect(screen.getByText('On Time')).toBeInTheDocument();
    expect(screen.getByText('<14 Days Late')).toBeInTheDocument();
    expect(screen.getByText('14-30 Days Late')).toBeInTheDocument();
    expect(screen.getByText('>30 Days Late')).toBeInTheDocument();
    
    // Check if payment dates are displayed
    expect(screen.getByText('05/01/23')).toBeInTheDocument();
    expect(screen.getByText('04/01/23')).toBeInTheDocument();
    expect(screen.getByText('03/01/23')).toBeInTheDocument();
    expect(screen.getByText('02/01/23')).toBeInTheDocument();
    
    // Check if payment amounts are displayed
    expect(screen.getAllByText('$1,500').length).toBeGreaterThan(0);
  });

  test('toggles between 12 and 24 month views', () => {
    render(
      <PaymentTimeline
        payments={mockPayments}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Default is 12 months
    const twelveMonthButton = screen.getByRole('button', { name: '12 Months' });
    const twentyFourMonthButton = screen.getByRole('button', { name: '24 Months' });
    
    // Check if 12 month button is selected
    expect(twelveMonthButton).toHaveAttribute('aria-pressed', 'true');
    expect(twentyFourMonthButton).toHaveAttribute('aria-pressed', 'false');
    
    // Switch to 24 months
    fireEvent.click(twentyFourMonthButton);
    
    // Check if 24 month button is now selected
    expect(twelveMonthButton).toHaveAttribute('aria-pressed', 'false');
    expect(twentyFourMonthButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows payment details in tooltip when clicked', async () => {
    render(
      <PaymentTimeline
        payments={mockPayments}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Get the timeline markers (dots)
    const markers = screen.getAllByRole('button');
    
    // Click on the first marker (latest payment)
    fireEvent.click(markers[4]); // Index adjusted for the other buttons
    
    // Check if tooltip shows
    await waitFor(() => {
      expect(screen.getByText('Due Date:')).toBeInTheDocument();
      expect(screen.getByText('Paid Date:')).toBeInTheDocument();
      expect(screen.getByText('Status:')).toBeInTheDocument();
      expect(screen.getByText('Amount:')).toBeInTheDocument();
    });
  });

  test('calls export function when VOM button is clicked', () => {
    render(
      <PaymentTimeline
        payments={mockPayments}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Find and click the Download VOM button
    const exportButton = screen.getByRole('button', { name: 'Download VOM' });
    fireEvent.click(exportButton);
    
    // Check if the export function was called
    expect(mockExportVOM).toHaveBeenCalled();
  });

  test('calls view details function when view details button is clicked', async () => {
    render(
      <PaymentTimeline
        payments={mockPayments}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Get the timeline markers (dots)
    const markers = screen.getAllByRole('button');
    
    // Click on the first marker (latest payment)
    fireEvent.click(markers[4]); // Index adjusted for the other buttons
    
    // Find and click the View Details button
    await waitFor(() => {
      const viewDetailsButton = screen.getByRole('button', { name: 'View Details' });
      fireEvent.click(viewDetailsButton);
    });
    
    // Check if the view details function was called with the correct payment ID
    expect(mockViewDetails).toHaveBeenCalledWith('payment-1');
  });

  test('renders loading indicator when isLoading is true', () => {
    render(
      <PaymentTimeline
        payments={[]}
        isLoading={true}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Check if loading indicator is displayed
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('renders empty state message when no payments are available', () => {
    render(
      <PaymentTimeline
        payments={[]}
        isLoading={false}
        loanId="loan-1"
        onExportVOM={mockExportVOM}
        onViewDetails={mockViewDetails}
      />
    );
    
    // Check if empty state message is displayed
    expect(screen.getByText('No payment history available')).toBeInTheDocument();
  });
});