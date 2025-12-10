# HIPAA Encryption Setup Guide

This document provides instructions for setting up HIPAA-compliant encryption for the Beyome MVP Backend.

## Prerequisites

1. Google Cloud Platform (GCP) account with billing enabled
2. GCP project with KMS API enabled
3. Service account with KMS permissions
4. MongoDB database connection

## Step 1: Set Up Google Cloud KMS

### 1.1 Enable KMS API

```bash
gcloud services enable cloudkms.googleapis.com
```

### 1.2 Create Key Ring

```bash
gcloud kms keyrings create hipaa-encryption-keys \
  --location=us-central1 \
  --project=YOUR_PROJECT_ID
```

### 1.3 Create Encryption Key

```bash
gcloud kms keys create phi-encryption-key \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --purpose=encryption \
  --rotation-period=7776000s \
  --project=YOUR_PROJECT_ID
```

Note: `--rotation-period=7776000s` is 90 days (90 * 24 * 60 * 60)

### 1.4 Create Service Account

```bash
gcloud iam service-accounts create beyome-kms-service \
  --display-name="Beyome KMS Service Account" \
  --project=YOUR_PROJECT_ID
```

### 1.5 Grant KMS Permissions

```bash
# Grant Cloud KMS CryptoKey Encrypter/Decrypter role
gcloud kms keys add-iam-policy-binding phi-encryption-key \
  --keyring=hipaa-encryption-keys \
  --location=us-central1 \
  --member="serviceAccount:beyome-kms-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=YOUR_PROJECT_ID
```

### 1.6 Create and Download Service Account Key

```bash
gcloud iam service-accounts keys create ./gcp-kms-key.json \
  --iam-account=beyome-kms-service@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --project=YOUR_PROJECT_ID
```

## Step 2: Configure Google Cloud Storage (GCS) CMEK

### 2.1 Enable CMEK for GCS Bucket

```bash
gcloud storage buckets update gs://YOUR_BUCKET_NAME \
  --encryption-key=projects/YOUR_PROJECT_ID/locations/us-central1/keyRings/hipaa-encryption-keys/cryptoKeys/phi-encryption-key
```

Alternatively, configure via GCP Console:
1. Go to Cloud Storage > Buckets
2. Select your bucket
3. Click "Edit" tab
4. Under "Encryption", select "Customer-managed"
5. Choose your key ring and key

## Step 3: Environment Variables

Add the following to your `.env` file:

```env
# Encryption Configuration
ENCRYPTION_ENABLED=true
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_ROTATION_DAYS=90

# Google Cloud KMS Configuration
GCP_KMS_PROJECT_ID=your-project-id
GCP_KMS_LOCATION=us-central1
GCP_KMS_KEY_RING=hipaa-encryption-keys
GCP_KMS_KEY_NAME=phi-encryption-key
GCP_KMS_KEY_VERSION=1
GCP_KMS_CREDENTIALS_PATH=./gcp-kms-key.json

# Or use existing GOOGLE_APPLICATION_CREDENTIALS
# GOOGLE_APPLICATION_CREDENTIALS=./gcp-kms-key.json

# Audit Log Retention (days, default: 7 years for HIPAA)
AUDIT_LOG_RETENTION_DAYS=2555
```

## Step 4: Install Dependencies

```bash
npm install @google-cloud/kms
```

## Step 5: Run Migration Script

### 5.1 Dry Run (Recommended First)

Test the migration without making changes:

```bash
node scripts/migrateEncryptExistingData.js --dry-run
```

### 5.2 Migrate Specific Model

```bash
# Migrate only Clients
node scripts/migrateEncryptExistingData.js --model=Client

# Migrate only Recordings
node scripts/migrateEncryptExistingData.js --model=Recording

# Migrate only Notes
node scripts/migrateEncryptExistingData.js --model=Note

# Migrate only Sessions
node scripts/migrateEncryptExistingData.js --model=Session
```

### 5.3 Full Migration

```bash
node scripts/migrateEncryptExistingData.js --batch-size=100
```

### 5.4 Rollback (if needed)

```bash
node scripts/migrateEncryptExistingData.js --rollback
```

## Step 6: Verify Encryption

After migration, verify that data is encrypted:

1. Check database - encrypted fields should contain base64-encoded strings
2. Test API endpoints - data should be automatically decrypted when retrieved
3. Check audit logs - encryption operations should be logged

## Security Best Practices

1. **Key Management**
   - Never commit KMS credentials to version control
   - Rotate keys regularly (configured for 90 days)
   - Use separate keys for different environments (dev/staging/prod)

2. **Access Control**
   - Limit service account permissions to minimum required
   - Use IAM conditions to restrict key access
   - Monitor key usage via Cloud Audit Logs

3. **Backup and Recovery**
   - Migration script creates backups automatically
   - Store backups securely (encrypted)
   - Test restore procedures regularly

4. **Monitoring**
   - Monitor encryption/decryption operations via audit logs
   - Set up alerts for encryption failures
   - Track key rotation events

## Troubleshooting

### Error: "KMS initialization failed"
- Verify KMS API is enabled
- Check service account permissions
- Verify credentials file path

### Error: "Encryption failed"
- Check KMS key is enabled and accessible
- Verify service account has correct IAM roles
- Check network connectivity to GCP

### Error: "Decryption failed"
- Verify data was encrypted with current key version
- Check if key was rotated (may need to update key version)
- Ensure encryption service is properly initialized

## Support

For issues or questions, contact the development team or refer to:
- [Google Cloud KMS Documentation](https://cloud.google.com/kms/docs)
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/index.html)
