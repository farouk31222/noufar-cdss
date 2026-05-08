const TrainingFeedbackCase = require("../models/TrainingFeedbackCase");
const {
  approveFeedbackCase,
  rejectFeedbackCase,
} = require("../services/trainingFeedbackService");

const normalizeDate = (value, isEnd = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isEnd) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const getFeedbackCases = async (req, res, next) => {
  try {
    const {
      status = "",
      doctorId = "",
      modelVersion = "",
      from = "",
      to = "",
      eligibleOnly = "",
      page = "1",
      limit = "25",
    } = req.query;

    const filter = {};

    if (status) {
      filter.validationStatus = String(status).trim();
    }

    if (doctorId) {
      filter.validatedByDoctorId = doctorId;
    }

    if (modelVersion) {
      filter.modelVersionUsed = String(modelVersion).trim();
    }

    const fromDate = normalizeDate(from, false);
    const toDate = normalizeDate(to, true);
    if (fromDate || toDate) {
      filter.validatedAt = {};
      if (fromDate) filter.validatedAt.$gte = fromDate;
      if (toDate) filter.validatedAt.$lte = toDate;
    }

    if (String(eligibleOnly).trim().toLowerCase() === "true") {
      filter.isRetrainEligible = true;
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      TrainingFeedbackCase.find(filter)
        .sort({ validatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("predictionId", "_id result actualOutcome selectedModelKey modelName createdAt")
        .populate("patientId", "_id patientName age sex")
        .lean(),
      TrainingFeedbackCase.countDocuments(filter),
    ]);

    res.status(200).json({
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(Math.ceil(total / safeLimit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
};

const approveFeedbackCaseById = async (req, res, next) => {
  try {
    const feedbackCase = await TrainingFeedbackCase.findById(req.params.id);
    if (!feedbackCase) {
      res.status(404);
      throw new Error("Feedback case not found.");
    }

    const updated = await approveFeedbackCase({
      feedbackCase,
      adminUser: req.user,
      reviewReason: req.body?.reviewReason,
    });

    res.status(200).json({
      message: "Feedback case approved for retraining.",
      feedbackCase: updated,
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.status || 400);
    }
    next(error);
  }
};

const rejectFeedbackCaseById = async (req, res, next) => {
  try {
    const feedbackCase = await TrainingFeedbackCase.findById(req.params.id);
    if (!feedbackCase) {
      res.status(404);
      throw new Error("Feedback case not found.");
    }

    const updated = await rejectFeedbackCase({
      feedbackCase,
      adminUser: req.user,
      reviewReason: req.body?.reviewReason,
    });

    res.status(200).json({
      message: "Feedback case rejected.",
      feedbackCase: updated,
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.status || 400);
    }
    next(error);
  }
};

module.exports = {
  getFeedbackCases,
  approveFeedbackCaseById,
  rejectFeedbackCaseById,
};
