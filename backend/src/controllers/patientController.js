const Patient = require("../models/Patient");
const Prediction = require("../models/Prediction");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizePatientNameKey = (value) => String(value || "").trim().toLowerCase();

const findPatientNameConflict = async (patientName, currentPatientId = null) => {
  const nameQuery = {
    $regex: `^${escapeRegex(patientName)}$`,
    $options: "i",
  };

  const patientQuery = currentPatientId
    ? { _id: { $ne: currentPatientId }, patientName: nameQuery }
    : { patientName: nameQuery };

  const existingPatient = await Patient.findOne(patientQuery).select("_id patientName");

  if (existingPatient) {
    return {
      source: "patients",
      record: existingPatient,
    };
  }

  const existingPrediction = await Prediction.findOne({ patientName: nameQuery }).select("_id patientName");

  if (existingPrediction) {
    return {
      source: "predictions",
      record: existingPrediction,
    };
  }

  return null;
};

const syncPatientsFromPredictionHistory = async () => {
  const existingPatients = await Patient.find().select("_id patientName");
  const knownNames = new Set(existingPatients.map((entry) => normalizePatientNameKey(entry.patientName)));
  const patientByNameKey = new Map(
    existingPatients.map((entry) => [normalizePatientNameKey(entry.patientName), entry])
  );
  const predictions = await Prediction.find().sort({ createdAt: 1 });

  const patientsToCreate = predictions
    .filter((prediction) => {
      const nameKey = normalizePatientNameKey(prediction.patientName);
      if (!nameKey || knownNames.has(nameKey)) {
        return false;
      }

      knownNames.add(nameKey);
      return true;
    })
    .map((prediction) => ({
      patientName: String(prediction.patientName || "").trim(),
      age: Number(prediction.age) || 0,
      sex: String(prediction.sex || "Not specified").trim() || "Not specified",
      consultationReason: String(prediction.consultationReason || "").trim(),
      duration: Number(prediction.duration) || 0,
      source: "Prediction History",
      inputData: prediction.inputData || {},
      savedBy: prediction.predictedBy || null,
      savedByName: prediction.predictedByName || "",
      createdAt: prediction.createdAt,
      updatedAt: prediction.updatedAt || prediction.createdAt,
    }));

  if (!patientsToCreate.length) {
    // Link predictions to existing patients when names match and patientId is missing.
    const bulk = [];
    predictions.forEach((prediction) => {
      if (prediction.patientId) return;
      const patient = patientByNameKey.get(normalizePatientNameKey(prediction.patientName));
      if (!patient?._id) return;
      bulk.push({
        updateOne: {
          filter: { _id: prediction._id, patientId: null },
          update: { $set: { patientId: patient._id } },
        },
      });
    });

    if (bulk.length) {
      await Prediction.bulkWrite(bulk, { ordered: false });
    }
    return;
  }

  const createdPatients = await Patient.insertMany(patientsToCreate, { ordered: false });
  createdPatients.forEach((patient) => {
    patientByNameKey.set(normalizePatientNameKey(patient.patientName), patient);
  });

  const bulk = [];
  predictions.forEach((prediction) => {
    if (prediction.patientId) return;
    const patient = patientByNameKey.get(normalizePatientNameKey(prediction.patientName));
    if (!patient?._id) return;
    bulk.push({
      updateOne: {
        filter: { _id: prediction._id, patientId: null },
        update: { $set: { patientId: patient._id } },
      },
    });
  });

  if (bulk.length) {
    await Prediction.bulkWrite(bulk, { ordered: false });
  }
};

const getPatients = async (req, res, next) => {
  try {
    await syncPatientsFromPredictionHistory();
    const patients = await Patient.find().sort({ createdAt: -1 });
    res.status(200).json(patients);
  } catch (error) {
    next(error);
  }
};

const createPatient = async (req, res, next) => {
  try {
    const patientName = String(req.body?.name || "").trim();
    const consultationReason = String(req.body?.consultationReason || "").trim();
    const age = Number(req.body?.age);
    const source = String(req.body?.source || "Manual").trim() || "Manual";

    if (!patientName || !Number.isFinite(age) || !consultationReason) {
      res.status(400);
      throw new Error("Name, age, and consultation reason are required.");
    }

    const nameConflict = await findPatientNameConflict(patientName);

    if (nameConflict) {
      res.status(409);
      throw new Error(
        nameConflict.source === "predictions"
          ? "A patient with this name already exists in prediction history."
          : "A patient with this name already exists in the registry."
      );
    }

    const patient = await Patient.create({
      patientName,
      age,
      sex: String(req.body?.sex || "Not specified").trim() || "Not specified",
      consultationReason,
      duration: Number(req.body?.duration) || 0,
      source,
      inputData: req.body,
      savedBy: req.user?._id || null,
      savedByName: req.user?.name || req.user?.email || "",
    });

    res.status(201).json({
      message: "Patient clinical entry saved successfully.",
      patient,
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(400);
    }
    next(error);
  }
};

const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      res.status(404);
      throw new Error("Patient not found");
    }

    const patientName = String(req.body?.name || "").trim();
    const consultationReason = String(req.body?.consultationReason || "").trim();
    const age = Number(req.body?.age);
    const source = String(req.body?.source || patient.source || "Manual").trim() || "Manual";

    if (!patientName || !Number.isFinite(age) || !consultationReason) {
      res.status(400);
      throw new Error("Name, age, and consultation reason are required.");
    }

    const nameConflict = await findPatientNameConflict(patientName, patient._id);

    if (nameConflict) {
      res.status(409);
      throw new Error(
        nameConflict.source === "predictions"
          ? "A patient with this name already exists in prediction history."
          : "Another patient with this name already exists in the registry."
      );
    }

    patient.patientName = patientName;
    patient.age = age;
    patient.sex = String(req.body?.sex || "Not specified").trim() || "Not specified";
    patient.consultationReason = consultationReason;
    patient.duration = Number(req.body?.duration) || 0;
    patient.source = source;
    patient.inputData = req.body;
    patient.savedBy = req.user?._id || patient.savedBy || null;
    patient.savedByName = req.user?.name || req.user?.email || patient.savedByName || "";

    await patient.save();

    res.status(200).json({
      message: "Patient clinical entry updated successfully.",
      patient,
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(400);
    }
    next(error);
  }
};

const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);

    if (!patient) {
      res.status(404);
      throw new Error("Patient not found");
    }

    res.status(200).json({ message: "Patient deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
};
