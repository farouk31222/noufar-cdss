const SystemPreference = require("../models/SystemPreference");
const {
  DEFAULT_PREDICTION_MODEL_KEY,
  getPredictionModels,
  findPredictionModel,
  getDefaultPredictionModel,
} = require("../config/predictionModels");

const ACTIVE_PREDICTION_MODEL_KEY = "activePredictionModel";

const getPredictionModelOptions = () =>
  getPredictionModels().map(({ key, label, description }) => ({
    key,
    label,
    description,
  }));

const getActivePredictionModel = async () => {
  const defaultModel = getDefaultPredictionModel();
  // pour récupérer le modèle actif
  const preference = await SystemPreference.findOne({ key: ACTIVE_PREDICTION_MODEL_KEY }).lean();
  const resolvedModel = findPredictionModel(preference?.value);

  return resolvedModel || defaultModel;
};

const setActivePredictionModel = async (modelValue, user = null) => {
  const nextModel = findPredictionModel(modelValue);

  if (!nextModel) {
    const error = new Error("Unsupported prediction model.");
    error.status = 400;
    throw error;
  }
  // pour changer le modèle actif
  await SystemPreference.findOneAndUpdate(
    { key: ACTIVE_PREDICTION_MODEL_KEY },
    {
      key: ACTIVE_PREDICTION_MODEL_KEY,
      value: nextModel.key,
      updatedBy: user?._id || null,
      updatedByName: user?.name || user?.email || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return nextModel;
};

module.exports = {
  ACTIVE_PREDICTION_MODEL_KEY,
  getPredictionModelOptions,
  getActivePredictionModel,
  setActivePredictionModel,
  DEFAULT_PREDICTION_MODEL_KEY,
};
