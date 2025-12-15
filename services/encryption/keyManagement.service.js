const { KeyManagementServiceClient } = require('@google-cloud/kms');
const config = require('../../config');
const crypto = require('crypto');

class KeyManagementService {
  constructor() {
    this.client = null;
    this.keyCache = new Map();
    this.keyCacheExpiry = new Map();
    this.cacheTimeout = 3600000; // 1 hour cache
    this.initialized = false;
  }

  /**
   * Initialize the KMS client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!config.encryption.enabled) {
      console.warn('[KMS] Encryption is disabled in configuration');
      this.initialized = true;
      return;
    }

    try {
      const clientOptions = {};
      if (config.kms.credentialsPath) {
        clientOptions.keyFilename = config.kms.credentialsPath;
      }
      if (config.kms.projectId) {
        clientOptions.projectId = config.kms.projectId;
      }

      this.client = new KeyManagementServiceClient(clientOptions);
      this.initialized = true;
      console.log('[KMS] Key Management Service initialized');
    } catch (error) {
      console.error('[KMS] Failed to initialize:', error.message);
      throw new Error(`KMS initialization failed: ${error.message}`);
    }
  }

  /**
   * Get the crypto key path (for encrypt/decrypt operations)
   * For symmetric keys, we use the crypto key path, not the version path
   */
  getCryptoKeyPath() {
    return this.client.cryptoKeyPath(
      config.kms.projectId,
      config.kms.location,
      config.kms.keyRing,
      config.kms.keyName
    );
  }

  /**
   * Get the crypto key version path (for version-specific operations)
   */
  getKeyVersionPath(keyVersion = null) {
    const version = keyVersion || config.kms.keyVersion;
    return this.client.cryptoKeyVersionPath(
      config.kms.projectId,
      config.kms.location,
      config.kms.keyRing,
      config.kms.keyName,
      version
    );
  }

  /**
   * Get the encryption key from KMS (cached)
   */
  async getEncryptionKey(keyVersion = null) {
    if (!config.encryption.enabled) {
      throw new Error('Encryption is disabled');
    }

    await this.initialize();

    const cacheKey = keyVersion || config.kms.keyVersion;
    const now = Date.now();

    // Check cache
    if (this.keyCache.has(cacheKey)) {
      const expiry = this.keyCacheExpiry.get(cacheKey);
      if (expiry && now < expiry) {
        return this.keyCache.get(cacheKey);
      }
      // Cache expired, remove it
      this.keyCache.delete(cacheKey);
      this.keyCacheExpiry.delete(cacheKey);
    }

    try {
      // For symmetric keys, getPublicKey is not applicable
      // We'll use the crypto key path directly for envelope encryption
      const keyPath = this.getCryptoKeyPath();

      // For symmetric keys, we don't get a public key
      // We'll use the key path for envelope encryption
      // Cache the key path
      this.keyCache.set(cacheKey, keyPath);
      this.keyCacheExpiry.set(cacheKey, now + this.cacheTimeout);

      return keyPath;
    } catch (error) {
      console.error('[KMS] Failed to get encryption key:', error.message);
      throw new Error(`Failed to retrieve encryption key: ${error.message}`);
    }
  }

  /**
   * Generate a data encryption key (DEK) and encrypt it with KMS (envelope encryption)
   */
  async generateDataEncryptionKey() {
    if (!config.encryption.enabled) {
      throw new Error('Encryption is disabled');
    }

    await this.initialize();

    // Generate a random 32-byte key for AES-256
    const dek = crypto.randomBytes(32);

    try {
      // For symmetric keys, use crypto key path (not version path)
      const keyPath = this.getCryptoKeyPath();
      const [encryptedDek] = await this.client.encrypt({
        name: keyPath,
        plaintext: dek,
      });

      return {
        encryptedKey: encryptedDek.ciphertext,
        keyPath: keyPath,
      };
    } catch (error) {
      console.error('[KMS] Failed to encrypt DEK:', error.message);
      throw new Error(`Failed to encrypt data encryption key: ${error.message}`);
    }
  }

  /**
   * Decrypt a data encryption key (DEK) using KMS
   */
  async decryptDataEncryptionKey(encryptedDek, keyPath = null) {
    if (!config.encryption.enabled) {
      throw new Error('Encryption is disabled');
    }

    await this.initialize();

    try {
      // For symmetric keys, use crypto key path (not version path)
      const path = keyPath || this.getCryptoKeyPath();
      const [decryptedDek] = await this.client.decrypt({
        name: path,
        ciphertext: encryptedDek,
      });

      return decryptedDek.plaintext;
    } catch (error) {
      console.error('[KMS] Failed to decrypt DEK:', error.message);
      throw new Error(`Failed to decrypt data encryption key: ${error.message}`);
    }
  }

  /**
   * Rotate encryption key (creates new version)
   */
  async rotateKey() {
    if (!config.encryption.enabled) {
      throw new Error('Encryption is disabled');
    }

    await this.initialize();

    try {
      const cryptoKeyPath = this.getCryptoKeyPath();

      const [operation] = await this.client.updateCryptoKeyPrimaryVersion({
        name: cryptoKeyPath,
        cryptoKeyVersionId: await this.getLatestKeyVersion(),
      });

      // Clear cache to force refresh
      this.keyCache.clear();
      this.keyCacheExpiry.clear();

      console.log('[KMS] Key rotation initiated');
      return operation;
    } catch (error) {
      console.error('[KMS] Failed to rotate key:', error.message);
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Get the latest key version
   */
  async getLatestKeyVersion() {
    await this.initialize();

    try {
      const cryptoKeyPath = this.getCryptoKeyPath();

      const [versions] = await this.client.listCryptoKeyVersions({
        parent: cryptoKeyPath,
        filter: 'state:ENABLED',
      });

      if (versions.length === 0) {
        throw new Error('No enabled key versions found');
      }

      // Sort by creation time and get the latest
      const sorted = versions.sort((a, b) => {
        return new Date(b.createTime) - new Date(a.createTime);
      });

      const versionId = sorted[0].name.split('/').pop();
      return versionId;
    } catch (error) {
      console.error('[KMS] Failed to get latest key version:', error.message);
      throw new Error(`Failed to get latest key version: ${error.message}`);
    }
  }

  /**
   * Clear key cache (for testing or manual refresh)
   */
  clearCache() {
    this.keyCache.clear();
    this.keyCacheExpiry.clear();
  }
}

// Singleton instance
const keyManagementService = new KeyManagementService();

module.exports = keyManagementService;
