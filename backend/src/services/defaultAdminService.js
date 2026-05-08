const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const User = require("../models/User");

const ensureDefaultAdmin = async () => {
  const adminEmail = String(process.env.DEFAULT_ADMIN_EMAIL || "admin").trim().toLowerCase();
  const adminPassword = String(process.env.DEFAULT_ADMIN_PASSWORD || "admin");
  const adminName = String(process.env.DEFAULT_ADMIN_NAME || "Admin").trim() || "Admin";
  const now = new Date();

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // Keep one predictable admin account in dedicated admins collection.
  await Admin.deleteMany({
    email: { $ne: adminEmail },
  });

  await Admin.collection.updateOne(
    { email: adminEmail },
    {
      $set: {
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        profilePhoto: "",
        twoStepEnabled: false,
        sessionTimeout: "Never",
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  // Optional cleanup: remove legacy admin users from doctors collection.
  await User.deleteMany({ role: "admin" });

  console.log(`Default admin ready: ${adminEmail}`);
};

module.exports = {
  ensureDefaultAdmin,
};
