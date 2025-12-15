# Google Cloud KMS Setup Walkthrough

This guide walks you through setting up Google Cloud KMS for HIPAA-compliant encryption.

## Current Configuration
- **Project ID**: `gen-lang-client-0351606348`
- **Account**: `dev@beyome.in`

## Step-by-Step Setup

### Step 1: Authenticate with Service Account Key

If you have a service account key file, authenticate with it:

```bash
gcloud auth activate-service-account --key-file=path/to/your-service-account-key.json
```

Or if you're using application default credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/your-service-account-key.json"
```

### Step 2: Enable Cloud KMS API

```bash
gcloud services enable cloudkms.googleapis.com --project=gen-lang-client-0351606348
```

**What this does**: Enables the Cloud Key Management Service API in your GCP project, which is required to create and manage encryption keys.

### Step 3: Create Key Ring

A key ring is a logical grouping of keys in a specific location.

```bash
gcloud kms keyrings create hipaa-encryption-keys \
  --location=us-central1 \
  --project=gen-lang-client-0351606348
```

**What this does**: Creates a key ring named `hipaa-encryption-keys` in the `us-central1` region. Key rings are regional resources.

**Note**: Choose a location close to your application for better performance. Common options:
- `us-central1` (Iowa)
- `us-east1` (South Carolina)
- `europe-west1` (Belgium)
- `asia-east1` (Taiwan)

### Step 4: Create Encryption Key

```bash
gcloud kms keys create phi-encryption-key \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --purpose=encryption \
  --rotation-period=7776000s \
  --project=gen-lang-client-0351606348
```

**What this does**: 
- Creates a symmetric encryption key named `phi-encryption-key`
- Sets automatic rotation every 90 days (7776000 seconds = 90 * 24 * 60 * 60)
- The key will be used to encrypt/decrypt PHI data

**Key Details**:
- `--purpose=encryption`: Creates a symmetric key for encryption/decryption
- `--rotation-period=7776000s`: Automatically creates new key versions every 90 days (HIPAA best practice)

### Step 5: Verify Key Creation

Check that the key was created successfully:

```bash
gcloud kms keys list \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --project=gen-lang-client-0351606348
```

You should see `phi-encryption-key` in the list.

### Step 6: Get Key Version

Get the current key version (usually version 1 for a new key):

```bash
gcloud kms keys versions list \
  --key=phi-encryption-key \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --project=gen-lang-client-0351606348
```

Note the version number (usually `1` for a new key).

### Step 7: Create Service Account for Application

Create a dedicated service account that your application will use to access KMS:

```bash
gcloud iam service-accounts create beyome-kms-service \
  --display-name="Beyome KMS Service Account" \
  --description="Service account for Beyome application to access KMS keys" \
  --project=gen-lang-client-0351606348
```

**What this does**: Creates a service account that your application will use to authenticate with KMS. This follows the principle of least privilege.

### Step 8: Grant KMS Permissions to Service Account

Grant the service account permission to use the encryption key:

```bash
gcloud kms keys add-iam-policy-binding phi-encryption-key \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --member="serviceAccount:beyome-kms-service@gen-lang-client-0351606348.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=gen-lang-client-0351606348
```

**What this does**: 
- Grants the `Cloud KMS CryptoKey Encrypter/Decrypter` role to the service account
- This role allows the service account to encrypt and decrypt data using the key
- It does NOT allow key management (creation, deletion, rotation) - only usage

### Step 9: Create and Download Service Account Key

Create a key file for the service account that your application will use:

```bash
gcloud iam service-accounts keys create ./gcp-kms-key.json \
  --iam-account=beyome-kms-service@gen-lang-client-0351606348.iam.gserviceaccount.com \
  --project=gen-lang-client-0351606348
```

**What this does**: 
- Creates a JSON key file for the service account
- This file contains credentials your application needs to authenticate with GCP
- **IMPORTANT**: Keep this file secure and never commit it to version control

**Security Note**: 
- Store this file in a secure location (e.g., `/path/to/secure/location/gcp-kms-key.json`)
- Add it to `.gitignore` if it's in your project directory
- Consider using a secrets manager in production (AWS Secrets Manager, HashiCorp Vault, etc.)

### Step 10: Verify Service Account Key

Test that the key file works:

```bash
gcloud auth activate-service-account --key-file=./gcp-kms-key.json
gcloud kms keys list \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --project=gen-lang-client-0351606348
```

If this works, your service account has the correct permissions.

### Step 11: Configure Environment Variables

Add these to your `.env` file:

```env
# Encryption Configuration
ENCRYPTION_ENABLED=true
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_ROTATION_DAYS=90

# Google Cloud KMS Configuration
GCP_KMS_PROJECT_ID=gen-lang-client-0351606348
GCP_KMS_LOCATION=us-central1
GCP_KMS_KEY_RING=hipaa-encryption-keys
GCP_KMS_KEY_NAME=phi-encryption-key
GCP_KMS_KEY_VERSION=1
GCP_KMS_CREDENTIALS_PATH=./gcp-kms-key.json

# Or use GOOGLE_APPLICATION_CREDENTIALS (alternative)
# GOOGLE_APPLICATION_CREDENTIALS=./gcp-kms-key.json

# Audit Log Retention (days, default: 7 years for HIPAA)
AUDIT_LOG_RETENTION_DAYS=2555
```

**Important**: 
- Replace `./gcp-kms-key.json` with the actual path to your service account key file
- Make sure the path is relative to where your application runs, or use an absolute path

### Step 12: Test KMS Connection

Create a simple test script to verify everything works:

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
  })
  .catch(err => {
    console.error('❌ KMS connection failed:', err.message);
  });
"
```

## Optional: Configure GCS Bucket Encryption (CMEK)

If you're using Google Cloud Storage for audio files, configure Customer-Managed Encryption Keys:

```bash
# First, get your bucket name from your config
# Then run:
gcloud storage buckets update gs://YOUR_BUCKET_NAME \
  --encryption-key=projects/gen-lang-client-0351606348/locations/us-central1/keyRings/hipaa-encryption-keys/cryptoKeys/phi-encryption-key
```

**What this does**: 
- Configures your GCS bucket to use the same KMS key for encryption at rest
- All files stored in the bucket will be encrypted with your managed key

## Verification Checklist

- [ ] KMS API is enabled
- [ ] Key ring `hipaa-encryption-keys` exists in `us-central1`
- [ ] Key `phi-encryption-key` exists and is enabled
- [ ] Service account `beyome-kms-service` exists
- [ ] Service account has `roles/cloudkms.cryptoKeyEncrypterDecrypter` role
- [ ] Service account key file is created and stored securely
- [ ] Environment variables are configured in `.env`
- [ ] Test connection to KMS succeeds
- [ ] (Optional) GCS bucket is configured with CMEK

## Troubleshooting

### Error: "Permission denied" or "Access denied"
- Verify the service account has the correct IAM role
- Check that you're using the correct project ID
- Ensure the key file path is correct

### Error: "Key not found"
- Verify the key name, key ring, and location match your configuration
- Check that the key exists: `gcloud kms keys list --keyring=hipaa-encryption-keys --location=us-central1`

### Error: "API not enabled"
- Enable the KMS API: `gcloud services enable cloudkms.googleapis.com`

### Error: "Invalid credentials"
- Verify the service account key file is valid
- Check that the key file hasn't been deleted or rotated
- Ensure `GCP_KMS_CREDENTIALS_PATH` points to the correct file

## Next Steps

Once KMS is set up:

1. **Install dependencies**: `npm install @google-cloud/kms`
2. **Test encryption**: Run a dry-run migration: `node scripts/migrateEncryptExistingData.js --dry-run`
3. **Migrate existing data**: `node scripts/migrateEncryptExistingData.js`
4. **Monitor**: Check audit logs to ensure encryption is working

## Security Reminders

1. **Never commit** the service account key file to version control
2. **Rotate keys** regularly (automatic rotation is configured for 90 days)
3. **Monitor access** via Cloud Audit Logs
4. **Use separate keys** for different environments (dev/staging/prod)
5. **Backup keys** securely (store in a secure vault)

## Support

If you encounter issues:
- Check [Google Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- Review IAM permissions: `gcloud projects get-iam-policy gen-lang-client-0351606348`
- Check service account permissions: `gcloud kms keys get-iam-policy phi-encryption-key --keyring=hipaa-encryption-keys --location=us-central1`
