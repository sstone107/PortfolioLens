#!/usr/bin/env node

// Test script to verify Google service account credentials format
// This helps diagnose common issues with the credentials

console.log('Google Service Account Credential Tester');
console.log('=======================================\n');

// These should match what you've set in Supabase Edge Functions
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

console.log('1. Checking environment variables...');
console.log(`   Email present: ${email ? 'YES' : 'NO'}`);
console.log(`   Private key present: ${privateKey ? 'YES' : 'NO'}`);

if (!email || !privateKey) {
  console.log('\n❌ Missing credentials. Set these environment variables:');
  console.log('   GOOGLE_SERVICE_ACCOUNT_EMAIL');
  console.log('   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  process.exit(1);
}

console.log('\n2. Validating email format...');
const emailRegex = /^[a-zA-Z0-9-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/;
if (emailRegex.test(email)) {
  console.log(`   ✓ Valid service account email format: ${email}`);
} else {
  console.log(`   ❌ Invalid email format. Expected: *@*.iam.gserviceaccount.com`);
  console.log(`   Got: ${email}`);
}

console.log('\n3. Validating private key format...');
const hasBeginMarker = privateKey.includes('-----BEGIN PRIVATE KEY-----');
const hasEndMarker = privateKey.includes('-----END PRIVATE KEY-----');
const hasNewlines = privateKey.includes('\\n') || privateKey.includes('\n');

console.log(`   BEGIN marker present: ${hasBeginMarker ? 'YES' : 'NO'}`);
console.log(`   END marker present: ${hasEndMarker ? 'YES' : 'NO'}`);
console.log(`   Contains newlines: ${hasNewlines ? 'YES' : 'NO'}`);

if (!hasBeginMarker || !hasEndMarker) {
  console.log('\n❌ Private key missing BEGIN/END markers');
  console.log('   The key should start with: -----BEGIN PRIVATE KEY-----');
  console.log('   And end with: -----END PRIVATE KEY-----');
}

// Try to extract and validate the key content
const pemHeader = "-----BEGIN PRIVATE KEY-----";
const pemFooter = "-----END PRIVATE KEY-----";
const startIdx = privateKey.indexOf(pemHeader);
const endIdx = privateKey.indexOf(pemFooter);

if (startIdx !== -1 && endIdx !== -1) {
  const keyContent = privateKey.substring(
    startIdx + pemHeader.length,
    endIdx
  ).trim().replace(/\\n/g, '').replace(/\s/g, '');
  
  console.log(`\n4. Key content analysis...`);
  console.log(`   Key length (base64 chars): ${keyContent.length}`);
  console.log(`   Expected length: ~1600-1700 characters`);
  
  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  const isValidBase64 = base64Regex.test(keyContent);
  console.log(`   Valid base64: ${isValidBase64 ? 'YES' : 'NO'}`);
  
  if (keyContent.length < 1000) {
    console.log('   ⚠️  Key seems too short. May be truncated.');
  }
} else {
  console.log('\n❌ Could not extract key content');
}

console.log('\n5. Common issues to check:');
console.log('   - Make sure you copied the ENTIRE private key from the JSON file');
console.log('   - Include all \\n characters exactly as they appear');
console.log('   - Don\'t add extra spaces or line breaks');
console.log('   - The email must match the one in the JSON key file');

console.log('\nExample of correct format:');
console.log('GOOGLE_SERVICE_ACCOUNT_EMAIL=my-service@my-project.iam.gserviceaccount.com');
console.log('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nMIIEvQ...very long string...8pkQ==\\n-----END PRIVATE KEY-----\\n');

console.log('\nTo test with your credentials:');
console.log('1. Export them as environment variables');
console.log('2. Run: node scripts/test-google-credentials.js');