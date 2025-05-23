#!/usr/bin/env node
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// Load the service account key file directly
const keyPath = '/mnt/c/Users/sston/Downloads/greenway-452013-d7eadcb745e9.json';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

console.log('Testing Google Drive access with service account...\n');
console.log(`Service Account Email: ${serviceAccount.client_email}`);
console.log(`Project ID: ${serviceAccount.project_id}\n`);

// Create JWT
function createJWT(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signatureBase = `${encodedHeader}.${encodedPayload}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureBase);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64url');
  
  return `${signatureBase}.${signature}`;
}

// Exchange JWT for access token
async function getAccessToken(jwt) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();
    
    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Token exchange failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// List files in a folder
async function listFiles(accessToken, folderId = 'root') {
  return new Promise((resolve, reject) => {
    const query = folderId === 'root' 
      ? "mimeType='application/vnd.google-apps.folder' and 'root' in parents"
      : `'${folderId}' in parents`;
    
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.append('q', query);
    url.searchParams.append('fields', 'files(id,name,mimeType)');
    url.searchParams.append('pageSize', '10');
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`List files failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// Main test function
async function testGoogleDriveAccess() {
  try {
    console.log('1. Creating JWT...');
    const jwt = createJWT(serviceAccount.client_email, serviceAccount.private_key);
    console.log('   ✓ JWT created successfully\n');
    
    console.log('2. Exchanging JWT for access token...');
    const tokenResponse = await getAccessToken(jwt);
    console.log('   ✓ Access token obtained successfully');
    console.log(`   Token type: ${tokenResponse.token_type}`);
    console.log(`   Expires in: ${tokenResponse.expires_in} seconds\n`);
    
    console.log('3. Testing Drive API access...');
    console.log('   Listing folders in root directory...');
    const filesResponse = await listFiles(tokenResponse.access_token);
    
    if (filesResponse.files && filesResponse.files.length > 0) {
      console.log(`   ✓ Successfully accessed Google Drive!`);
      console.log(`   Found ${filesResponse.files.length} folders:\n`);
      filesResponse.files.forEach(file => {
        console.log(`   - ${file.name} (ID: ${file.id})`);
      });
      
      console.log('\n✅ SUCCESS! The service account has valid access to Google Drive.');
      console.log('\nTo use a specific folder:');
      console.log('1. Share the folder with: ' + serviceAccount.client_email);
      console.log('2. Use the folder ID shown above in your sync configuration');
    } else {
      console.log('   ⚠️  No folders found in root directory.');
      console.log('   This is normal if no folders are shared with the service account yet.');
      console.log('\n✅ Authentication successful! Now share folders with:');
      console.log('   ' + serviceAccount.client_email);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.error('\nPossible causes:');
      console.error('- The service account has been deleted');
      console.error('- The private key has been rotated');
      console.error('- Clock skew between your system and Google servers');
    }
  }
}

// Also test the exact format that would be used in Supabase
console.log('\n4. Testing credential format for Supabase...');
console.log('   Testing private key format conversion...');

// This simulates how the Edge Function processes the key
const privateKeyFromEnv = serviceAccount.private_key;
const formattedPrivateKey = privateKeyFromEnv.replace(/\\n/g, '\n');

try {
  // Try to create a sign object with the formatted key
  const sign = crypto.createSign('RSA-SHA256');
  sign.update('test');
  sign.end();
  sign.sign(formattedPrivateKey, 'base64');
  console.log('   ✓ Private key format is valid for crypto operations\n');
} catch (error) {
  console.error('   ❌ Private key format error:', error.message);
}

// Run the test
testGoogleDriveAccess();