const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");

const {
  getPredictions,
  getPredictionById,
  getPredictionModels,
  updateActivePredictionModel,
  createPrediction,
  updatePrediction,
  deletePrediction,
} = require("../controllers/predictionController");

router
  .route("/models")
  .get(protect, authorize("admin"), getPredictionModels);

router
  .route("/models/active")
  .put(protect, authorize("admin"), updateActivePredictionModel);

router.route("/").get(protect, authorize("doctor", "admin"), getPredictions).post(protect, authorize("doctor", "admin"), createPrediction);

router
  .route("/:id")
  .get(protect, authorize("doctor", "admin"), getPredictionById)
  .put(protect, authorize("doctor", "admin"), updatePrediction)
  .delete(protect, authorize("doctor", "admin"), deletePrediction);

module.exports = router;
