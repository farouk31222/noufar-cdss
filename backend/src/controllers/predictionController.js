const Prediction = require("../models/Prediction");
const Patient = require("../models/Patient");
const TrainingFeedbackCase = require("../models/TrainingFeedbackCase");
const { getPredictionModelCatalog, requestPrediction } = require("../services/aiPredictionService");
const {
  getActivePredictionModel,
  getPredictionModelOptions,
  getPredictionSelectionPolicy,
  setPredictionSelectionPolicy,
  setActivePredictionModel,
} = require("../services/predictionModelService");
const {
  SUPPORTED_POLICIES,
  selectModelByCompleteness,
  resolveSelectionPolicy,
} = require("../services/modelSelectionService");
const { upsertDoctorValidatedFeedbackCase } = require("../services/trainingFeedbackService");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const resolveOrCreatePatient = async ({
  patientId = null,
  patientName = "",
  age = 0,
  sex = "Not specified",
  consultationReason = "",
  duration = 0,
  inputData = {},
  predictedBy = null,
  predictedByName = "",
  createdAt = new Date(),
  updatedAt = null,
} = {}) => {
  if (patientId) {
    const byId = await Patient.findById(patientId).select("_id patientName");
    if (byId) return byId;
  }

  const normalizedPatientName = String(patientName || "").trim();
  if (!normalizedPatientName) return null;

  const existingPatient = await Patient.findOne({
    patientName: {
      $regex: `^${escapeRegex(normalizedPatientName)}$`,
      $options: "i",
    },
  }).select("_id patientName");

  if (existingPatient) {
    return existingPatient;
  }

  const createdPatient = await Patient.create({
    patientName: normalizedPatientName,
    age: Number(age) || 0,
    sex: String(sex || "Not specified").trim() || "Not specified",
    consultationReason: String(consultationReason || "").trim(),
    duration: Number(duration) || 0,
    source: "Prediction History",
    inputData: inputData || {},
    savedBy: predictedBy || null,
    savedByName: predictedByName || "",
    createdAt,
    updatedAt: updatedAt || createdAt,
  });

  return createdPatient;
};

const ensurePatientRegistryEntry = async (prediction) => {
  const patientName = String(prediction?.patientName || "").trim();
  if (!patientName) return;

  const patient = await resolveOrCreatePatient({
    patientId: prediction.patientId || null,
    patientName,
    age: prediction.age,
    sex: prediction.sex,
    consultationReason: prediction.consultationReason,
    duration: prediction.duration,
    inputData: prediction.inputData || {},
    predictedBy: prediction.predictedBy || null,
    predictedByName: prediction.predictedByName || "",
    createdAt: prediction.createdAt,
    updatedAt: prediction.updatedAt || prediction.createdAt,
  });

  if (patient && (!prediction.patientId || String(prediction.patientId) !== String(patient._id))) {
    prediction.patientId = patient._id;
    await prediction.save();
  }
};

const ensurePredictionAccess = (req, res) => {
  const isStandardDoctor =
    req.user?.role === "doctor" &&
    (req.user?.doctorAccountType || "prediction") === "standard";

  if (!isStandardDoctor) {
    return;
  }

  res.status(403);
  throw new Error("This doctor account can manage patients but cannot run or access prediction workflows.");
};
// charger toutes les prédictions
const getPredictions = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const predictions = await Prediction.find().sort({ createdAt: -1 });
    res.status(200).json(predictions);
  } catch (error) {
    next(error);
  }
};
// charger une prédiction par id pour ouvrir Prediction Details et afficher ses données
const getPredictionById = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await Prediction.findById(req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    res.status(200).json(prediction);
  } catch (error) {
    next(error);
  }
};

const getPredictionModels = async (req, res, next) => {
  try {
    const activeModel = await getActivePredictionModel();
    const selectionPolicy = await getPredictionSelectionPolicy();
    const catalog = await getPredictionModelCatalog();
    res.status(200).json({
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
      selectionPolicy,
      options: (catalog?.options || getPredictionModelOptions()).map((option) => ({
        key: option.key,
        label: option.label,
        description: option.description,
        deployed: option.deployed !== false,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const updateActivePredictionModel = async (req, res, next) => {
  try {
    const catalog = await getPredictionModelCatalog();
    const requestedModel = req.body?.modelKey;
    const requestedPolicy = req.body?.selectionPolicy;
    const updateReason = String(req.body?.reason || "").trim();
    const performanceComparison = req.body?.performanceComparison || null;
    const nextCatalogModel = requestedModel
      ? (catalog?.options || []).find((option) => option.key === requestedModel)
      : null;

    if (nextCatalogModel && nextCatalogModel.deployed === false) {
      res.status(400);
      throw new Error("This prediction model is not deployed on the AI service yet.");
    }

    if (!requestedModel && !requestedPolicy) {
      res.status(400);
      throw new Error("Provide modelKey and/or selectionPolicy.");
    }

    if (requestedModel && performanceComparison && performanceComparison.metric === "f1") {
      const candidateF1 = Number(performanceComparison?.candidateScore);
      const currentF1 = Number(performanceComparison?.currentScore);
      if (Number.isFinite(candidateF1) && Number.isFinite(currentF1) && candidateF1 <= currentF1) {
        res.status(400);
        throw new Error("Model promotion denied: candidate F1 score must be greater than current model F1 score.");
      }
    }

    const activeModel = requestedModel
      ? await setActivePredictionModel(requestedModel, req.user, updateReason)
      : await getActivePredictionModel();
    const selectionPolicy = requestedPolicy
      ? await setPredictionSelectionPolicy(requestedPolicy, req.user, updateReason)
      : await getPredictionSelectionPolicy();

    res.status(200).json({
      message: `${activeModel.label} is now the active prediction model.`,
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
      selectionPolicy,
      updateReason,
      options: (catalog?.options || getPredictionModelOptions()).map((option) => ({
        key: option.key,
        label: option.label,
        description: option.description,
        deployed: option.key === activeModel.key ? true : option.deployed !== false,
      })),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.status || 400);
    }
    next(error);
  }
};

const ensureDeployedActiveModel = async () => {
  const activeModel = await getActivePredictionModel();
  const catalog = await getPredictionModelCatalog();
  const activeCatalogModel = (catalog?.options || []).find((option) => option.key === activeModel.key);

  if (activeCatalogModel && activeCatalogModel.deployed === false) {
    const error = new Error(`The active prediction model "${activeModel.label}" is not deployed on the AI service.`);
    error.status = 503;
    throw error;
  }

  return activeModel;
};

const resolveRuntimeModelSelection = async (payload = {}, requestedPolicy = "") => {
  const systemPolicy = await getPredictionSelectionPolicy();
  const effectivePolicy = resolveSelectionPolicy(requestedPolicy, systemPolicy);

  if (effectivePolicy === SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS) {
    const autoSelection = selectModelByCompleteness(payload);
    const selectedModel = autoSelection.selectedModel;
    const catalog = await getPredictionModelCatalog();
    const catalogMatch = (catalog?.options || []).find((option) => option.key === selectedModel.key);

    if (catalogMatch && catalogMatch.deployed === false) {
      const fallbackModel = await ensureDeployedActiveModel();
      return {
        selectionPolicy: effectivePolicy,
        selectedModel: fallbackModel,
        completenessScore: autoSelection.completenessScore,
        completenessBucket: autoSelection.completenessBucket,
        selectionReason: `Auto selection fallback: model "${selectedModel.key}" not deployed, used active model "${fallbackModel.key}".`,
      };
    }

    return {
      selectionPolicy: effectivePolicy,
      selectedModel,
      completenessScore: autoSelection.completenessScore,
      completenessBucket: autoSelection.completenessBucket,
      selectionReason: autoSelection.selectionReason,
    };
  }

  const activeModel = await ensureDeployedActiveModel();
  return {
    selectionPolicy: SUPPORTED_POLICIES.MANUAL,
    selectedModel: activeModel,
    completenessScore: null,
    completenessBucket: "manual",
    selectionReason: `Manual policy: active model "${activeModel.key}" used.`,
  };
};

const createPrediction = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const patientName = String(req.body?.name || "").trim();
    const consultationReason = String(req.body?.consultationReason || "").trim();
    const age = Number(req.body?.age);
    const source = String(req.body?.source || "Manual").trim() || "Manual";

    if (!patientName || !Number.isFinite(age) || !consultationReason) {
      res.status(400);
      throw new Error("Name, age, and consultation reason are required.");
    }

    const patient = await resolveOrCreatePatient({
      patientId: req.body?.patientId || null,
      patientName,
      age,
      sex: req.body?.sex,
      consultationReason,
      duration: req.body?.duration,
      inputData: req.body,
      predictedBy: req.user?._id || null,
      predictedByName: req.user?.name || req.user?.email || "",
    });

    const runtimeSelection = await resolveRuntimeModelSelection(req.body, req.body?.selectionPolicy);
    const selectedModel = runtimeSelection.selectedModel;
    const aiResult = await requestPrediction(req.body, {
      modelKey: selectedModel.key,
      modelLabel: selectedModel.label,
    });
    // pour vérifier les doublons
    const existingPrediction = await Prediction.findOne({
      source,
      $or: [
        ...(patient?._id ? [{ patientId: patient._id }] : []),
        {
          patientName: {
            $regex: `^${escapeRegex(patientName)}$`,
            $options: "i",
          },
        },
      ],
    }).select("_id patientName age createdAt result probability patientId");

    if (existingPrediction) {
      return res.status(409).json({
        message:
          source === "Data Import"
            ? "A prediction already exists for this imported patient. Duplicate predictions are not allowed."
            : "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
        existingPredictionId: String(existingPrediction._id),
      });
    }

    const prediction = await Prediction.create({
      patientId: patient?._id || null,
      patientName,
      age,
      sex: String(req.body?.sex || "Not specified").trim() || "Not specified",
      consultationReason,
      duration: Number(req.body?.duration) || 0,
      source,
      result: aiResult.result,
      prediction: aiResult.prediction,
      probability: aiResult.probabilityPercent,
      probabilityScore: aiResult.probabilityScore,
      riskLevel: aiResult.riskLevel,
      modelName: aiResult.modelName || selectedModel.label,
      selectedModelKey: selectedModel.key,
      selectionPolicy: runtimeSelection.selectionPolicy,
      completenessScore:
        typeof runtimeSelection.completenessScore === "number" ? runtimeSelection.completenessScore : undefined,
      completenessBucket: runtimeSelection.completenessBucket,
      selectionReason: runtimeSelection.selectionReason,
      topFactors: aiResult.topFactors,
      inputData: req.body,
      predictedBy: req.user?._id || null,
      predictedByName: req.user?.name || req.user?.email || "",
    });

    await ensurePatientRegistryEntry(prediction);

    res.status(201).json({
      message: "Prediction created successfully.",
      prediction: {
        id: prediction._id,
        patientName: prediction.patientName,
        age: prediction.age,
        result: prediction.result,
        probability: prediction.probability,
      },
      displayResult: {
        patientName,
        consultationReason,
        duration: Number(req.body?.duration) || 0,
        probability: aiResult.probabilityPercent,
        relapse: aiResult.prediction === 1,
        contributions: aiResult.displayFactors,
      },
      modelSelection: {
        selectionPolicy: runtimeSelection.selectionPolicy,
        selectedModelKey: selectedModel.key,
        selectedModelLabel: selectedModel.label,
        completenessScore: runtimeSelection.completenessScore,
        completenessBucket: runtimeSelection.completenessBucket,
        selectionReason: runtimeSelection.selectionReason,
      },
    });
  } catch (error) {
    if (!res.statusCode || res.statusCode === 200) {
      res.status(error.status || 400);
    }
    next(error);
  }
};

const updatePrediction = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await Prediction.findById(req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    const updates = { ...req.body };

    if (updates.rerunPrediction) {
      const patientName = String(updates.name || prediction.patientName || "").trim();
      const consultationReason = String(updates.consultationReason || prediction.consultationReason || "").trim();
      const age = Number(updates.age);
      const source = String(updates.source || prediction.source || "Manual").trim() || "Manual";

      if (!patientName || !Number.isFinite(age) || !consultationReason) {
        res.status(400);
        throw new Error("Name, age, and consultation reason are required.");
      }

      const patient = await resolveOrCreatePatient({
        patientId: prediction.patientId || updates.patientId || null,
        patientName,
        age,
        sex: updates.sex || prediction.sex,
        consultationReason,
        duration: updates.duration,
        inputData: updates,
        predictedBy: req.user?._id || prediction.predictedBy || null,
        predictedByName: req.user?.name || req.user?.email || prediction.predictedByName || "",
      });

      const runtimeSelection = await resolveRuntimeModelSelection(updates, updates?.selectionPolicy);
      const selectedModel = runtimeSelection.selectedModel;
      const aiResult = await requestPrediction(updates, {
        modelKey: selectedModel.key,
        modelLabel: selectedModel.label,
      });

      prediction.patientName = patientName;
      prediction.patientId = patient?._id || prediction.patientId || null;
      prediction.age = age;
      prediction.sex = String(updates.sex || prediction.sex || "Not specified").trim() || "Not specified";
      prediction.consultationReason = consultationReason;
      prediction.duration = Number(updates.duration) || 0;
      prediction.source = source;
      prediction.result = aiResult.result;
      prediction.prediction = aiResult.prediction;
      prediction.probability = aiResult.probabilityPercent;
      prediction.probabilityScore = aiResult.probabilityScore;
      prediction.riskLevel = aiResult.riskLevel;
      prediction.modelName = aiResult.modelName || selectedModel.label;
      prediction.selectedModelKey = selectedModel.key;
      prediction.selectionPolicy = runtimeSelection.selectionPolicy;
      if (typeof runtimeSelection.completenessScore === "number") {
        prediction.completenessScore = runtimeSelection.completenessScore;
      }
      prediction.completenessBucket = runtimeSelection.completenessBucket;
      prediction.selectionReason = runtimeSelection.selectionReason;
      prediction.topFactors = aiResult.topFactors;
      prediction.inputData = updates;
      prediction.predictedBy = req.user?._id || prediction.predictedBy || null;
      prediction.predictedByName = req.user?.name || req.user?.email || prediction.predictedByName || "";

      if (prediction.actualOutcome) {
        prediction.validationStatus = prediction.actualOutcome === prediction.result ? "Correct" : "Incorrect";
      } else {
        prediction.validationStatus = "Pending";
      }

      await prediction.save();
      await ensurePatientRegistryEntry(prediction);
      if (prediction.actualOutcome) {
        await upsertDoctorValidatedFeedbackCase({
          prediction,
          doctorUser: req.user,
        });
      }
      return res.status(200).json(prediction);
    }

    delete updates.rerunPrediction;

    if (Object.prototype.hasOwnProperty.call(updates, "actualOutcome")) {
      const actualOutcome = String(updates.actualOutcome || "").trim();

      if (actualOutcome && !["Relapse", "No Relapse"].includes(actualOutcome)) {
        res.status(400);
        throw new Error("Actual outcome must be either Relapse or No Relapse.");
      }

      prediction.actualOutcome = actualOutcome;

      if (!actualOutcome) {
        prediction.validationStatus = "Pending";
        prediction.validationRecordedAt = null;
        prediction.validatedBy = null;
        prediction.validatedByName = "";
        await TrainingFeedbackCase.findOneAndDelete({ predictionId: prediction._id });
      } else {
        prediction.validationStatus = actualOutcome === prediction.result ? "Correct" : "Incorrect";
        prediction.validationRecordedAt = new Date();
        prediction.validatedBy = req.user?._id || null;
        prediction.validatedByName = req.user?.name || req.user?.email || "";
      }

      delete updates.actualOutcome;
    }

    Object.assign(prediction, updates);
    await prediction.save();

    if (prediction.actualOutcome) {
      await upsertDoctorValidatedFeedbackCase({
        prediction,
        doctorUser: req.user,
      });
    }

    res.status(200).json(prediction);
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(400);
    }
    next(error);
  }
};

const deletePrediction = async (req, res, next) => {
  try {
    //  pour supprimer une prédiction
    ensurePredictionAccess(req, res);
    const prediction = await Prediction.findByIdAndDelete(req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    await TrainingFeedbackCase.findOneAndDelete({ predictionId: prediction._id });

    res.status(200).json({ message: "Prediction deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPredictions,
  getPredictionById,
  getPredictionModels,
  updateActivePredictionModel,
  createPrediction,
  updatePrediction,
  deletePrediction,
};
