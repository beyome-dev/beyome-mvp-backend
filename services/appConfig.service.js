import AppConfig from '../models/appConfig.model.js';


/**
 * Create a new app config
 * @param {Object} data
 * @returns {Promise<Object>} created document
 */
export async function createAppConfig(data) {
  const doc = new AppConfig(data);
  return await doc.save();
}

/**
 * Get a config by its id
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getAppConfigById(id) {
  return await AppConfig.findById(id).lean();
}

/**
 * Return the most recently created config (optionally filtered)
 * @param {Object} [filter={}] 
 * @returns {Promise<Object|null>}
 */
export async function getLatestConfig(filter = {}) {
  const docs = await AppConfig.find(filter).sort({ createdAt: -1 }).limit(1).lean();
  return docs[0] || null;
}

/**
 * List configs with pagination
 * @param {Object} [filter={}] 
 * @param {Object} [opts={}] - { limit, skip, sort }
 * @returns {Promise<Array>} 
 */
export async function listAppConfigs(filter = {}, opts = {}) {
  const { limit = 50, skip = 0, sort = { createdAt: -1 } } = opts;
  return await AppConfig.find(filter).sort(sort).skip(skip).limit(limit).lean();
}

/**
 * Update a config by id
 * @param {string} id
 * @param {Object} updates
 * @param {Object} [opts] - forwarded to findByIdAndUpdate
 * @returns {Promise<Object|null>}
 */
export async function updateAppConfig(id, updates, opts = {}) {
  return await AppConfig.findByIdAndUpdate(id, updates, { new: true, runValidators: true, ...opts }).lean();
}

/**
 * Upsert (create or update) a config by version string
 * Useful for ensuring a single config per version
 * @param {string} version
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function upsertAppConfigByVersion(version, data) {
  return await AppConfig.findOneAndUpdate(
    { version },
    { $set: data },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();
}

/**
 * Delete a config by id
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function deleteAppConfig(id) {
  return await AppConfig.findByIdAndDelete(id).lean();
}