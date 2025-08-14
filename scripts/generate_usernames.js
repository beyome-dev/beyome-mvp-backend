const mongoose = require('mongoose');
const User = require('../models/user'); // Adjust path as needed
const config = require('../config');

// Connect to your MongoDB
mongoose.connect(config.mongo.url, {
  dbName: config.mongo.dbName,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function generateUsername(firstName, lastName) {
  const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
  let username = baseUsername;
  let counter = 1;

  // Ensure uniqueness
  while (await User.findOne({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  return username;
}

async function updateAllUsersWithUsername() {
  try {
    console.log('Starting username generation for existing users...');
    
    // Find all users without a username
    const users = await User.find({ username: { $exists: false } });
    console.log(`Found ${users.length} users without usernames`);
    
    if (users.length === 0) {
      console.log('All users already have usernames!');
      return;
    }

    for (const user of users) {
      if (user.firstName && user.lastName) {
        const username = await generateUsername(user.firstName, user.lastName);
        user.username = username;
        await user.save();
        console.log(`✅ Updated user ${user.email} with username: ${username}`);
      } else {
        console.log(`⚠️  Skipping user ${user.email} - missing firstName or lastName`);
      }
    }
    
    console.log('✅ Done updating users with usernames.');
  } catch (error) {
    console.error('❌ Error updating users:', error);
  } finally {
    mongoose.disconnect();
  }
}

// Run the script
updateAllUsersWithUsername();