const TrainingFeedbackCase = require("../models/TrainingFeedbackCase");

const hasRequiredFeedbackFields = (payload = {}) => {
  const hasPrediction = Boolean(payload.predictionId);
  const hasPatient = Boolean(payload.patientId);
  const hasInput = payload.inputSnapshot && typeof payload.inputSnapshot === "object";
  const hasRealOutcome = ["Relapse", "No Relapse"].includes(String(payload.realOutcome || "").trim());
  const hasPredictedOutcome = ["Relapse", "No Relapse"].includes(String(payload.predictedOutcome || "").trim());

  return hasPrediction && hasPatient && hasInput && hasRealOutcome && hasPredictedOutcome;
};

const upsertDoctorValidatedFeedbackCase = async ({ prediction, doctorUser, reviewNotes = "" }) => {
  if (!prediction || !prediction._id) {
    throw new Error("Prediction is required to build a training feedback case.");
  }

  const realOutcome = String(prediction.actualOutcome || "").trim();
  if (!["Relapse", "No Relapse"].includes(realOutcome)) {
    return null;
  }

  const payload = {
    patientId: prediction.patientId || null,
    predictionId: prediction._id,
    patientNameSnapshot: String(prediction.patientName || "").trim(),
    inputSnapshot: prediction.inputData || {},
    predictedOutcome: prediction.result,
    predictionProbability:
      typeof prediction.probability === "number" ? prediction.probability : null,
    realOutcome,
    validatedByDoctorId: doctorUser?._id || null,
    validatedByDoctorName: doctorUser?.name || doctorUser?.email || "",
    validatedAt: prediction.validationRecordedAt || new Date(),
    modelVersionUsed: String(prediction.selectedModelKey || "").trim(),
    modelNameUsed: String(prediction.modelName || "").trim(),
    selectedModelKey: String(prediction.selectedModelKey || "").trim(),
    selectionPolicy:
      String(prediction.selectionPolicy || "").trim() === "auto_by_completeness"
        ? "auto_by_completeness"
        : "manual",
    validationStatus: "doctor_validated",
    reviewNotes: String(reviewNotes || "").trim(),
    adminReviewedBy: null,
    adminReviewedByName: "",
    adminReviewedAt: null,
    reviewReason: "",
    isRetrainEligible: false,
    source: String(prediction.source || "manual").trim().toLowerCase(),
  };

  const existing = await TrainingFeedbackCase.findOne({ predictionId: prediction._id });

  if (!existing) {
    return TrainingFeedbackCase.create(payload);
  }

  Object.assign(existing, payload);
  return existing.save();
};

const approveFeedbackCase = async ({ feedbackCase, adminUser, reviewReason = "" }) => {
  feedbackCase.validationStatus = "admin_approved";
  feedbackCase.adminReviewedBy = adminUser?._id || null;
  feedbackCase.adminReviewedByName = adminUser?.name || adminUser?.email || "";
  feedbackCase.adminReviewedAt = new Date();
  feedbackCase.reviewReason = String(reviewReason || "").trim();
  feedbackCase.isRetrainEligible = hasRequiredFeedbackFields(feedbackCase);

  return feedbackCase.save();
};

const rejectFeedbackCase = async ({ feedbackCase, adminUser, reviewReason = "" }) => {
  const reason = String(reviewReason || "").trim();
  if (!reason) {
    const error = new Error("Review reason is required when rejecting a feedback case.");
    error.status = 400;
    throw error;
  }

  feedbackCase.validationStatus = "rejected";
  feedbackCase.adminReviewedBy = adminUser?._id || null;
  feedbackCase.adminReviewedByName = adminUser?.name || adminUser?.email || "";
  feedbackCase.adminReviewedAt = new Date();
  feedbackCase.reviewReason = reason;
  feedbackCase.isRetrainEligible = false;

  return feedbackCase.save();
};

module.exports = {
  hasRequiredFeedbackFields,
  upsertDoctorValidatedFeedbackCase,
  approveFeedbackCase,
  rejectFeedbackCase,
};
