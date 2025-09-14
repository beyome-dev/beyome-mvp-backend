// services/organizationService.js
const Organization = require('../models/organization');

async function createOrganization(data) {
  const organization = new Organization(data);
  return organization.save();
}

async function getOrganizationById(id) {
  const organization = await Organization.findById(id);
  if (!organization) throw new Error('Organization not found');
  return organization;
}

async function updateOrganization(id, updates) {
  const organization = await Organization.findById(id);
  if (!organization) throw new Error('Organization not found');

  Object.assign(organization, updates);
  return organization.save();
}

async function deleteOrganization(id) {
  const organization = await Organization.findById(id);
  if (!organization) throw new Error('Organization not found');

  return organization.deleteOne();
}

async function listOrganizations(user, filter = {}) {
  return Organization.find(filter);
}

async function GetUserOrganization(user) {
  return Organization.findOne( { scope: 'user', user: user._id })
}

module.exports = {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  GetUserOrganization
};