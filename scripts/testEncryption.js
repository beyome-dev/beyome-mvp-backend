/**
 * Test Encryption/Decryption
 * 
 * This script tests that encryption and decryption are working correctly
 * with your KMS setup.
 */

require('dotenv').config();
const encryptionService = require('../services/encryption/encryption.service');
const config = require('../config');

async function testEncryption() {
  console.log('🔐 Testing Encryption Service...\n');
  
  // Check if encryption is enabled
  if (!config.encryption.enabled) {
    console.log('⚠️  Encryption is disabled in configuration.');
    console.log('   Set ENCRYPTION_ENABLED=true in your .env file');
    return;
  }
  
  console.log('Configuration:');
  console.log(`  - Encryption Enabled: ${config.encryption.enabled}`);
  console.log(`  - Algorithm: ${config.encryption.algorithm}`);
  console.log(`  - KMS Project: ${config.kms.projectId}`);
  console.log(`  - KMS Location: ${config.kms.location}`);
  console.log(`  - Key Ring: ${config.kms.keyRing}`);
  console.log(`  - Key Name: ${config.kms.keyName}`);
  console.log(`  - Key Version: ${config.kms.keyVersion}`);
  console.log(`  - Credentials: ${config.kms.credentialsPath ? '✅ Set' : '❌ Not set'}\n`);
  
  // Test data
  const testData = [
    'Hello, this is a test string',
    'Patient name: John Doe',
    'Email: patient@example.com',
    'Phone: +1-555-123-4567',
    JSON.stringify({ 
      firstName: 'Jane', 
      lastName: 'Smith',
      diagnosis: 'Anxiety Disorder'
    })
  ];
  
  console.log('Testing encryption/decryption...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < testData.length; i++) {
    const original = testData[i];
    const testName = `Test ${i + 1}`;
    
    try {
      console.log(`${testName}: Encrypting...`);
      
      // Encrypt
      const encrypted = await encryptionService.encrypt(original, {
        resourceType: 'Test',
        resourceId: 'test-id',
        field: 'testField'
      });
      
      if (!encrypted || encrypted === original) {
        throw new Error('Encryption returned unchanged data');
      }
      
      console.log(`  ✅ Encrypted (length: ${encrypted.length} chars)`);
      
      // Decrypt
      console.log(`${testName}: Decrypting...`);
      const decrypted = await encryptionService.decrypt(encrypted, {
        resourceType: 'Test',
        resourceId: 'test-id',
        field: 'testField'
      });
      
      if (decrypted !== original) {
        throw new Error('Decrypted data does not match original');
      }
      
      console.log(`  ✅ Decrypted successfully`);
      console.log(`  Original: "${original.substring(0, 50)}${original.length > 50 ? '...' : ''}"`);
      console.log(`  Decrypted: "${decrypted.substring(0, 50)}${decrypted.length > 50 ? '...' : ''}"`);
      console.log(`  Match: ${decrypted === original ? '✅' : '❌'}\n`);
      
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}\n`);
      failCount++;
    }
  }
  
  // Test nested object encryption
  console.log('Testing nested object encryption...\n');
  try {
    const nestedObject = {
      address: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      },
      contact: {
        email: 'test@example.com',
        phone: '555-1234'
      }
    };
    
    console.log('Encrypting nested object...');
    const encryptedNested = await encryptionService.encryptNestedObject(nestedObject);
    console.log('  ✅ Encrypted nested object');
    
    console.log('Decrypting nested object...');
    const decryptedNested = await encryptionService.decryptNestedObject(encryptedNested);
    console.log('  ✅ Decrypted nested object');
    
    // Verify structure
    const originalStr = JSON.stringify(nestedObject);
    const decryptedStr = JSON.stringify(decryptedNested);
    
    if (originalStr === decryptedStr) {
      console.log('  ✅ Nested object encryption/decryption successful\n');
      successCount++;
    } else {
      throw new Error('Nested object does not match after decryption');
    }
  } catch (error) {
    console.error(`  ❌ Nested object test failed: ${error.message}\n`);
    failCount++;
  }
  
  // Summary
  console.log('='.repeat(50));
  console.log('Test Summary:');
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  Total: ${successCount + failCount}`);
  
  if (failCount === 0) {
    console.log('\n🎉 All encryption tests passed! Your KMS setup is working correctly.');
    console.log('\nNext steps:');
    console.log('  1. Run migration dry-run: node scripts/migrateEncryptExistingData.js --dry-run');
    console.log('  2. Run actual migration: node scripts/migrateEncryptExistingData.js');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run test
testEncryption().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
