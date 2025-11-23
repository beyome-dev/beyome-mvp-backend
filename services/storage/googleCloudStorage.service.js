const path = require('path');
const fsPromises = require('fs').promises;
const { Storage } = require('@google-cloud/storage');
const { randomUUID } = require('crypto');
const config = require('../../config');

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

const uploadRecordingToBucket = async ({
  localPath,
  recordingId,
  filename,
  mimetype,
  makePublic = storageConfig.makePublic !== false
}) => {
  ensureBucket();
  const destination = buildObjectName(recordingId, filename);

  await bucket.upload(localPath, {
    destination,
    resumable: false,
    metadata: mimetype
      ? {
          contentType: mimetype
        }
      : undefined
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

  return {
    objectName: destination,
    publicUrl,
    gcsUri: `gs://${storageConfig.bucketName}/${destination}`
  };
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

  await bucket.file(objectName).download({
    destination: destinationPath
  });

  const stats = await fsPromises.stat(destinationPath);

  return {
    localPath: destinationPath,
    size: stats.size,
    cleanup: async () => {
      try {
        await fsPromises.unlink(destinationPath);
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
  
  try {
    // Make file public
    const publicUrl = await makeFilePublicIAM(objectName);
    madePublic = true;
    
    // Execute callback with the public URL
    const result = await callback(publicUrl);
    
    return result;
  } finally {
    // Always revoke access, even if callback fails
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

