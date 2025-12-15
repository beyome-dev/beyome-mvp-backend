# KMS Environment Variables Setup

Based on your manually created KMS key, here's what you need to configure:

## Your KMS Configuration

From the Google Cloud Console, your key details are:
- **Key Ring**: `recapp-hipaa-encryption-keys`
- **Key Name**: `phi-encryption-key`
- **Location**: `global`
- **Key Version**: `1`
- **Rotation**: Every 90 days

## Required Environment Variables

Add these to your `.env` file:

```env
# Encryption Configuration
ENCRYPTION_ENABLED=true
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_ROTATION_DAYS=90

# Google Cloud KMS Configuration
# These use your existing GOOGLE_PROJECT_ID and GOOGLE_PROJECT_LOCATION
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PROJECT_LOCATION=global

# Optional: Override defaults if needed
GCP_KMS_KEY_RING=recapp-hipaa-encryption-keys
GCP_KMS_KEY_NAME=phi-encryption-key
GCP_KMS_KEY_VERSION=1

# Service Account Credentials
# Point to your service account key file
GOOGLE_APPLICATION_CREDENTIALS=./path/to/your-service-account-key.json

# Audit Log Retention (days, default: 7 years for HIPAA)
AUDIT_LOG_RETENTION_DAYS=2555
```

## Important Notes

1. **Location is `global`**: Your key ring was created in the `global` location, not a regional location like `us-central1`. Make sure `GOOGLE_PROJECT_LOCATION=global` is set.

2. **Key Ring Name**: The default in the config is now `recapp-hipaa-encryption-keys` to match what you created. If you want to use a different name, set `GCP_KMS_KEY_RING` in your `.env`.

3. **Service Account**: You'll need to:
   - Create a service account (or use an existing one)
   - Grant it the `roles/cloudkms.cryptoKeyEncrypterDecrypter` role on your key
   - Download the service account key JSON file
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to point to that file

## Granting Service Account Permissions

If you haven't already granted permissions to a service account, you can do it via:

### Option 1: Google Cloud Console
1. Go to your key: `phi-encryption-key` in key ring `recapp-hipaa-encryption-keys`
2. Click the "Permissions" tab
3. Click "Grant Access"
4. Add your service account email
5. Grant role: `Cloud KMS CryptoKey Encrypter/Decrypter`

### Option 2: gcloud CLI
```bash
gcloud kms keys add-iam-policy-binding phi-encryption-key \
  --keyring=recapp-hipaa-encryption-keys \
  --location=global \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=YOUR_PROJECT_ID
```

## Testing Your Setup

After configuring the environment variables, test the connection:

```bash
node -e "
const { KeyManagementServiceClient } = require('@google-cloud/kms');
const config = require('./config');

const client = new KeyManagementServiceClient({
  keyFilename: config.kms.credentialsPath,
  projectId: config.kms.projectId
});

const keyPath = client.cryptoKeyPath(
  config.kms.projectId,
  config.kms.location,
  config.kms.keyRing,
  config.kms.keyName
);

console.log('Testing KMS connection...');
console.log('Key path:', keyPath);

client.getCryptoKey({ name: keyPath })
  .then(([key]) => {
    console.log('✅ KMS connection successful!');
    console.log('Key name:', key.name);
    console.log('Key state:', key.state);
    console.log('Location:', key.name.split('/')[3]);
  })
  .catch(err => {
    console.error('❌ KMS connection failed:', err.message);
    console.error('Check:');
    console.error('  1. Service account has correct permissions');
    console.error('  2. Key path is correct');
    console.error('  3. Credentials file is valid');
  });
"
```

## Next Steps

1. ✅ KMS key is created (you've done this)
2. ⏳ Create/grant service account permissions
3. ⏳ Set environment variables in `.env`
4. ⏳ Test KMS connection
5. ⏳ Run migration: `node scripts/migrateEncryptExistingData.js --dry-run`
