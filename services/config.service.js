// services/configService.js
const Config = require('../models/config');

/**
 * Check if user can modify a given config
 */
function canModifyConfig(user, config) {
  if (config.scope === 'user') {
    // only the owner can modify
    return config.user.toString() === user._id.toString();
  }
  if (config.scope === 'organization') {
    // only admin/owner roles can modify
    return (
      user.organization &&
      config.organization.toString() === user.organization.toString() &&
      user.role === 'admin' // adjust to your roles
    );
  }
  return false;
}

async function createConfig(data, user) {
  // Check if user already has a config when creating user-scope config
  if (data.scope === 'user') {
    const existingConfig = await Config.findOne({ scope: 'user', user: user._id });
    if (existingConfig) {
      throw new Error('User already has a config');
    }
    data.user = user._id; // force ownership
  } else if (data.scope === 'organization') {
    // must be admin of that org
    if (
      !user.organization ||
      user.organization.toString() !== data.organization.toString() ||
      user.role !== 'admin'
    ) {
      throw new Error('Not authorized to create organization config');
    }
    // Check if org already has a config
    const existingOrgConfig = await Config.findOne({ 
      scope: 'organization', 
      organization: data.organization 
    });
    if (existingOrgConfig) {
      throw new Error('Organization already has a config');
    }
  }

  const config = new Config(data);
  return config.save();
}

async function getConfigById(id, user) {
  const config = await Config.findById(id);
  if (!config) throw new Error('Config not found');

  // permissions: user configs only visible to owner; org configs visible to org members
  if (config.scope === 'user') {
    if (config.user.toString() !== user._id.toString()) {
      throw new Error('Not authorized');
    }
  } else if (config.scope === 'organization') {
    if (
      !user.organization ||
      user.organization.toString() !== config.organization.toString()
    ) {
      throw new Error('Not authorized');
    }
  }

  return config;
}

async function updateConfig(id, updates, user) {
  const config = await Config.findById(id);
  if (!config) throw new Error('Config not found');

  if (!canModifyConfig(user, config)) {
    throw new Error('Not authorized to update this config');
  }

  Object.assign(config, updates);
  return config.save();
}

async function deleteConfig(id, user) {
  const config = await Config.findById(id);
  if (!config) throw new Error('Config not found');

  if (!canModifyConfig(user, config)) {
    throw new Error('Not authorized to delete this config');
  }

  return config.deleteOne();
}

async function listConfigs(user, filter = {}) {
  // return configs user has access to
  const query = {
    $or: [
      { scope: 'user', user: user._id },
      user.organization
        ? { scope: 'organization', organization: user.organization }
        : null
    ].filter(Boolean)
  };
  return Config.find({ ...query, ...filter });
}

async function GetUserConfig(user) {
  return Config.findOne( { scope: 'user', user: user._id })
}
module.exports = {
  createConfig,
  getConfigById,
  updateConfig,
  deleteConfig,
  listConfigs,
  GetUserConfig
};