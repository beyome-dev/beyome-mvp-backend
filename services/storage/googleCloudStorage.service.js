const path = require('path');
const fsPromises = require('fs').promises;
const { Storage } = require('@google-cloud/storage');
const { randomUUID } = require('crypto');
const config = require('../../config');
const encryptionService = require('../encryption/encryption.service');
const keyManagementService = require('../encryption/keyManagement.service');
const crypto = require('crypto');

const storageConfig = config.googleCloudStorage || {};

if (!storageConfig.bucketName) {
  console.warn('[GCS] Bucket name not configured. Set GCS_BUCKET_NAME to enable cloud uploads.');
}

const storageClientOptions = {};

if (storageConfig.credentialsPath) {
  storageClientOptions.keyFilename = storageConfig.credentialsPath;
}

if (config.google?.projectID) {
  storageClientOptions.projectId = config.google.projectID;
}

const storage = new Storage(storageClientOptions);
const bucket = storageConfig.bucketName ? storage.bucket(storageConfig.bucketName) : null;

const getBasePath = () => {
  const basePath = storageConfig.basePath || 'recapp-mvp/recordings';
  return basePath.replace(/\\/g, '/').replace(/\/+$/, '');
};

const sanitizeFilename = (filename = '') => {
  return filename
    .replace(/[^a-z0-9.\-_]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
};

const buildObjectName = (recordingId, filename) => {
  const safeRecordingId = recordingId || randomUUID();
  const sanitized = sanitizeFilename(filename) || `audio_${Date.now()}.wav`;
  const uniqueSuffix = Date.now();
  return `${getBasePath()}/${safeRecordingId}/${uniqueSuffix}_${sanitized}`;
};

const getPublicUrl = (objectName) => {
  return `https://storage.googleapis.com/${storageConfig.bucketName}/${objectName}`;
};

const ensureBucket = () => {
  if (!bucket) {
    throw new Error('Google Cloud Storage bucket is not configured.');
  }
};

/**
 * Encrypt file before upload (if encryption is enabled)
 * Note: For HIPAA compliance, also configure CMEK (Customer-Managed Encryption Keys)
 * at the GCS bucket level via GCP Console or gcloud CLI:
 * gcloud storage buckets update gs://BUCKET_NAME --encryption-key=projects/PROJECT_ID/locations/LOCATION/keyRings/KEY_RING/cryptoKeys/KEY_NAME
 */
const encryptFileBeforeUpload = async (filePath) => {
  if (!config.encryption.enabled) {
    return { encrypted: false, path: filePath };
  }

  try {
    // Read file
    const fileBuffer = await fsPromises.readFile(filePath);
    
    // Encrypt file content
    // For large files, we use a streaming approach with a DEK
    const { encryptedKey, keyPath } = await keyManagementService.generateDataEncryptionKey();
    const dek = await keyManagementService.decryptDataEncryptionKey(encryptedKey, keyPath);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    
    let encrypted = cipher.update(fileBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();
    
    // Combine: encryptedKeyLength + encryptedKey + IV + tag + encrypted data
    const encryptedKeyBuffer = Buffer.from(encryptedKey);
    const encryptedKeyLength = Buffer.alloc(4);
    encryptedKeyLength.writeUInt32BE(encryptedKeyBuffer.length, 0);
    
    const encryptedBuffer = Buffer.concat([
      encryptedKeyLength,
      encryptedKeyBuffer,
      iv,
      tag,
      encrypted,
    ]);
    
    // Write encrypted file to temp location
    const tempPath = filePath + '.encrypted';
    await fsPromises.writeFile(tempPath, encryptedBuffer);
    
    return {
      encrypted: true,
      path: tempPath,
      originalPath: filePath,
      cleanup: async () => {
        try {
          await fsPromises.unlink(tempPath);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    };
  } catch (error) {
    console.error('[GCS] File encryption error:', error.message);
    // Return original file if encryption fails
    return { encrypted: false, path: filePath };
  }
};

/**
 * Decrypt file after download (if encryption is enabled)
 */
const decryptFileAfterDownload = async (filePath) => {
  if (!config.encryption.enabled) {
    return { decrypted: false, path: filePath };
  }

  try {
    // Read encrypted file
    const encryptedBuffer = await fsPromises.readFile(filePath);
    
    // Check if file is encrypted (has our encryption format)
    if (encryptedBuffer.length < 4 + 16 + 16) {
      // File is not encrypted or too small
      return { decrypted: false, path: filePath };
    }
    
    // Extract components
    let offset = 0;
    const encryptedKeyLength = encryptedBuffer.readUInt32BE(offset);
    offset += 4;
    
    if (encryptedBuffer.length < offset + encryptedKeyLength + 16 + 16) {
      // Invalid format, file might not be encrypted
      return { decrypted: false, path: filePath };
    }
    
    const encryptedKey = encryptedBuffer.slice(offset, offset + encryptedKeyLength);
    offset += encryptedKeyLength;
    
    const iv = encryptedBuffer.slice(offset, offset + 16);
    offset += 16;
    
    const tag = encryptedBuffer.slice(offset, offset + 16);
    offset += 16;
    
    const encrypted = encryptedBuffer.slice(offset);
    
    // Decrypt DEK using KMS
    const dek = await keyManagementService.decryptDataEncryptionKey(encryptedKey);
    
    // Decrypt file
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Write decrypted file
    const decryptedPath = filePath.replace('.encrypted', '') || filePath + '.decrypted';
    await fsPromises.writeFile(decryptedPath, decrypted);
    
    return {
      decrypted: true,
      path: decryptedPath,
      originalPath: filePath,
      cleanup: async () => {
        try {
          await fsPromises.unlink(decryptedPath);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    };
  } catch (error) {
    console.error('[GCS] File decryption error:', error.message);
    // Return original file if decryption fails
    return { decrypted: false, path: filePath };
  }
};

const uploadRecordingToBucket = async ({
  localPath,
  recordingId,
  filename,
  mimetype,
  makePublic = storageConfig.makePublic !== false
}) => {
  ensureBucket();
  const destination = buildObjectName(recordingId, filename);

  // Encrypt file before upload if encryption is enabled
  let encryptionResult = { encrypted: false, path: localPath, cleanup: async () => {} };
  if (config.encryption.enabled) {
    encryptionResult = await encryptFileBeforeUpload(localPath);
  }

  try {
    await bucket.upload(encryptionResult.path, {
      destination,
      resumable: false,
      metadata: {
        ...(mimetype ? { contentType: mimetype } : {}),
        // Add metadata to indicate encryption
        ...(encryptionResult.encrypted ? { 
          metadata: { 
            encrypted: 'true',
            encryptionAlgorithm: 'aes-256-gcm'
          } 
        } : {})
      }
    });

  const file = bucket.file(destination);
  let publicUrl;

  // Always use signed URLs to avoid issues with uniform bucket-level access
  // Signed URLs work regardless of bucket access settings and are more secure
  // For transcription services that support it, we'll use gs:// URIs directly
  try {
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      version: 'v4',
      expires: Date.now() + (storageConfig.signedUrlExpirationSeconds || 86400) * 1000
    });
    publicUrl = signedUrl;
  } catch (error) {
    console.warn('[GCS] Failed to generate signed URL:', error.message);
    // Use GCS URI as fallback - transcription services (like Google Speech) can use gs:// URIs directly
    // This works with uniform bucket-level access and doesn't require public access
    publicUrl = `gs://${storageConfig.bucketName}/${destination}`;
  }

    // Cleanup encrypted temp file
    if (encryptionResult.cleanup) {
      await encryptionResult.cleanup();
    }

    return {
      objectName: destination,
      publicUrl,
      gcsUri: `gs://${storageConfig.bucketName}/${destination}`,
      encrypted: encryptionResult.encrypted
    };
  } catch (error) {
    // Cleanup on error
    if (encryptionResult.cleanup) {
      await encryptionResult.cleanup();
    }
    throw error;
  }
};

/**
 * Upload a chunk file to GCS and make it temporarily public
 * Returns public URL that can be used for transcription services
 */
const uploadChunkToBucket = async ({
  localPath,
  recordingId,
  chunkIndex,
  filename,
  mimetype = 'audio/wav',
  makePublic = true
}) => {
  ensureBucket();
  
  // Build object name for chunk
  const safeRecordingId = recordingId || randomUUID();
  const sanitized = sanitizeFilename(filename) || `chunk_${chunkIndex}.wav`;
  const uniqueSuffix = Date.now();
  const destination = `${getBasePath()}/${safeRecordingId}/chunks/${uniqueSuffix}_${sanitized}`;

  try {
    console.log(`[GCS Chunk Upload] Uploading chunk ${chunkIndex} for recording ${recordingId}...`);
    
    await bucket.upload(localPath, {
      destination,
      resumable: false,
      metadata: {
        contentType: mimetype
      }
    });

    const file = bucket.file(destination);
    let publicUrl;

    if (makePublic) {
      // Try to make file temporarily public for transcription services
      try {
        publicUrl = await makeFilePublicIAM(destination);
        console.log(`[GCS Chunk Upload] Chunk ${chunkIndex} uploaded and made public: ${publicUrl.substring(0, 80)}...`);
      } catch (publicError) {
        console.warn(`[GCS Chunk Upload] Failed to make chunk ${chunkIndex} public:`, publicError.message);
        // Fallback to signed URL
        try {
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            version: 'v4',
            expires: Date.now() + 3600000 // 1 hour
          });
          publicUrl = signedUrl;
          console.log(`[GCS Chunk Upload] Using signed URL for chunk ${chunkIndex}`);
        } catch (signedError) {
          // If signed URL also fails, use gs:// URI which many transcription services support
          console.warn(`[GCS Chunk Upload] Failed to generate signed URL for chunk ${chunkIndex}:`, signedError.message);
          console.log(`[GCS Chunk Upload] Using gs:// URI for chunk ${chunkIndex} (some services support this directly)`);
          publicUrl = `gs://${storageConfig.bucketName}/${destination}`;
        }
      }
    } else {
      // Generate signed URL
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          version: 'v4',
          expires: Date.now() + 3600000 // 1 hour
        });
        publicUrl = signedUrl;
      } catch (signedError) {
        // If signed URL fails, use gs:// URI as fallback
        console.warn(`[GCS Chunk Upload] Failed to generate signed URL:`, signedError.message);
        console.log(`[GCS Chunk Upload] Using gs:// URI as fallback`);
        publicUrl = `gs://${storageConfig.bucketName}/${destination}`;
      }
    }

    return {
      objectName: destination,
      publicUrl,
      gcsUri: `gs://${storageConfig.bucketName}/${destination}`
    };
  } catch (error) {
    console.error(`[GCS Chunk Upload] Failed to upload chunk ${chunkIndex}:`, {
      message: error.message,
      stack: error.stack,
      recordingId,
      chunkIndex
    });
    throw error;
  }
};

const deleteRecordingFromBucket = async (objectName) => {
  if (!objectName) return;
  ensureBucket();
  try {
    await bucket.file(objectName).delete({ ignoreNotFound: true });
  } catch (error) {
    if (error.code !== 404) {
      throw error;
    }
  }
};

const downloadRecordingFromBucket = async (objectName, options = {}) => {
  ensureBucket();
  if (!objectName) {
    throw new Error('Object name is required to download from bucket');
  }

  const tempDir = options.tempDir || path.join(config.storagePath, 'cloud-temp');
  await fsPromises.mkdir(tempDir, { recursive: true });

  const extension = path.extname(objectName) || options.extension || '.wav';
  const tempFilename = `${options.prefix || 'recording'}_${Date.now()}${extension}`;
  const destinationPath = path.join(tempDir, tempFilename);

  // Download file
  await bucket.file(objectName).download({
    destination: destinationPath
  });

  // Check if file is encrypted and decrypt if needed
  let decryptionResult = { decrypted: false, path: destinationPath, cleanup: async () => {} };
  if (config.encryption.enabled) {
    // Check metadata to see if file is encrypted
    const [metadata] = await bucket.file(objectName).getMetadata();
    if (metadata.metadata && metadata.metadata.encrypted === 'true') {
      decryptionResult = await decryptFileAfterDownload(destinationPath);
      // Cleanup encrypted file after decryption
      if (decryptionResult.decrypted && decryptionResult.originalPath !== decryptionResult.path) {
        try {
          await fsPromises.unlink(decryptionResult.originalPath);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }

  const finalPath = decryptionResult.decrypted ? decryptionResult.path : destinationPath;
  const stats = await fsPromises.stat(finalPath);

  return {
    localPath: finalPath,
    size: stats.size,
    encrypted: decryptionResult.decrypted || false,
    cleanup: async () => {
      try {
        await fsPromises.unlink(finalPath);
        // Also cleanup decrypted temp file if it exists
        if (decryptionResult.cleanup) {
          await decryptionResult.cleanup();
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[GCS] Failed to delete temp file:', err.message);
        }
      }
    }
  };
};

const ensureLocalRecordingFile = async ({
  preferredPath,
  audioKey,
  filename,
  tempDir
}) => {
  if (preferredPath) {
    try {
      await fsPromises.access(preferredPath);
      const stats = await fsPromises.stat(preferredPath);
      return {
        localPath: preferredPath,
        size: stats.size,
        cleanup: async () => {}
      };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[GCS] Error accessing local file:', err.message);
      }
    }
  }

  if (!audioKey) {
    throw new Error('Audio key missing; cannot download recording from cloud storage');
  }

  return downloadRecordingFromBucket(audioKey, {
    tempDir,
    prefix: path.parse(filename || 'recording').name || 'recording',
    extension: path.extname(filename) || undefined
  });
};

const generateSignedReadUrl = async (objectName, expiresInSeconds = 3600) => {
  ensureBucket();
  const [url] = await bucket.file(objectName).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInSeconds * 1000
  });
  return url;
};

/**
 * Makes a file temporarily public using IAM policy (works with uniform bucket-level access)
 * @param {string} objectName - Name of the file in the bucket
 * @returns {Promise<string>} Public HTTPS URL
 */
const makeFilePublicIAM = async (objectName) => {
  ensureBucket();
  const file = bucket.file(objectName);
  
  try {
    // Check if IAM API is available
    if (!file.iam || typeof file.iam.getPolicy !== 'function') {
      throw new Error('IAM API not available - credentials may not be properly configured');
    }
    
    // Get current IAM policy using the correct API
    const [policy] = await file.iam.getPolicy();
    
    // Check if allUsers already has access
    const hasPublicAccess = policy.bindings.some(
      binding => binding.role === 'roles/storage.objectViewer' && 
                 binding.members.includes('allUsers')
    );
    
    if (!hasPublicAccess) {
      // Add public read binding
      policy.bindings.push({
        role: 'roles/storage.objectViewer',
        members: ['allUsers']
      });
      
      // Set the updated policy using the correct API
      await file.iam.setPolicy(policy);
      console.log(`[GCS] Made file public via IAM: ${objectName}`);
    }
    
    const publicUrl = getPublicUrl(objectName);
    return publicUrl;
  } catch (error) {
    console.error(`[GCS] Failed to make file public: ${error.message}`);
    throw error;
  }
};

/**
 * Revokes public access from a file using IAM policy
 * @param {string} objectName - Name of the file in the bucket
 */
const makeFilePrivateIAM = async (objectName) => {
  ensureBucket();
  const file = bucket.file(objectName);
  
  try {
    // Check if IAM API is available
    if (!file.iam || typeof file.iam.getPolicy !== 'function') {
      console.warn(`[GCS] IAM API not available, skipping revoke for: ${objectName}`);
      return;
    }
    
    // Get current IAM policy using the correct API
    const [policy] = await file.iam.getPolicy();
    
    // Remove allUsers bindings
    policy.bindings = policy.bindings.filter(binding => 
      !binding.members.includes('allUsers')
    );
    
    // Set the updated policy using the correct API
    await file.iam.setPolicy(policy);
    console.log(`[GCS] Revoked public access for: ${objectName}`);
  } catch (error) {
    console.error(`[GCS] Failed to revoke public access: ${error.message}`);
    // Don't throw - this is cleanup, we don't want to fail the main operation
  }
};

/**
 * Complete workflow: make public, execute callback, then revoke
 * @param {string} objectName - Name of the file in the bucket
 * @param {Function} callback - Async function that performs operation with public URL
 * @returns {Promise<any>} Result from callback
 */
const withTemporaryPublicAccess = async (objectName, callback) => {
  let madePublic = false;
  let publicUrl;
  
  try {
    // Try to make file public via IAM first
    try {
      publicUrl = await makeFilePublicIAM(objectName);
      madePublic = true;
      console.log(`[GCS] Using public URL via IAM for: ${objectName}`);
    } catch (iamError) {
      // IAM not available, try signed URL as fallback
      console.warn(`[GCS] IAM not available, trying signed URL for: ${objectName}`);
      try {
        publicUrl = await generateSignedReadUrl(objectName, 3600); // 1 hour expiration
        console.log(`[GCS] Using signed URL for: ${objectName}`);
      } catch (signedError) {
        // Both IAM and signed URLs failed - this means credentials aren't properly configured
        const error = new Error(
          `Cannot generate accessible URL for file. IAM failed: ${iamError.message}. Signed URL failed: ${signedError.message}. ` +
          `Please ensure GCS credentials are properly configured with GOOGLE_APPLICATION_CREDENTIALS or GCS_KEY_FILE.`
        );
        error.iamError = iamError.message;
        error.signedError = signedError.message;
        throw error;
      }
    }
    
    // Execute callback with the accessible URL
    const result = await callback(publicUrl);
    
    return result;
  } finally {
    // Always revoke access if we made it public via IAM, even if callback fails
    if (madePublic) {
      await makeFilePrivateIAM(objectName);
    }
  }
};

module.exports = {
  uploadRecordingToBucket,
  uploadChunkToBucket,
  deleteRecordingFromBucket,
  downloadRecordingFromBucket,
  ensureLocalRecordingFile,
  generateSignedReadUrl,
  getPublicUrl,
  makeFilePublicIAM,
  makeFilePrivateIAM,
  withTemporaryPublicAccess
};

