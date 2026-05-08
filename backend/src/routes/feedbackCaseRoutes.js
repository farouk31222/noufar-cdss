const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  getFeedbackCases,
  approveFeedbackCaseById,
  rejectFeedbackCaseById,
} = require("../controllers/feedbackCaseController");

router.route("/").get(protect, authorize("admin"), getFeedbackCases);
router.route("/:id/approve").post(protect, authorize("admin"), approveFeedbackCaseById);
router.route("/:id/reject").post(protect, authorize("admin"), rejectFeedbackCaseById);

module.exports = router;
