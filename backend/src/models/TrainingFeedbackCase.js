const mongoose = require("mongoose");

const trainingFeedbackCaseSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
      index: true,
    },
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prediction",
      required: true,
      index: true,
    },
    patientNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },
    inputSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    predictedOutcome: {
      type: String,
      enum: ["Relapse", "No Relapse"],
      required: true,
    },
    predictionProbability: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    realOutcome: {
      type: String,
      enum: ["Relapse", "No Relapse"],
      required: true,
    },
    validatedByDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    validatedByDoctorName: {
      type: String,
      trim: true,
      default: "",
    },
    validatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    modelVersionUsed: {
      type: String,
      trim: true,
      default: "",
    },
    modelNameUsed: {
      type: String,
      trim: true,
      default: "",
    },
    selectedModelKey: {
      type: String,
      trim: true,
      default: "",
    },
    selectionPolicy: {
      type: String,
      enum: ["manual", "auto_by_completeness"],
      default: "manual",
    },
    validationStatus: {
      type: String,
      enum: ["doctor_validated", "admin_approved", "rejected"],
      default: "doctor_validated",
      index: true,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: "",
    },
    adminReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    adminReviewedByName: {
      type: String,
      trim: true,
      default: "",
    },
    adminReviewedAt: {
      type: Date,
      default: null,
    },
    reviewReason: {
      type: String,
      trim: true,
      default: "",
    },
    isRetrainEligible: {
      type: Boolean,
      default: false,
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: "manual",
    },
  },
  { timestamps: true }
);

trainingFeedbackCaseSchema.index({ patientId: 1, predictionId: 1 });
trainingFeedbackCaseSchema.index({ validationStatus: 1, validatedAt: -1 });

module.exports = mongoose.model("TrainingFeedbackCase", trainingFeedbackCaseSchema);
