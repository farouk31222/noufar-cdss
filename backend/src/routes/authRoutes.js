const express = require("express");
const router = express.Router();

const {
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
  updateDoctorAccessType,
  deleteDoctorAccount,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { upload } = require("../middleware/uploadMiddleware");

router.post(
  "/register",
  upload.fields([
    { name: "medicalLicense", maxCount: 1 },
    { name: "nationalId", maxCount: 1 },
  ]),
  registerUser
);
router.post("/login", loginUser);
router.post("/login/verify-2fa", verifyTwoStepLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", protect, getUserProfile);
router.patch("/profile", protect, updateUserProfile);
router.patch("/profile/email", protect, updateUserEmail);
router.patch("/profile/password", protect, updateUserPassword);
router.get("/doctor/workspace", protect, authorize("doctor"), getDoctorWorkspace);
router.get("/admin/overview", protect, authorize("admin"), getAdminOverview);
router.get("/admin/users", protect, authorize("admin"), getAllUsers);
router.patch("/admin/users/:id/approve", protect, authorize("admin"), approveDoctorAccount);
router.patch("/admin/users/:id/reject", protect, authorize("admin"), rejectDoctorAccount);
router.patch("/admin/users/:id/deactivate", protect, authorize("admin"), deactivateDoctorAccount);
router.patch("/admin/users/:id/activate", protect, authorize("admin"), activateDoctorAccount);
router.patch("/admin/users/:id/access-type", protect, authorize("admin"), updateDoctorAccessType);
router.patch("/admin/users/:id/delete", protect, authorize("admin"), deleteDoctorAccount);

module.exports = router;
