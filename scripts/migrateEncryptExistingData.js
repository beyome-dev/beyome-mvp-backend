/**
 * Migration Script: Encrypt Existing PHI Data
 * 
 * This script encrypts existing unencrypted PHI data in the database.
 * It processes data in batches to avoid memory issues and allows for rollback.
 * 
 * Usage:
 *   node scripts/migrateEncryptExistingData.js [--dry-run] [--model=Client|Recording|Note|Session] [--batch-size=100] [--rollback]
 * 
 * Options:
 *   --dry-run: Show what would be encrypted without making changes
 *   --model: Specific model to migrate (default: all)
 *   --batch-size: Number of records to process per batch (default: 100)
 *   --rollback: Rollback the last migration (if backup exists)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');
const { Client, Recording, Note, Session } = require('../models');
const encryptionService = require('../services/encryption/encryption.service');
let auditLogService;
try {
  auditLogService = require('../services/audit/auditLog.service');
} catch (e) {
  // Audit service may not be available
  auditLogService = {
    logMigration: async () => {}
  };
}
const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const rollback = args.includes('--rollback');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 100;
const modelArg = args.find(arg => arg.startsWith('--model='));
const targetModel = modelArg ? modelArg.split('=')[1] : 'all';

const BACKUP_DIR = path.join(__dirname, '../migration-backups');

// Helper to check if a string is encrypted (base64 format check)
const isEncrypted = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  // Encrypted data is base64 encoded and typically longer
  // This is a heuristic - encrypted data will be longer than original
  try {
    // Try to decode as base64
    const decoded = Buffer.from(value, 'base64');
    // If it decodes and is significantly longer than original, likely encrypted
    // For now, we'll check if it's valid base64 and has minimum length
    return /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 50;
  } catch (e) {
    return false;
  }
};

// Create backup of data before migration
const createBackup = async (modelName, records) => {
  const backupPath = path.join(BACKUP_DIR, `${modelName}_${Date.now()}.json`);
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(records, null, 2));
  return backupPath;
};

// Restore from backup
const restoreBackup = async (backupPath) => {
  const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const Model = mongoose.model(backupData[0].__model || 'Unknown');
  
  for (const record of backupData) {
    await Model.findByIdAndUpdate(record._id, record, { overwrite: true });
  }
  
  console.log(`[Migration] Restored ${backupData.length} records from backup`);
};

// Migrate Client model
const migrateClients = async (dryRun = false) => {
  console.log('[Migration] Starting Client model migration...');
  
  const PHI_FIELDS = [
    'firstName', 'lastName', 'nickName', 'email', 'phone', 'dateOfBirth',
    'insuranceProvider', 'insuranceNumber', 'diagnosis', 'summary', 'treatmentPlan'
  ];
  
  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;
  const backupRecords = [];
  
  const query = {};
  const clients = await Client.find(query).lean();
  
  console.log(`[Migration] Found ${clients.length} clients to process`);
  
  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    
    for (const client of batch) {
      try {
        let needsEncryption = false;
        const updates = {};
        
        // Check and encrypt simple PHI fields
        for (const field of PHI_FIELDS) {
          if (client[field] !== undefined && client[field] !== null && client[field] !== '') {
            if (field === 'dateOfBirth' && client[field] instanceof Date) {
              const dateStr = client[field].toISOString();
              if (!isEncrypted(dateStr)) {
                needsEncryption = true;
                if (!dryRun) {
                  updates[field] = await encryptionService.encrypt(dateStr, {
                    resourceType: 'Client',
                    resourceId: client._id,
                    field: field,
                  });
                }
              }
            } else if (typeof client[field] === 'string' && !isEncrypted(client[field])) {
              needsEncryption = true;
              if (!dryRun) {
                updates[field] = await encryptionService.encrypt(client[field], {
                  resourceType: 'Client',
                  resourceId: client._id,
                  field: field,
                });
              }
            }
          }
        }
        
        // Encrypt nested objects
        if (client.address && typeof client.address === 'object') {
          const addressStr = JSON.stringify(client.address);
          if (!isEncrypted(addressStr)) {
            needsEncryption = true;
            if (!dryRun) {
              updates.address = await encryptionService.encryptNestedObject(client.address);
            }
          }
        }
        
        if (client.emergencyContact && typeof client.emergencyContact === 'object') {
          const contactStr = JSON.stringify(client.emergencyContact);
          if (!isEncrypted(contactStr)) {
            needsEncryption = true;
            if (!dryRun) {
              updates.emergencyContact = await encryptionService.encryptNestedObject(client.emergencyContact);
            }
          }
        }
        
        if (client.metadata && typeof client.metadata === 'object') {
          const metadataStr = JSON.stringify(client.metadata);
          if (!isEncrypted(metadataStr)) {
            needsEncryption = true;
            if (!dryRun) {
              updates.metadata = await encryptionService.encryptNestedObject(client.metadata);
            }
          }
        }
        
        if (needsEncryption) {
          if (dryRun) {
            console.log(`[Migration] Would encrypt Client ${client._id}`);
            encrypted++;
          } else {
            // Create backup
            backupRecords.push({ ...client, __model: 'Client' });
            
            // Update with encrypted data
            await Client.findByIdAndUpdate(client._id, updates);
            encrypted++;
            
            await auditLogService.logMigration({
              operation: 'encrypt',
              resourceType: 'Client',
              resourceId: client._id,
              success: true,
            });
          }
        } else {
          skipped++;
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`[Migration] Processed ${processed}/${clients.length} clients...`);
        }
      } catch (error) {
        console.error(`[Migration] Error processing Client ${client._id}:`, error.message);
        errors++;
      }
    }
  }
  
  if (!dryRun && backupRecords.length > 0) {
    const backupPath = await createBackup('Client', backupRecords);
    console.log(`[Migration] Created backup at: ${backupPath}`);
  }
  
  console.log(`[Migration] Client migration complete: ${processed} processed, ${encrypted} encrypted, ${skipped} skipped, ${errors} errors`);
  return { processed, encrypted, skipped, errors };
};

// Migrate Recording model
const migrateRecordings = async (dryRun = false) => {
  console.log('[Migration] Starting Recording model migration...');
  
  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;
  const backupRecords = [];
  
  const recordings = await Recording.find({}).lean();
  console.log(`[Migration] Found ${recordings.length} recordings to process`);
  
  for (let i = 0; i < recordings.length; i += batchSize) {
    const batch = recordings.slice(i, i + batchSize);
    
    for (const recording of batch) {
      try {
        let needsEncryption = false;
        const updates = {};
        
        // Encrypt transcriptionText
        if (recording.transcriptionText && typeof recording.transcriptionText === 'string' && !isEncrypted(recording.transcriptionText)) {
          needsEncryption = true;
          if (!dryRun) {
            updates.transcriptionText = await encryptionService.encrypt(recording.transcriptionText, {
              resourceType: 'Recording',
              resourceId: recording._id,
              field: 'transcriptionText',
            });
          }
        }
        
        // Encrypt summary
        if (recording.summary && typeof recording.summary === 'string' && !isEncrypted(recording.summary)) {
          needsEncryption = true;
          if (!dryRun) {
            updates.summary = await encryptionService.encrypt(recording.summary, {
              resourceType: 'Recording',
              resourceId: recording._id,
              field: 'summary',
            });
          }
        }
        
        // Encrypt transcriptionMetadata text fields
        if (recording.transcriptionMetadata && Array.isArray(recording.transcriptionMetadata.speakerLabels)) {
          for (const label of recording.transcriptionMetadata.speakerLabels) {
            if (label.text && typeof label.text === 'string' && !isEncrypted(label.text)) {
              needsEncryption = true;
              if (!dryRun) {
                label.text = await encryptionService.encrypt(label.text, {
                  resourceType: 'Recording',
                  resourceId: recording._id,
                  field: 'transcriptionMetadata.speakerLabels.text',
                });
              }
            }
          }
          if (needsEncryption && !dryRun) {
            updates['transcriptionMetadata.speakerLabels'] = recording.transcriptionMetadata.speakerLabels;
          }
        }
        
        if (recording.transcriptionMetadata && Array.isArray(recording.transcriptionMetadata.timestamps)) {
          for (const timestamp of recording.transcriptionMetadata.timestamps) {
            if (timestamp.text && typeof timestamp.text === 'string' && !isEncrypted(timestamp.text)) {
              needsEncryption = true;
              if (!dryRun) {
                timestamp.text = await encryptionService.encrypt(timestamp.text, {
                  resourceType: 'Recording',
                  resourceId: recording._id,
                  field: 'transcriptionMetadata.timestamps.text',
                });
              }
            }
          }
          if (needsEncryption && !dryRun) {
            updates['transcriptionMetadata.timestamps'] = recording.transcriptionMetadata.timestamps;
          }
        }
        
        if (needsEncryption) {
          if (dryRun) {
            console.log(`[Migration] Would encrypt Recording ${recording._id}`);
            encrypted++;
          } else {
            backupRecords.push({ ...recording, __model: 'Recording' });
            await Recording.findByIdAndUpdate(recording._id, updates);
            encrypted++;
            
            await auditLogService.logMigration({
              operation: 'encrypt',
              resourceType: 'Recording',
              resourceId: recording._id,
              success: true,
            });
          }
        } else {
          skipped++;
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`[Migration] Processed ${processed}/${recordings.length} recordings...`);
        }
      } catch (error) {
        console.error(`[Migration] Error processing Recording ${recording._id}:`, error.message);
        errors++;
      }
    }
  }
  
  if (!dryRun && backupRecords.length > 0) {
    const backupPath = await createBackup('Recording', backupRecords);
    console.log(`[Migration] Created backup at: ${backupPath}`);
  }
  
  console.log(`[Migration] Recording migration complete: ${processed} processed, ${encrypted} encrypted, ${skipped} skipped, ${errors} errors`);
  return { processed, encrypted, skipped, errors };
};

// Migrate Note model
const migrateNotes = async (dryRun = false) => {
  console.log('[Migration] Starting Note model migration...');
  
  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;
  const backupRecords = [];
  
  const notes = await Note.find({}).lean();
  console.log(`[Migration] Found ${notes.length} notes to process`);
  
  for (let i = 0; i < notes.length; i += batchSize) {
    const batch = notes.slice(i, i + batchSize);
    
    for (const note of batch) {
      try {
        let needsEncryption = false;
        const updates = {};
        
        // Encrypt formattedContent
        if (note.formattedContent && typeof note.formattedContent === 'string' && !isEncrypted(note.formattedContent)) {
          needsEncryption = true;
          if (!dryRun) {
            updates.formattedContent = await encryptionService.encrypt(note.formattedContent, {
              resourceType: 'Note',
              resourceId: note._id,
              field: 'formattedContent',
            });
          }
        }
        
        // Encrypt rawContent
        if (note.rawContent && typeof note.rawContent === 'string' && !isEncrypted(note.rawContent)) {
          needsEncryption = true;
          if (!dryRun) {
            updates.rawContent = await encryptionService.encrypt(note.rawContent, {
              resourceType: 'Note',
              resourceId: note._id,
              field: 'rawContent',
            });
          }
        }
        
        // Encrypt content object
        if (note.content && typeof note.content === 'object') {
          const contentStr = JSON.stringify(note.content);
          if (!isEncrypted(contentStr)) {
            needsEncryption = true;
            if (!dryRun) {
              updates.content = await encryptionService.encryptNestedObject(note.content);
            }
          }
        }
        
        // Encrypt originalGeneratedContent
        if (note.originalGeneratedContent && typeof note.originalGeneratedContent === 'object') {
          const originalStr = JSON.stringify(note.originalGeneratedContent);
          if (!isEncrypted(originalStr)) {
            needsEncryption = true;
            if (!dryRun) {
              updates.originalGeneratedContent = await encryptionService.encryptNestedObject(note.originalGeneratedContent);
            }
          }
        }
        
        if (needsEncryption) {
          if (dryRun) {
            console.log(`[Migration] Would encrypt Note ${note._id}`);
            encrypted++;
          } else {
            backupRecords.push({ ...note, __model: 'Note' });
            await Note.findByIdAndUpdate(note._id, updates);
            encrypted++;
            
            await auditLogService.logMigration({
              operation: 'encrypt',
              resourceType: 'Note',
              resourceId: note._id,
              success: true,
            });
          }
        } else {
          skipped++;
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`[Migration] Processed ${processed}/${notes.length} notes...`);
        }
      } catch (error) {
        console.error(`[Migration] Error processing Note ${note._id}:`, error.message);
        errors++;
      }
    }
  }
  
  if (!dryRun && backupRecords.length > 0) {
    const backupPath = await createBackup('Note', backupRecords);
    console.log(`[Migration] Created backup at: ${backupPath}`);
  }
  
  console.log(`[Migration] Note migration complete: ${processed} processed, ${encrypted} encrypted, ${skipped} skipped, ${errors} errors`);
  return { processed, encrypted, skipped, errors };
};

// Migrate Session model
const migrateSessions = async (dryRun = false) => {
  console.log('[Migration] Starting Session model migration...');
  
  let processed = 0;
  let encrypted = 0;
  let skipped = 0;
  let errors = 0;
  const backupRecords = [];
  
  const sessions = await Session.find({}).lean();
  console.log(`[Migration] Found ${sessions.length} sessions to process`);
  
  for (let i = 0; i < sessions.length; i += batchSize) {
    const batch = sessions.slice(i, i + batchSize);
    
    for (const session of batch) {
      try {
        let needsEncryption = false;
        const updates = {};
        
        // Encrypt metadata fields
        if (session.metadata && typeof session.metadata === 'object') {
          if (session.metadata.summary && typeof session.metadata.summary === 'string' && !isEncrypted(session.metadata.summary)) {
            needsEncryption = true;
            if (!dryRun) {
              updates['metadata.summary'] = await encryptionService.encrypt(session.metadata.summary, {
                resourceType: 'Session',
                resourceId: session._id,
                field: 'metadata.summary',
              });
            }
          }
          
          if (session.metadata.longSummary && typeof session.metadata.longSummary === 'string' && !isEncrypted(session.metadata.longSummary)) {
            needsEncryption = true;
            if (!dryRun) {
              updates['metadata.longSummary'] = await encryptionService.encrypt(session.metadata.longSummary, {
                resourceType: 'Session',
                resourceId: session._id,
                field: 'metadata.longSummary',
              });
            }
          }
          
          if (session.metadata.clientFeedback && typeof session.metadata.clientFeedback === 'string' && !isEncrypted(session.metadata.clientFeedback)) {
            needsEncryption = true;
            if (!dryRun) {
              updates['metadata.clientFeedback'] = await encryptionService.encrypt(session.metadata.clientFeedback, {
                resourceType: 'Session',
                resourceId: session._id,
                field: 'metadata.clientFeedback',
              });
            }
          }
          
          if (session.metadata.customFields && typeof session.metadata.customFields === 'object') {
            const customStr = JSON.stringify(session.metadata.customFields);
            if (!isEncrypted(customStr)) {
              needsEncryption = true;
              if (!dryRun) {
                updates['metadata.customFields'] = await encryptionService.encryptNestedObject(session.metadata.customFields);
              }
            }
          }
        }
        
        if (needsEncryption) {
          if (dryRun) {
            console.log(`[Migration] Would encrypt Session ${session._id}`);
            encrypted++;
          } else {
            backupRecords.push({ ...session, __model: 'Session' });
            await Session.findByIdAndUpdate(session._id, updates);
            encrypted++;
            
            await auditLogService.logMigration({
              operation: 'encrypt',
              resourceType: 'Session',
              resourceId: session._id,
              success: true,
            });
          }
        } else {
          skipped++;
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`[Migration] Processed ${processed}/${sessions.length} sessions...`);
        }
      } catch (error) {
        console.error(`[Migration] Error processing Session ${session._id}:`, error.message);
        errors++;
      }
    }
  }
  
  if (!dryRun && backupRecords.length > 0) {
    const backupPath = await createBackup('Session', backupRecords);
    console.log(`[Migration] Created backup at: ${backupPath}`);
  }
  
  console.log(`[Migration] Session migration complete: ${processed} processed, ${encrypted} encrypted, ${skipped} skipped, ${errors} errors`);
  return { processed, encrypted, skipped, errors };
};

// Main migration function
const runMigration = async () => {
  if (rollback) {
    // Find latest backup and restore
    try {
      const files = await fs.readdir(BACKUP_DIR);
      const backupFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
      if (backupFiles.length === 0) {
        console.error('[Migration] No backup files found');
        process.exit(1);
      }
      const latestBackup = path.join(BACKUP_DIR, backupFiles[0]);
      console.log(`[Migration] Restoring from backup: ${latestBackup}`);
      await restoreBackup(latestBackup);
      console.log('[Migration] Rollback complete');
      process.exit(0);
    } catch (error) {
      console.error('[Migration] Rollback failed:', error.message);
      process.exit(1);
    }
  }
  
  if (!config.encryption.enabled) {
    console.error('[Migration] Encryption is not enabled. Set ENCRYPTION_ENABLED=true in .env');
    process.exit(1);
  }
  
  console.log(`[Migration] Starting migration (dry-run: ${isDryRun}, batch-size: ${batchSize}, model: ${targetModel})`);
  
  try {
    // Connect to database
    await mongoose.connect(config.mongo.url, {
      dbName: config.mongo.dbName,
    });
    console.log('[Migration] Connected to database');
    
    const results = {};
    
    // Run migrations based on target model
    if (targetModel === 'all' || targetModel === 'Client') {
      results.Client = await migrateClients(isDryRun);
    }
    
    if (targetModel === 'all' || targetModel === 'Recording') {
      results.Recording = await migrateRecordings(isDryRun);
    }
    
    if (targetModel === 'all' || targetModel === 'Note') {
      results.Note = await migrateNotes(isDryRun);
    }
    
    if (targetModel === 'all' || targetModel === 'Session') {
      results.Session = await migrateSessions(isDryRun);
    }
    
    // Summary
    console.log('\n[Migration] Migration Summary:');
    console.log(JSON.stringify(results, null, 2));
    
    if (isDryRun) {
      console.log('\n[Migration] This was a dry run. No data was modified.');
      console.log('[Migration] Run without --dry-run to perform actual migration.');
    } else {
      console.log('\n[Migration] Migration complete!');
      console.log('[Migration] Backups are stored in:', BACKUP_DIR);
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run migration
runMigration();
