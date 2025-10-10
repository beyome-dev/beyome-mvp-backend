// vertex-diagnostic.js
// Run this script to diagnose Vertex AI setup issues
// Usage: node vertex-diagnostic.js

require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');
const config = require('./config');

const PROJECT_ID =  config.google.projectID;
const LOCATION =  config.google.projectLocation || 'us-central1';
const modelName = config.google.aiModel || 'gemini-2.5-flash';

console.log('=== Vertex AI Diagnostic Tool ===\n');

async function runDiagnostics() {
  const checks = [];

  // Check 1: Environment Variables
  console.log('1. Checking environment variables...');
  if (!PROJECT_ID) {
    checks.push({ check: 'GCP_PROJECT_ID', status: '❌ FAIL', message: 'Not set' });
  } else {
    checks.push({ check: 'GCP_PROJECT_ID', status: '✅ PASS', message: PROJECT_ID });
  }
  checks.push({ check: 'GCP_LOCATION', status: '✅ PASS', message: LOCATION });

  // Check 2: Authentication
  console.log('\n2. Checking authentication...');
  try {
    // Check for ADC credentials
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    checks.push({ 
      check: 'Authentication', 
      status: '✅ PASS', 
      message: `Using project: ${projectId}` 
    });
  } catch (error) {
    checks.push({ 
      check: 'Authentication', 
      status: '❌ FAIL', 
      message: error.message 
    });
  }

  // Check 3: Vertex AI Initialization
  console.log('\n3. Testing Vertex AI initialization...');
  try {
    const vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION
    });
    checks.push({ 
      check: 'Vertex AI Init', 
      status: '✅ PASS', 
      message: 'Successfully initialized' 
    });

    // Check 4: Model Access
    console.log('\n4. Testing model access...');
    try {
      const model = vertexAI.getGenerativeModel({ model: modelName });
      checks.push({ 
        check: 'Model Access', 
        status: '✅ PASS', 
        message: 'Model loaded successfully' 
      });

      // Check 5: Simple Generation Test
      console.log('\n5. Testing content generation...');
      try {
        const result = await model.generateContent('Say "Hello World"');
        
        // Handle different response formats
        let responseText;
        if (typeof result.response.text === 'function') {
          responseText = result.response.text();
        } else if (result.response.candidates && result.response.candidates[0]) {
          responseText = result.response.candidates[0].content.parts[0].text;
        } else {
          responseText = JSON.stringify(result.response);
        }
        
        checks.push({ 
          check: 'Content Generation', 
          status: '✅ PASS', 
          message: `Response: ${responseText.substring(0, 50)}...` 
        });
      } catch (error) {
        checks.push({ 
          check: 'Content Generation', 
          status: '❌ FAIL', 
          message: error.message 
        });
      }

      // Check 6: System Instruction Test
      console.log('\n6. Testing with system instructions...');
      try {
        const modelWithInstructions = vertexAI.getGenerativeModel({
          model: modelName,
          systemInstruction: {
            role: 'system',
            parts: [{ text: 'You are a helpful assistant.' }]
          }
        });
        const result = await modelWithInstructions.generateContent('Say "Hello Azhar Sir"');
         // Handle different response formats
        let responseText;
        if (typeof result.response.text === 'function') {
          responseText = result.response.text();
        } else if (result.response.candidates && result.response.candidates[0]) {
          responseText = result.response.candidates[0].content.parts[0].text;
        } else {
          responseText = JSON.stringify(result.response);
        }
        
        checks.push({ 
          check: 'Content Generation', 
          status: '✅ PASS', 
          message: `Response: ${responseText.substring(0, 50)}...` 
        });
      } catch (error) {
        checks.push({ 
          check: 'System Instructions', 
          status: '❌ FAIL', 
          message: error.message 
        });
      }

    } catch (error) {
      checks.push({ 
        check: 'Model Access', 
        status: '❌ FAIL', 
        message: error.message 
      });
    }

  } catch (error) {
    checks.push({ 
      check: 'Vertex AI Init', 
      status: '❌ FAIL', 
      message: error.message 
    });
  }

  // Print Results
  console.log('\n=== Diagnostic Results ===\n');
  checks.forEach(({ check, status, message }) => {
    console.log(`${status} ${check}`);
    console.log(`   ${message}\n`);
  });

  // Summary
  const passed = checks.filter(c => c.status.includes('✅')).length;
  const failed = checks.filter(c => c.status.includes('❌')).length;
  
  console.log('=== Summary ===');
  console.log(`Total Checks: ${checks.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('=== Troubleshooting Steps ===\n');
    
    if (!PROJECT_ID) {
      console.log('1. Set GCP_PROJECT_ID in your .env file');
      console.log('   GCP_PROJECT_ID=your-project-id\n');
    }

    const authFailed = checks.find(c => c.check === 'Authentication' && c.status.includes('❌'));
    if (authFailed) {
      console.log('2. Authenticate with Google Cloud:');
      console.log('   gcloud auth application-default login\n');
    }

    const apiFailed = checks.find(c => c.check === 'Content Generation' && c.status.includes('❌'));
    if (apiFailed) {
      console.log('3. Enable Vertex AI API:');
      console.log('   gcloud services enable aiplatform.googleapis.com\n');
      console.log('4. Check service account permissions:');
      console.log('   - roles/aiplatform.user\n');
    }

    console.log('5. Verify your setup:');
    console.log('   gcloud config get-value project');
    console.log('   gcloud config get-value account\n');
  } else {
    console.log('✅ All checks passed! Vertex AI is configured correctly.\n');
  }
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('Diagnostic script error:', error);
  process.exit(1);
});