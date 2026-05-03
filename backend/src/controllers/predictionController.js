const Prediction = require("../models/Prediction");
const { getPredictionModelCatalog, requestPrediction } = require("../services/aiPredictionService");
const {
  getActivePredictionModel,
  getPredictionModelOptions,
  setActivePredictionModel,
} = require("../services/predictionModelService");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// charger toutes les prédictions
const getPredictions = async (req, res, next) => {
  try {
    const predictions = await Prediction.find().sort({ createdAt: -1 });
    res.status(200).json(predictions);
  } catch (error) {
    next(error);
  }
};
// charger une prédiction par id pour ouvrir Prediction Details et afficher ses données
const getPredictionById = async (req, res, next) => {
  try {
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
    const catalog = await getPredictionModelCatalog();
    res.status(200).json({
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
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
    const nextCatalogModel = (catalog?.options || []).find((option) => option.key === requestedModel);

    if (nextCatalogModel && nextCatalogModel.deployed === false) {
      res.status(400);
      throw new Error("This prediction model is not deployed on the AI service yet.");
    }

    const activeModel = await setActivePredictionModel(requestedModel, req.user);

    res.status(200).json({
      message: `${activeModel.label} is now the active prediction model.`,
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
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

const createPrediction = async (req, res, next) => {
  try {
    const patientName = String(req.body?.name || "").trim();
    const consultationReason = String(req.body?.consultationReason || "").trim();
    const age = Number(req.body?.age);
    const source = String(req.body?.source || "Manual").trim() || "Manual";

    if (!patientName || !Number.isFinite(age) || !consultationReason) {
      res.status(400);
      throw new Error("Name, age, and consultation reason are required.");
    }

    const activeModel = await ensureDeployedActiveModel();
    const aiResult = await requestPrediction(req.body, {
      modelKey: activeModel.key,
      modelLabel: activeModel.label,
    });
    // pour vérifier les doublons
    const existingPrediction = await Prediction.findOne({
      patientName: {
        $regex: `^${escapeRegex(patientName)}$`,
        $options: "i",
      },
      source,
    }).select("_id patientName age createdAt result probability");

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
      modelName: aiResult.modelName || activeModel.label,
      topFactors: aiResult.topFactors,
      inputData: req.body,
      predictedBy: req.user?._id || null,
      predictedByName: req.user?.name || req.user?.email || "",
    });

    res.status(201).json({
      message: "Prediction created successfully.",
      prediction,
      displayResult: {
        patientName,
        consultationReason,
        duration: Number(req.body?.duration) || 0,
        probability: aiResult.probabilityPercent,
        relapse: aiResult.prediction === 1,
        contributions: aiResult.displayFactors,
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

      const activeModel = await ensureDeployedActiveModel();
      const aiResult = await requestPrediction(updates, {
        modelKey: activeModel.key,
        modelLabel: activeModel.label,
      });

      prediction.patientName = patientName;
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
      prediction.modelName = aiResult.modelName || activeModel.label;
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
    const prediction = await Prediction.findByIdAndDelete(req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

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
