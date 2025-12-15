const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('../../config');

// Audit Log Schema
const auditLogSchema = new Schema({
  eventType: {
    type: String,
    required: true,
    enum: ['encrypt', 'decrypt', 'phi_access', 'key_access', 'key_rotation', 'migration'],
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  resourceType: {
    type: String,
    enum: ['Client', 'Recording', 'Note', 'Session', 'Key', 'Migration'],
    index: true
  },
  resourceId: {
    type: Schema.Types.ObjectId,
    index: true
  },
  field: String, // Which field was accessed/encrypted/decrypted
  keyPath: String, // KMS key path used
  operation: {
    type: String,
    enum: ['encrypt', 'decrypt', 'read', 'write', 'delete', 'rotate']
  },
  success: {
    type: Boolean,
    default: true,
    index: true
  },
  error: {
    message: String,
    code: String
  },
  metadata: {
    dataLength: Number,
    context: Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    requestId: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 }); // For time-based queries

// TTL index to auto-delete logs after retention period (default 7 years for HIPAA)
const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS, 10) || 2555; // 7 years
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

class AuditLogService {
  /**
   * Log an encryption operation
   */
  async logEncryption(data) {
    if (!config.encryption.enabled) {
      return;
    }

    try {
      await AuditLog.create({
        eventType: 'encrypt',
        operation: 'encrypt',
        keyPath: data.keyPath,
        field: data.context?.field,
        resourceType: data.context?.resourceType,
        resourceId: data.context?.resourceId,
        userId: data.context?.userId,
        metadata: {
          dataLength: data.dataLength,
          context: data.context,
          ipAddress: data.context?.ipAddress,
          userAgent: data.context?.userAgent,
          requestId: data.context?.requestId,
        },
        success: true,
        timestamp: new Date(),
      });
    } catch (error) {
      // Don't throw - audit logging failures shouldn't break the application
      console.error('[Audit] Failed to log encryption:', error.message);
    }
  }

  /**
   * Log a decryption operation
   */
  async logDecryption(data) {
    if (!config.encryption.enabled) {
      return;
    }

    try {
      await AuditLog.create({
        eventType: 'decrypt',
        operation: 'decrypt',
        field: data.context?.field,
        resourceType: data.context?.resourceType,
        resourceId: data.context?.resourceId,
        userId: data.context?.userId,
        metadata: {
          dataLength: data.dataLength,
          context: data.context,
          ipAddress: data.context?.ipAddress,
          userAgent: data.context?.userAgent,
          requestId: data.context?.requestId,
        },
        success: true,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[Audit] Failed to log decryption:', error.message);
    }
  }

  /**
   * Log PHI data access
   */
  async logPHIAccess(data) {
    try {
      await AuditLog.create({
        eventType: 'phi_access',
        operation: data.operation || 'read',
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        userId: data.userId,
        field: data.field,
        metadata: {
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          requestId: data.requestId,
          endpoint: data.endpoint,
          method: data.method,
        },
        success: data.success !== false,
        error: data.error,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[Audit] Failed to log PHI access:', error.message);
    }
  }

  /**
   * Log key access
   */
  async logKeyAccess(data) {
    if (!config.encryption.enabled) {
      return;
    }

    try {
      await AuditLog.create({
        eventType: 'key_access',
        operation: data.operation || 'read',
        keyPath: data.keyPath,
        userId: data.userId,
        metadata: {
          keyVersion: data.keyVersion,
          operation: data.operation,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
        success: data.success !== false,
        error: data.error,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[Audit] Failed to log key access:', error.message);
    }
  }

  /**
   * Log key rotation
   */
  async logKeyRotation(data) {
    if (!config.encryption.enabled) {
      return;
    }

    try {
      await AuditLog.create({
        eventType: 'key_rotation',
        operation: 'rotate',
        keyPath: data.keyPath,
        userId: data.userId,
        metadata: {
          oldKeyVersion: data.oldKeyVersion,
          newKeyVersion: data.newKeyVersion,
        },
        success: data.success !== false,
        error: data.error,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[Audit] Failed to log key rotation:', error.message);
    }
  }

  /**
   * Log migration operation
   */
  async logMigration(data) {
    try {
      await AuditLog.create({
        eventType: 'migration',
        operation: data.operation || 'encrypt',
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        userId: data.userId,
        metadata: {
          batchId: data.batchId,
          totalRecords: data.totalRecords,
          processedRecords: data.processedRecords,
          failedRecords: data.failedRecords,
        },
        success: data.success !== false,
        error: data.error,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[Audit] Failed to log migration:', error.message);
    }
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}) {
    try {
      const query = {};

      if (filters.eventType) {
        query.eventType = filters.eventType;
      }
      if (filters.userId) {
        query.userId = filters.userId;
      }
      if (filters.resourceType) {
        query.resourceType = filters.resourceType;
      }
      if (filters.resourceId) {
        query.resourceId = filters.resourceId;
      }
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) {
          query.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.timestamp.$lte = new Date(filters.endDate);
        }
      }
      if (filters.success !== undefined) {
        query.success = filters.success;
      }

      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .limit(filters.limit || 100)
        .skip(filters.skip || 0)
        .populate('userId', 'firstName lastName email')
        .lean();

      return logs;
    } catch (error) {
      console.error('[Audit] Failed to query logs:', error.message);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(filters = {}) {
    try {
      const matchStage = {};

      if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) {
          matchStage.timestamp.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          matchStage.timestamp.$lte = new Date(filters.endDate);
        }
      }

      const stats = await AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            successCount: {
              $sum: { $cond: ['$success', 1, 0] }
            },
            failureCount: {
              $sum: { $cond: ['$success', 0, 1] }
            }
          }
        }
      ]);

      return stats;
    } catch (error) {
      console.error('[Audit] Failed to get statistics:', error.message);
      throw error;
    }
  }
}

// Singleton instance
const auditLogService = new AuditLogService();

module.exports = auditLogService;
