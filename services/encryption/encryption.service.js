const crypto = require('crypto');
const config = require('../../config');
const keyManagementService = require('./keyManagement.service');
let auditLogService;
// Lazy load audit service to avoid circular dependencies
try {
  auditLogService = require('../audit/auditLog.service');
} catch (e) {
  // Audit service may not be available during initialization
  auditLogService = {
    logEncryption: async () => {},
    logDecryption: async () => {}
  };
}

class EncryptionService {
  constructor() {
    this.algorithm = config.encryption.algorithm || 'aes-256-gcm';
    this.ivLength = 16; // 128 bits for GCM
    this.tagLength = 16; // 128 bits for GCM tag
    this.saltLength = 32; // 256 bits for salt
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled() {
    return config.encryption.enabled === true;
  }

  /**
   * Generate a random IV
   */
  generateIV() {
    return crypto.randomBytes(this.ivLength);
  }

  /**
   * Generate a random salt
   */
  generateSalt() {
    return crypto.randomBytes(this.saltLength);
  }

  /**
   * Derive a key from a password using PBKDF2 (for local key derivation if needed)
   */
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  /**
   * Encrypt data using AES-256-GCM with KMS-managed keys
   */
  async encrypt(plaintext, context = {}) {
    if (!this.isEnabled()) {
      return plaintext; // Return as-is if encryption disabled
    }

    if (!plaintext || plaintext === '') {
      return plaintext;
    }

    // Convert to string if needed
    const data = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

    try {
      // Generate DEK and encrypt with KMS (envelope encryption)
      const { encryptedKey, keyPath } = await keyManagementService.generateDataEncryptionKey();
      
      // Decrypt DEK to use for encryption (KMS handles this securely)
      const dek = await keyManagementService.decryptDataEncryptionKey(encryptedKey, keyPath);

      // Generate IV
      const iv = this.generateIV();

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, dek, iv);

      // Add additional authenticated data (AAD) if provided
      if (context.aad) {
        cipher.setAAD(Buffer.from(context.aad));
      }

      // Encrypt
      let encrypted = cipher.update(data, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine: encryptedKey (for KMS) + IV + tag + encrypted data
      // Format: [encryptedKeyLength(4 bytes)][encryptedKey][IV(16 bytes)][tag(16 bytes)][encryptedData]
      const encryptedKeyBuffer = Buffer.from(encryptedKey);
      const encryptedKeyLength = Buffer.alloc(4);
      encryptedKeyLength.writeUInt32BE(encryptedKeyBuffer.length, 0);

      const result = Buffer.concat([
        encryptedKeyLength,
        encryptedKeyBuffer,
        iv,
        tag,
        encrypted,
      ]);

      // Log encryption operation
      await auditLogService.logEncryption({
        operation: 'encrypt',
        keyPath: keyPath,
        dataLength: data.length,
        context: context,
      });

      // Return as base64 for storage
      return result.toString('base64');
    } catch (error) {
      console.error('[Encryption] Failed to encrypt data:', error.message);
      // Don't expose key details in error
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM with KMS-managed keys
   */
  async decrypt(encryptedData, context = {}) {
    if (!this.isEnabled()) {
      return encryptedData; // Return as-is if encryption disabled
    }

    if (!encryptedData || encryptedData === '') {
      return encryptedData;
    }

    // Check if data is already decrypted (not base64 or doesn't match expected format)
    if (typeof encryptedData !== 'string' || !encryptedData.match(/^[A-Za-z0-9+/=]+$/)) {
      // Might be already decrypted or invalid format
      return encryptedData;
    }

    try {
      // Decode from base64
      const dataBuffer = Buffer.from(encryptedData, 'base64');

      // Extract components
      // Format: [encryptedKeyLength(4 bytes)][encryptedKey][IV(16 bytes)][tag(16 bytes)][encryptedData]
      if (dataBuffer.length < 4 + this.ivLength + this.tagLength) {
        // Invalid format, might be unencrypted data
        return encryptedData;
      }

      let offset = 0;
      const encryptedKeyLength = dataBuffer.readUInt32BE(offset);
      offset += 4;

      if (dataBuffer.length < offset + encryptedKeyLength + this.ivLength + this.tagLength) {
        // Invalid format
        return encryptedData;
      }

      const encryptedKey = dataBuffer.slice(offset, offset + encryptedKeyLength);
      offset += encryptedKeyLength;

      const iv = dataBuffer.slice(offset, offset + this.ivLength);
      offset += this.ivLength;

      const tag = dataBuffer.slice(offset, offset + this.tagLength);
      offset += this.tagLength;

      const encrypted = dataBuffer.slice(offset);

      // Decrypt DEK using KMS
      const dek = await keyManagementService.decryptDataEncryptionKey(encryptedKey);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, dek, iv);
      decipher.setAuthTag(tag);

      // Add AAD if provided
      if (context.aad) {
        decipher.setAAD(Buffer.from(context.aad));
      }

      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Log decryption operation
      await auditLogService.logDecryption({
        operation: 'decrypt',
        dataLength: encrypted.length,
        context: context,
      });

      // Return as string
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[Encryption] Failed to decrypt data:', error.message);
      // Don't expose key details in error
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt an object's PHI fields
   */
  async encryptObject(obj, phiFields, context = {}) {
    if (!this.isEnabled() || !obj) {
      return obj;
    }

    const encrypted = { ...obj };

    for (const field of phiFields) {
      if (encrypted[field] !== undefined && encrypted[field] !== null && encrypted[field] !== '') {
        try {
          encrypted[field] = await this.encrypt(encrypted[field], {
            ...context,
            field: field,
          });
        } catch (error) {
          console.error(`[Encryption] Failed to encrypt field ${field}:`, error.message);
          // Continue with other fields even if one fails
        }
      }
    }

    return encrypted;
  }

  /**
   * Decrypt an object's PHI fields
   */
  async decryptObject(obj, phiFields, context = {}) {
    if (!this.isEnabled() || !obj) {
      return obj;
    }

    const decrypted = { ...obj };

    for (const field of phiFields) {
      if (decrypted[field] !== undefined && decrypted[field] !== null && decrypted[field] !== '') {
        try {
          decrypted[field] = await this.decrypt(decrypted[field], {
            ...context,
            field: field,
          });
        } catch (error) {
          console.error(`[Encryption] Failed to decrypt field ${field}:`, error.message);
          // Continue with other fields even if one fails
        }
      }
    }

    return decrypted;
  }

  /**
   * Encrypt nested object fields (for complex structures like address, metadata)
   */
  async encryptNestedObject(obj, path = '') {
    if (!this.isEnabled() || !obj) {
      return obj;
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item, index) => 
        this.encryptNestedObject(item, `${path}[${index}]`)
      ));
    }

    const encrypted = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (value !== null && typeof value === 'object') {
        encrypted[key] = await this.encryptNestedObject(value, currentPath);
      } else if (typeof value === 'string' && value !== '') {
        try {
          encrypted[key] = await this.encrypt(value, { field: currentPath });
        } catch (error) {
          console.error(`[Encryption] Failed to encrypt nested field ${currentPath}:`, error.message);
          encrypted[key] = value; // Keep original on error
        }
      } else {
        encrypted[key] = value;
      }
    }

    return encrypted;
  }

  /**
   * Decrypt nested object fields
   */
  async decryptNestedObject(obj, path = '') {
    if (!this.isEnabled() || !obj) {
      return obj;
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item, index) => 
        this.decryptNestedObject(item, `${path}[${index}]`)
      ));
    }

    const decrypted = {};
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (value !== null && typeof value === 'object') {
        decrypted[key] = await this.decryptNestedObject(value, currentPath);
      } else if (typeof value === 'string' && value !== '') {
        try {
          decrypted[key] = await this.decrypt(value, { field: currentPath });
        } catch (error) {
          console.error(`[Encryption] Failed to decrypt nested field ${currentPath}:`, error.message);
          decrypted[key] = value; // Keep original on error
        }
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }
}

// Singleton instance
const encryptionService = new EncryptionService();

module.exports = encryptionService;
