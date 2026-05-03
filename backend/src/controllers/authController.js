const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createNotification } = require("../services/notificationService");
const { emitDoctorRegistrationEvent } = require("../services/realtimeService");
const {
  sendDoctorApprovedEmail,
  sendDoctorActivatedEmail,
  sendDoctorDeletedEmail,
  sendDoctorRejectedEmail,
  sendTwoStepVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const getActorName = (user) => user?.name || user?.email || "Admin";

const appendDoctorHistory = (doctor, label, actor) => {
  doctor.assignedAdmin = actor;
  doctor.statusHistory = [
    {
      date: new Date(),
      label,
      by: actor,
    },
    ...(Array.isArray(doctor.statusHistory) ? doctor.statusHistory : []),
  ].slice(0, 25);
};

const normalizeSessionTimeout = (value) => {
  if (value === "60 minutes") return "1 hour";
  if (value === "15 minutes") return "30 minutes";
  return value;
};

const getPasswordResetBaseUrl = () =>
  process.env.APP_BASE_URL || process.env.FRONTEND_BASE_URL || "http://localhost:5000";

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const createTwoStepCode = () => String(Math.floor(100000 + Math.random() * 900000));

const clearTwoStepChallenge = (user) => {
  user.twoStepCodeToken = "";
  user.twoStepCodeExpires = null;
  user.twoStepChallengeToken = "";
};

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  specialty: user.specialty,
  hospital: user.hospital,
  profilePhoto: user.profilePhoto,
  twoStepEnabled: user.twoStepEnabled,
  sessionTimeout: normalizeSessionTimeout(user.sessionTimeout),
  termsAccepted: user.termsAccepted,
  submittedDocuments: user.submittedDocuments,
  approvalStatus: user.approvalStatus,
  accountStatus: user.accountStatus,
  rejectionReason: user.rejectionReason,
  deactivationReason: user.deactivationReason,
  deletionReason: user.deletionReason,
  assignedAdmin: user.assignedAdmin,
  statusHistory: user.statusHistory,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const sanitizeUsers = (users) => users.map((user) => sanitizeUser(user));

const registerUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role,
      specialty,
      hospital,
      adminKey,
      termsAccepted,
    } = req.body;
    const medicalLicenseFile = req.files?.medicalLicense?.[0];
    const nationalIdFile = req.files?.nationalId?.[0];

    if (!name || !email || !password) {
      res.status(400);
      throw new Error("Name, email, and password are required");
    }

    const requestedRole = role === "admin" ? "admin" : "doctor";

    if (requestedRole === "admin" && adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
      res.status(403);
      throw new Error("Invalid admin registration key");
    }

    if (requestedRole === "doctor") {
      if (!specialty || !hospital) {
        res.status(400);
        throw new Error("Specialty and institution are required for doctor registration");
      }

      if (!medicalLicenseFile || !nationalIdFile) {
        res.status(400);
        throw new Error("Medical license and national ID must be provided");
      }

      if (!termsAccepted) {
        res.status(400);
        throw new Error("Terms confirmation is required");
      }
    }

    const normalizedEmail = email.toLowerCase();
    // pour vérifier si l’email existe déjà
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      const canReplaceRejectedOrDeletedDoctor =
        requestedRole === "doctor" &&
        userExists.role === "doctor" &&
        userExists.approvalStatus === "Rejected";

      if (canReplaceRejectedOrDeletedDoctor) {
        await userExists.deleteOne();
      } else if (
        requestedRole === "doctor" &&
        userExists.role === "doctor" &&
        userExists.accountStatus === "Deleted"
      ) {
        res.status(400);
        throw new Error("This email is blocked. Please use another.");
      } else {
        res.status(400);
        throw new Error("User already exists");
      }
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: requestedRole,
      specialty,
      hospital,
      termsAccepted: Boolean(termsAccepted),
      submittedDocuments:
        requestedRole === "doctor"
          ? [
              {
                label: "Medical license",
                fileName: medicalLicenseFile.originalname,
                filePath: `/uploads/${medicalLicenseFile.filename}`,
                mimeType: medicalLicenseFile.mimetype,
                fileSize: medicalLicenseFile.size,
                verified: false,
              },
              {
                label: "National ID",
                fileName: nationalIdFile.originalname,
                filePath: `/uploads/${nationalIdFile.filename}`,
                mimeType: nationalIdFile.mimetype,
                fileSize: nationalIdFile.size,
                verified: false,
              },
            ]
          : [],
      approvalStatus: requestedRole === "admin" ? "Approved" : "Pending",
      accountStatus: requestedRole === "admin" ? "Active" : "Inactive",
      statusHistory:
        requestedRole === "doctor"
          ? [
              {
                date: new Date(),
                label: "Doctor account created and pending review",
                by: "System",
              },
            ]
          : [
              {
                date: new Date(),
                label: "Admin account created",
                by: "System",
              },
            ],
    });

    if (requestedRole === "doctor") {
      await createNotification({
        recipientRole: "admin",
        actorUser: user._id,
        actorName: user.name,
        type: "doctor-registration",
        title: "New doctor registration",
        message: `${user.name} submitted a registration request in ${user.specialty} at ${user.hospital}.`,
        targetType: "doctor-profile",
        targetId: user._id,
        targetUrl: `doctor-details.html?id=${user._id}`,
        metadata: {
          doctorId: String(user._id),
          doctorName: user.name,
          doctorEmail: user.email,
          specialty: user.specialty,
          hospital: user.hospital,
          approvalStatus: user.approvalStatus,
        },
      });

      emitDoctorRegistrationEvent({
        doctorId: user._id,
      });
    }

    res.status(201).json({
      ...sanitizeUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(500);
    }
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password, expectedRole } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Email and password are required");
    }
    // pour login / récupération user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    if (expectedRole === "doctor" && user.role !== "doctor") {
      res.status(403);
      const error = new Error("This account does not have doctor access. Please use the admin portal to sign in.");
      error.code = "DOCTOR_ACCESS_ONLY";
      throw error;
    }

    if (expectedRole === "admin" && user.role !== "admin") {
      res.status(403);
      const error = new Error("This account does not have admin access.");
      error.code = "ADMIN_ACCESS_ONLY";
      throw error;
    }

    if (user.role === "doctor" && user.accountStatus === "Deleted") {
      res.status(403);
      const error = new Error("Your account has been deleted.");
      error.code = "ACCOUNT_DELETED";
      error.reason = user.deletionReason || "No reason was provided by the admin.";
      throw error;
    }

    if (user.role === "doctor" && user.approvalStatus !== "Approved") {
      res.status(403);
      const error = new Error("Your account is pending approval. You’ll receive an email once it has been approved. If it takes more than 24 hours, please contact support at: noufar.cdss@gmail.com.");
      error.code = "ACCOUNT_PENDING_APPROVAL";
      throw error;
    }

    if (user.role === "doctor" && user.accountStatus !== "Active") {
      res.status(403);
      const error = new Error("Your account has been deactivated.");
      error.code = "ACCOUNT_DEACTIVATED";
      error.reason = user.deactivationReason || "No reason was provided by the admin.";
      throw error;
    }

    if (user.role === "doctor" && user.twoStepEnabled) {
      const verificationCode = createTwoStepCode();
      const challengeToken = crypto.randomBytes(24).toString("hex");

      user.twoStepCodeToken = hashToken(verificationCode);
      user.twoStepChallengeToken = hashToken(challengeToken);
      user.twoStepCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendTwoStepVerificationEmail(user, verificationCode);

      res.status(202).json({
        requiresTwoStep: true,
        challengeToken,
        email: user.email,
        maskedEmail: `${user.email.slice(0, 2)}***${user.email.slice(user.email.indexOf("@"))}`,
        expiresInMinutes: 10,
      });
      return;
    }

    res.status(200).json({
      ...sanitizeUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(500);
    }
    next(error);
  }
};

const verifyTwoStepLogin = async (req, res, next) => {
  try {
    const { email, code, challengeToken } = req.body;

    if (!email || !code || !challengeToken) {
      res.status(400);
      throw new Error("Email, verification code, and challenge token are required");
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });

    if (!user || user.role !== "doctor") {
      res.status(401);
      throw new Error("Invalid verification request");
    }

    const isExpired = !user.twoStepCodeExpires || user.twoStepCodeExpires.getTime() < Date.now();
    const isChallengeValid = user.twoStepChallengeToken && user.twoStepChallengeToken === hashToken(challengeToken);
    const isCodeValid = user.twoStepCodeToken && user.twoStepCodeToken === hashToken(code);

    if (isExpired || !isChallengeValid || !isCodeValid) {
      if (isExpired) {
        clearTwoStepChallenge(user);
        await user.save();
      }

      res.status(401);
      throw new Error(isExpired ? "This verification code has expired. Please sign in again." : "Invalid verification code");
    }

    clearTwoStepChallenge(user);
    await user.save();

    res.status(200).json({
      ...sanitizeUser(user),
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(500);
    }
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    // pour récupérer l’utilisateur connecté
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
};

const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const {
      name,
      specialty,
      hospital,
      profilePhoto,
      twoStepEnabled,
      sessionTimeout,
    } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400);
      throw new Error("Full name is required");
    }

    user.name = String(name).trim();
    user.specialty = String(specialty || "").trim();
    user.hospital = String(hospital || "").trim();
    user.profilePhoto = typeof profilePhoto === "string" ? profilePhoto : user.profilePhoto;
    user.twoStepEnabled = Boolean(twoStepEnabled);

    if (sessionTimeout) {
      user.sessionTimeout = normalizeSessionTimeout(sessionTimeout);
    }

    await user.save();

    res.status(200).json({
      user: sanitizeUser(user),
      message: "Profile updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const updateUserEmail = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
    const confirmEmail = String(req.body?.confirmEmail || "").trim().toLowerCase();

    if (!currentPassword || !newEmail || !confirmEmail) {
      res.status(400);
      throw new Error("Current password, new email, and confirmation are required");
    }

    if (!(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    if (newEmail !== confirmEmail) {
      res.status(400);
      throw new Error("The new email and confirmation email do not match");
    }

    const emailTaken = await User.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    });

    if (emailTaken) {
      res.status(400);
      throw new Error("This email is already in use");
    }

    user.email = newEmail;
    await user.save();

    res.status(200).json({
      user: sanitizeUser(user),
      token: generateToken(user._id, user.role),
      message: "Email updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const updateUserPassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400);
      throw new Error("Current password, new password, and confirmation are required");
    }

    if (!(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    if (newPassword.length < 6) {
      res.status(400);
      throw new Error("The new password must contain at least 6 characters");
    }

    if (!/\d/.test(newPassword)) {
      res.status(400);
      throw new Error("The new password must include at least one number");
    }

    if (newPassword === currentPassword) {
      res.status(400);
      throw new Error("The new password shouldn't be the same as the previous password");
    }

    if (newPassword !== confirmPassword) {
      res.status(400);
      throw new Error("The new password and confirmation do not match");
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      res.status(400);
      throw new Error("Email is required");
    }

    const user = await User.findOne({ email, role: "doctor" });

    if (user && user.accountStatus !== "Deleted") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetLink = `${getPasswordResetBaseUrl()}/reset-password.html?token=${rawToken}`;

      try {
        await sendPasswordResetEmail(user, resetLink);
      } catch (emailError) {
        console.error(`Password reset email failed for ${user.email}:`, emailError.message);
      }
    }

    res.status(200).json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token || !newPassword || !confirmPassword) {
      res.status(400);
      throw new Error("Token, new password, and confirmation are required");
    }

    if (newPassword.length < 6) {
      res.status(400);
      throw new Error("The new password must contain at least 6 characters");
    }

    if (!/\d/.test(newPassword)) {
      res.status(400);
      throw new Error("The new password must include at least one number");
    }

    if (newPassword !== confirmPassword) {
      res.status(400);
      throw new Error("The new password and confirmation do not match");
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      role: "doctor",
    });

    if (!user) {
      res.status(400);
      throw new Error("This reset link is invalid or has expired");
    }

    if (await user.matchPassword(newPassword)) {
      res.status(400);
      throw new Error("The new password shouldn't be the same as the previous password");
    }

    user.password = newPassword;
    user.passwordResetToken = "";
    user.passwordResetExpires = null;
    await user.save();

    res.status(200).json({
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    // pour lister les médecins
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json(sanitizeUsers(users));
  } catch (error) {
    next(error);
  }
};

const getAdminOverview = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const approvedDoctors = await User.countDocuments({ role: "doctor", approvalStatus: "Approved" });
    const pendingDoctors = await User.countDocuments({ role: "doctor", approvalStatus: "Pending" });
    const totalAdmins = await User.countDocuments({ role: "admin" });

    res.status(200).json({
      message: "Admin access granted",
      stats: {
        totalUsers,
        approvedDoctors,
        pendingDoctors,
        totalAdmins,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getDoctorWorkspace = async (req, res, next) => {
  try {
    res.status(200).json({
      message: "Doctor access granted",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};

const approveDoctorAccount = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    doctor.approvalStatus = "Approved";
    doctor.accountStatus = "Active";
    doctor.rejectionReason = "";
    doctor.deactivationReason = "";
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, "Doctor approved and account activated", actor);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorApprovedEmail(doctor);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Approval email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor approved and email sent"
          : emailStatus === "skipped"
            ? "Doctor approved but email sending is not configured"
            : "Doctor approved but email delivery failed",
    });
  } catch (error) {
    next(error);
  }
};

const rejectDoctorAccount = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const rejectionReason = String(req.body?.reason || "").trim() || "No rejection reason was provided.";

    let emailStatus = "sent";

    try {
      const result = await sendDoctorRejectedEmail(doctor, rejectionReason);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Rejection email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    await doctor.deleteOne();

    res.status(200).json({
      removedId: req.params.id,
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor rejected, removed, and email sent"
          : emailStatus === "skipped"
            ? "Doctor rejected and removed, but email sending is not configured"
            : "Doctor rejected and removed, but email delivery failed",
    });
  } catch (error) {
    next(error);
  }
};

const deactivateDoctorAccount = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const deactivationReason = String(req.body?.reason || "").trim() || "No deactivation reason was provided.";

    doctor.accountStatus = "Inactive";
    doctor.deactivationReason = deactivationReason;
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, `Doctor account deactivated: ${deactivationReason}`, actor);
    await doctor.save();

    res.status(200).json({
      user: sanitizeUser(doctor),
      message: "Doctor deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const activateDoctorAccount = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    doctor.accountStatus = "Active";
    doctor.deactivationReason = "";
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, "Doctor account activated", actor);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorActivatedEmail(doctor);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Activation email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor activated and email sent"
          : emailStatus === "skipped"
            ? "Doctor activated but email sending is not configured"
            : "Doctor activated but email delivery failed",
    });
  } catch (error) {
    next(error);
  }
};

const deleteDoctorAccount = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const deletionReason = String(req.body?.reason || "").trim() || "No deletion reason was provided.";

    doctor.accountStatus = "Deleted";
    doctor.deletionReason = deletionReason;
    doctor.deactivationReason = "";
    appendDoctorHistory(doctor, `Doctor account deleted: ${deletionReason}`, actor);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorDeletedEmail(doctor, deletionReason);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Deletion email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor account deleted and email sent"
          : emailStatus === "skipped"
            ? "Doctor account deleted but email sending is not configured"
            : "Doctor account deleted but email delivery failed",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyTwoStepLogin,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  updateUserEmail,
  updateUserPassword,
  getAllUsers,
  getAdminOverview,
  getDoctorWorkspace,
  approveDoctorAccount,
  rejectDoctorAccount,
  deactivateDoctorAccount,
  activateDoctorAccount,
  deleteDoctorAccount,
};
