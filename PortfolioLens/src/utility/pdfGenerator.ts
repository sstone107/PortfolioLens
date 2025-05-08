import { formatCurrency, formatDate } from './formatters';
import { Payment } from '../services/paymentService';

export interface VOMData {
  loan: any;
  borrowers: any[];
  property: any;
  payments: Payment[];
  generatedAt: string;
}

/**
 * Generate HTML content for verification of mortgage (VOM) PDF
 * @param data VOM data with loan, borrower, property, and payment information
 * @returns HTML string for VOM report
 */
export function generateVOMHtml(data: VOMData): string {
  const { loan, borrowers, property, payments } = data;
  const filteredPayments = payments.slice(0, 24); // Limit to 24 months
  const primaryBorrower = borrowers?.find(b => b.is_primary) || borrowers?.[0] || {};
  
  // Function to get payment status with corresponding color
  const getPaymentStatus = (payment: Payment) => {
    let statusText = 'On Time';
    let statusColor = '#4caf50'; // Green
    
    if (payment.days_late === undefined) {
      if (payment.status?.toLowerCase() === 'on time' || 
          payment.status?.toLowerCase() === 'posted') {
        statusText = 'On Time';
        statusColor = '#4caf50'; // Green
      } else if (payment.status?.toLowerCase() === 'late') {
        statusText = 'Late';
        statusColor = '#ff9800'; // Yellow/Orange
      } else if (payment.status?.toLowerCase() === 'missed') {
        statusText = 'Missed';
        statusColor = '#f44336'; // Red
      } else {
        statusText = payment.status || 'Unknown';
        statusColor = '#757575'; // Grey
      }
    } else {
      const daysLate = payment.days_late;
      
      if (daysLate <= 0) {
        statusText = daysLate < 0 ? `Early (${Math.abs(daysLate)} days)` : 'On Time';
        statusColor = '#4caf50'; // Green
      } else if (daysLate > 0 && daysLate <= 14) {
        statusText = `Late (${daysLate} days)`;
        statusColor = '#8bc34a'; // Light Green
      } else if (daysLate > 14 && daysLate <= 30) {
        statusText = `Late (${daysLate} days)`;
        statusColor = '#ff9800'; // Yellow/Orange
      } else {
        statusText = `Severely Late (${daysLate} days)`;
        statusColor = '#f44336'; // Red
      }
    }
    
    return { text: statusText, color: statusColor };
  };
  
  // Function to create payment rows
  const createPaymentRows = () => {
    let rows = '';
    
    filteredPayments.forEach(payment => {
      const status = getPaymentStatus(payment);
      
      rows += `
        <tr>
          <td>${formatDate(payment.due_date || payment.transaction_date)}</td>
          <td>${formatDate(payment.transaction_date)}</td>
          <td style="color: ${status.color}; font-weight: bold;">${status.text}</td>
          <td>${payment.days_late !== undefined ? payment.days_late : 'N/A'}</td>
          <td>${formatCurrency(payment.amount)}</td>
          <td>${payment.payment_method || 'N/A'}</td>
        </tr>
      `;
    });
    
    if (rows === '') {
      rows = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px;">No payment history available</td>
        </tr>
      `;
    }
    
    return rows;
  };
  
  // Generate HTML content
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Verification of Mortgage (VOM)</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #333;
          line-height: 1.6;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 100%;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 10px;
          border-bottom: 2px solid #2196f3;
        }
        .header h1 {
          color: #2196f3;
          margin-bottom: 5px;
        }
        .header p {
          color: #757575;
          font-size: 14px;
        }
        .section {
          margin-bottom: 30px;
        }
        .section-title {
          margin-bottom: 15px;
          padding-bottom: 5px;
          border-bottom: 1px solid #ddd;
          color: #2196f3;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }
        .info-item {
          margin-bottom: 10px;
        }
        .info-label {
          font-weight: bold;
          color: #757575;
          font-size: 12px;
          text-transform: uppercase;
        }
        .info-value {
          font-size: 14px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background-color: #f5f5f5;
          text-align: left;
          padding: 10px;
          font-size: 12px;
          border-bottom: 2px solid #ddd;
          color: #757575;
          text-transform: uppercase;
        }
        td {
          padding: 10px;
          border-bottom: 1px solid #ddd;
          font-size: 13px;
          vertical-align: top;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 12px;
          color: #757575;
          padding-top: 10px;
          border-top: 1px solid #ddd;
        }
        .generated-date {
          font-style: italic;
          margin-top: 5px;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .badge-success {
          background-color: #e8f5e9;
          color: #4caf50;
        }
        .badge-warning {
          background-color: #fff3e0;
          color: #ff9800;
        }
        .badge-danger {
          background-color: #ffebee;
          color: #f44336;
        }
        .badge-default {
          background-color: #f5f5f5;
          color: #757575;
        }
        .confidential {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          text-align: center;
          transform: rotate(-45deg);
          transform-origin: center;
          font-size: 100px;
          color: rgba(244, 67, 54, 0.1);
          z-index: -1;
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verification of Mortgage</h1>
          <p>This document confirms the payment history for the referenced loan</p>
        </div>
        
        <div class="confidential">CONFIDENTIAL</div>
        
        <div class="section">
          <h2 class="section-title">Loan Information</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Loan Number</div>
              <div class="info-value">${loan?.loan_number || loan?.valon_loan_id || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Origination Date</div>
              <div class="info-value">${formatDate(loan?.origination_date)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Original Loan Amount</div>
              <div class="info-value">${formatCurrency(loan?.original_loan_amount)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Current Balance</div>
              <div class="info-value">${formatCurrency(loan?.current_upb)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Interest Rate</div>
              <div class="info-value">${loan?.current_interest_rate ? loan.current_interest_rate + '%' : 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Maturity Date</div>
              <div class="info-value">${formatDate(loan?.maturity_date)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Payment Frequency</div>
              <div class="info-value">${loan?.payment_frequency || 'Monthly'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Loan Status</div>
              <div class="info-value">${loan?.loan_status || 'Active'}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Borrower Information</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Borrower Name</div>
              <div class="info-value">${primaryBorrower.first_name || ''} ${primaryBorrower.last_name || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Property Address</div>
              <div class="info-value">
                ${property?.address_line1 || 'N/A'}<br>
                ${property?.city || ''}, ${property?.state || ''} ${property?.zip_code || ''}
              </div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2 class="section-title">Payment History (Last ${filteredPayments.length} Months)</h2>
          <table>
            <thead>
              <tr>
                <th>Due Date</th>
                <th>Payment Date</th>
                <th>Status</th>
                <th>Days Late</th>
                <th>Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              ${createPaymentRows()}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>This Verification of Mortgage has been generated automatically by PortfolioLens.</p>
          <p>The information contained in this document is confidential and for verification purposes only.</p>
          <p class="generated-date">Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Generate a Verification of Mortgage (VOM) PDF
 * @param data VOM data with loan, borrower, property, and payment information
 * @returns Base64 encoded PDF string
 */
export function generateVOMPdf(data: VOMData): Promise<string> {
  // Since we don't have a PDF generation library, we'll use a browser-based approach
  // This creates an HTML string that can be opened in a new window or tab
  // In a real implementation, you would use jsPDF or pdfmake
  const htmlContent = generateVOMHtml(data);

  // For now, we'll just return the HTML content
  // In a real implementation, the HTML would be converted to PDF
  // But for demo purposes, we're returning a fake PDF data URI
  return Promise.resolve(
    `data:application/pdf;base64,VE9ETzogUmVwbGFjZSB0aGlzIHdpdGggYWN0dWFsIFBERiBnZW5lcmF0aW9uIGluIHByb2R1Y3Rpb24=`
  );
}

/**
 * Download a VOM PDF
 * @param data VOM data with loan, borrower, property, and payment information
 */
export function downloadVOMPdf(data: VOMData): void {
  // Generate the HTML content
  const htmlContent = generateVOMHtml(data);
  
  // Create a hidden iframe to render the HTML
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  
  // Write the HTML content to the iframe
  const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDocument) {
    iframeDocument.open();
    iframeDocument.write(htmlContent);
    iframeDocument.close();
    
    // Give the browser a moment to render the iframe
    setTimeout(() => {
      // Print the iframe content (this will open the browser's print dialog)
      iframe.contentWindow?.print();
      
      // Remove the iframe after a delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }
}