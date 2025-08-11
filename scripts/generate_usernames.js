const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/user'); // Adjust path as needed

// Connect to your MongoDB
mongoose.connect(config.mongo.url, {
    dbName: config.mongo.dbName, // Ensure this is correctly set in config
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
  const users = await User.find({ username: { $exists: false } });
  console.log("Users to update: ", users.length);
  for (const user of users) {
    if (user.firstName && user.lastName) {
      user.username = await generateUsername(user.firstName, user.lastName);
      if (!user.age) {
        user.age = 0;
      }
      await user.save();
      console.log(`Updated user ${user.email} with username: ${user.username}`);
    }
  }
  console.log('Done updating users.');
  mongoose.disconnect();
}

updateAllUsersWithUsername().catch(err => {
  console.error(err);
  mongoose.disconnect();
});