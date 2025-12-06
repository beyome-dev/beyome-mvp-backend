// services/organizationService.js
const Organization = require('../models/organization');
const User = require('../models/user');

async function createOrganization(data) {
  const organization = new Organization(data);
  return organization.save();
}

async function getOrganizationById(id) {
  const organization = await Organization.findById(id);
  if (!organization) throw new Error('Organization not found');
  return organization;
}

async function updateOrganization(id, updates, user) {
  const organization = await Organization.findById(id);
  if (!organization) throw new Error('Organization not found');

  // Define admin-only fields that should be restricted based on user role
  const adminOnlyFields = ['admin'];
  
  // If user is not platform_admin, restrict admin-only fields
  if (!user || user.userType !== 'platform_admin') {
    // Remove admin-only fields from updates
    adminOnlyFields.forEach(field => {
      delete updates[field];
    });

    // For org_admin, allow updating their own organization
    if (user.userType === 'org_admin') {
      // Check if user is the admin of this organization
      if (organization.admin.toString() !== user._id.toString()) {
        throw new Error('You are not authorized to update this organization');
      }
    } else {
      // For other roles, only allow updating basic fields if they belong to the organization
      if (user.organization && user.organization.toString() !== id) {
        throw new Error('You are not authorized to update this organization');
      }
    }
  }

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

async function attachOrganizationToUser(organizationId, role, userId) {
  if (!role) {
    throw new Error('Role is required');
  }
  // Verify organization exists
  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw new Error('Organization not found');
  }

  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const userType = [
        'psychiatrist',       // Doctors with full access to app features
        'therapist',          // Psychologists with slightly fewer permissions
        'receptionist',       // Handles bookings, scheduling, and client inbounds
        'org_admin',          // Organization admin with extended privileges
        'manager'
  ]
  if (!userType.includes(role)) {
    throw new Error('Invalid role');
  }
  user.userType = role;
  // Attach organization to user
  user.organization = organizationId;
  await user.save();

  return {
    message: 'Organization attached to user successfully',
    user: {
      id: user._id,
      email: user.email,
      organization: user.organization
    }
  };
}

module.exports = {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  GetUserOrganization,
  attachOrganizationToUser
};