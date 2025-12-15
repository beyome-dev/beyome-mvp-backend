#!/bin/bash

# Grant KMS Encrypt/Decrypt permissions to service account
# Service Account: recapp-storage-uploaded@gen-lang-client-0351606348.iam.gserviceaccount.com

gcloud kms keys add-iam-policy-binding phi-encryption-key \
  --keyring=recapp-hipaa-encryption-keys \
  --location=global \
  --member="serviceAccount:recapp-storage-uploaded@gen-lang-client-0351606348.iam.gserviceaccount.com" \
  --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --project=gen-lang-client-0351606348

echo ""
echo "✅ Permissions granted!"
echo ""
echo "Service account: recapp-storage-uploaded@gen-lang-client-0351606348.iam.gserviceaccount.com"
echo "Role: Cloud KMS CryptoKey Encrypter/Decrypter"
echo "Key: phi-encryption-key"
echo ""
echo "You can now test encryption with: node scripts/testEncryption.js"
