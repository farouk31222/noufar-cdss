const mongoose = require("mongoose");

const predictionSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 0,
    },
    sex: {
      type: String,
      trim: true,
      default: "Not specified",
    },
    consultationReason: {
      type: String,
      trim: true,
      default: "",
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      trim: true,
      default: "Manual",
    },
    result: {
      type: String,
      enum: ["Relapse", "No Relapse"],
      required: true,
    },
    prediction: {
      type: Number,
      enum: [0, 1],
      required: true,
    },
    probability: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    probabilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    modelName: {
      type: String,
      trim: true,
      default: "LogisticRegression",
    },
    selectedModelKey: {
      type: String,
      trim: true,
      default: "logistic_regression",
    },
    selectionPolicy: {
      type: String,
      enum: ["manual", "auto_by_completeness"],
      default: "manual",
    },
    completenessScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    completenessBucket: {
      type: String,
      trim: true,
      default: "",
    },
    selectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    topFactors: [
      {
        feature: {
          type: String,
          required: true,
          trim: true,
        },
        impact: {
          type: Number,
          required: true,
        },
      },
    ],
    inputData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    predictedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    predictedByName: {
      type: String,
      trim: true,
      default: "",
    },
    actualOutcome: {
      type: String,
      enum: ["", "Relapse", "No Relapse"],
      default: "",
    },
    validationStatus: {
      type: String,
      enum: ["Pending", "Correct", "Incorrect"],
      default: "Pending",
    },
    validationRecordedAt: {
      type: Date,
      default: null,
    },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    validatedByName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

predictionSchema.index({ patientId: 1, createdAt: -1 });

module.exports = mongoose.model("Prediction", predictionSchema);
