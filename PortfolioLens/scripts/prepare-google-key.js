const fs = require('fs');
const path = require('path');

// This script helps prepare the Google service account key for Supabase

if (process.argv.length < 3) {
  console.log('Usage: node prepare-google-key.js <path-to-service-account-json>');
  process.exit(1);
}

const jsonPath = process.argv[2];

try {
  // Read the service account JSON
  const jsonContent = fs.readFileSync(jsonPath, 'utf8');
  const serviceAccount = JSON.parse(jsonContent);
  
  console.log('\n=== Service Account Details ===\n');
  console.log('Email:', serviceAccount.client_email);
  console.log('\n=== Private Key (for Supabase) ===\n');
  console.log('Copy the following value exactly as shown:');
  console.log('----------------------------------------');
  console.log(serviceAccount.private_key);
  console.log('----------------------------------------');
  
  console.log('\n=== Instructions ===\n');
  console.log('1. Copy the ENTIRE private key value above (including BEGIN/END lines)');
  console.log('2. In Supabase Dashboard, set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to this value');
  console.log('3. Set GOOGLE_SERVICE_ACCOUNT_EMAIL to:', serviceAccount.client_email);
  
  // Optionally save to files for easier copying
  const outputDir = path.dirname(jsonPath);
  fs.writeFileSync(path.join(outputDir, 'google-email.txt'), serviceAccount.client_email);
  fs.writeFileSync(path.join(outputDir, 'google-key.txt'), serviceAccount.private_key);
  
  console.log('\n=== Files Created ===\n');
  console.log('- google-email.txt (contains the email)');
  console.log('- google-key.txt (contains the private key)');
  console.log('\nYou can open these files and copy the values to Supabase.');
  
} catch (error) {
  console.error('Error reading service account JSON:', error.message);
  process.exit(1);
}