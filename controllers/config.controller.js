// controllers/configController.js
const configService = require('../services/config.service');

async function createConfig(req, res) {
  try {
    const config = await configService.createConfig(req.body, req.user);
    res.status(201).json(config);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
}

async function getConfig(req, res) {
  try {
    const config = await configService.getConfigById(req.params.id, req.user);
    res.json(config);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
}

async function updateConfig(req, res) {
  try {
    const config = await configService.updateConfig(
      req.params.id,
      req.body,
      req.user
    );
    res.json(config);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
}

async function deleteConfig(req, res) {
  try {
    await configService.deleteConfig(req.params.id, req.user);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
}

async function listConfigs(req, res) {
  try {
    const configs = await configService.listConfigs(req.user);
    res.json(configs);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
}

module.exports = {
  createConfig,
  getConfig,
  updateConfig,
  deleteConfig,
  listConfigs
};