const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to run insert query for borrowers
async function insertBorrowerData(loanId, borrowerData) {
  try {
    // Convert fields for database insert
    if (borrowerData.annualIncome) {
      borrowerData.annual_income = parseFloat(borrowerData.annualIncome);
      delete borrowerData.annualIncome;
    }
    
    if (borrowerData.creditScore) {
      borrowerData.credit_score = parseInt(borrowerData.creditScore);
      delete borrowerData.creditScore;
    }
    
    // Insert the borrower data
    const { data, error } = await supabase
      .from('borrowers')
      .upsert([
        {
          loan_id: loanId,
          ...borrowerData
        }
      ]);
    
    if (error) throw error;
    
    console.log(`Inserted borrower data for loan ID: ${loanId}`);
    return data;
  } catch (error) {
    console.error(`Error inserting borrower data for loan ID ${loanId}:`, error);
    throw error;
  }
}

// Main function to run all insert operations
async function addTestBorrowerData() {
  try {
    console.log('Fetching existing loan IDs...');
    
    // Get all loan IDs to associate borrowers with
    const { data: loans, error: loanError } = await supabase
      .from('loans')
      .select('id, loan_number')
      .limit(10);
    
    if (loanError) throw loanError;
    
    if (!loans || loans.length === 0) {
      throw new Error('No loans found. Please ensure test loan data exists first.');
    }
    
    console.log(`Found ${loans.length} loans. Adding borrower data...`);
    
    // Process each loan and add borrower data
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      const loanId = loan.id;
      
      // Primary borrower data
      await insertBorrowerData(loanId, {
        first_name: `John${i}`,
        middle_name: i % 2 === 0 ? `M${i}` : null,
        last_name: `Smith${i}`,
        email: `john.smith${i}@example.com`,
        phone_number: `555-123-${1000 + i}`,
        ssn_last_four: `${5000 + i}`.substring(1, 5),
        is_primary: true,
        mailing_address: `${100 + i} Main Street`,
        mailing_city: 'Springfield',
        mailing_state: 'IL',
        mailing_zip: `6290${i}`,
        credit_score: 680 + (i * 5),
        annual_income: 75000.00 + (i * 2500),
        employment_status: i % 3 === 0 ? 'Retired' : 'Employed',
        employer: i % 3 === 0 ? null : `ABC Corporation ${i}`,
        borrower_type: 'Primary'
      });
      
      // For half the loans, add a co-borrower
      if (i % 2 === 0) {
        await insertBorrowerData(loanId, {
          first_name: `Jane${i}`,
          middle_name: i % 3 === 0 ? `L${i}` : null,
          last_name: `Smith${i}`,
          email: `jane.smith${i}@example.com`,
          phone_number: `555-456-${2000 + i}`,
          ssn_last_four: `${6000 + i}`.substring(1, 5),
          is_primary: false,
          mailing_address: `${100 + i} Main Street`,
          mailing_city: 'Springfield',
          mailing_state: 'IL',
          mailing_zip: `6290${i}`,
          credit_score: 700 + (i * 3),
          annual_income: 65000.00 + (i * 1500),
          employment_status: 'Employed',
          employer: `XYZ Industries ${i}`,
          borrower_type: 'Co-Borrower'
        });
      }
    }
    
    console.log('Test borrower data has been successfully added!');
  } catch (error) {
    console.error('Error adding test borrower data:', error);
    process.exit(1);
  }
}

// Run the script
addTestBorrowerData()
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });