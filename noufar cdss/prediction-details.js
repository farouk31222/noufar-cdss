const detailsPageSidebar = document.querySelector(".sidebar");
const detailsPageMobileButton = document.querySelector(".mobile-nav-button");
const rerunConfirmationModal = document.querySelector("#rerun-confirmation-modal");
const deletePredictionModal = document.querySelector("#delete-prediction-modal");
const predictionValidationModal = document.querySelector("#prediction-validation-modal");
const detailModalCloseControls = document.querySelectorAll("[data-close-details-modal]");
const openRerunPredictionButton = document.querySelector("#open-rerun-prediction");
const backToDataSelectionButton = document.querySelector("#detail-back-to-selection");
const openDeletePredictionButton = document.querySelector("#open-delete-prediction");
const openValidationModalButton = document.querySelector("#open-validation-modal");
const inlineClinicalEntryForm = document.querySelector("#inline-clinical-entry-form");
const rerunPatientNameInput = document.querySelector("#detail-rerun-patient-name");
const rerunWarningNode = document.querySelector("#detail-rerun-warning");
const rerunSummaryCopy = document.querySelector("#rerun-summary-copy");
const rerunChangeList = document.querySelector("#rerun-change-list");
const confirmRerunPredictionButton = document.querySelector("#confirm-rerun-prediction");
const deleteSummaryNode = document.querySelector("#detail-delete-summary");
const confirmDeletePredictionButton = document.querySelector("#confirm-delete-prediction");
const validationPredictedNode = document.querySelector("#detail-validation-predicted");
const validationActualNode = document.querySelector("#detail-validation-actual");
const validationBadgeNode = document.querySelector("#detail-validation-badge");
const validationStatusHeadingNode = document.querySelector("#detail-validation-status-heading");
const validationDateNode = document.querySelector("#detail-validation-date");
const validationCopyNode = document.querySelector("#detail-validation-copy");
const validationModalSummary = document.querySelector("#detail-validation-modal-summary");
const validationOutcomeSelect = document.querySelector("#detail-validation-outcome");
const validationPreviewNode = document.querySelector("#detail-validation-preview");
const confirmValidationResultButton = document.querySelector("#confirm-validation-result");
const detailToggleInputs = Array.from(document.querySelectorAll(".detail-toggle-input"));
const detailRangeInputs = Array.from(document.querySelectorAll(".detail-range-input"));
const detailChipSelectGroups = Array.from(document.querySelectorAll(".detail-chip-select-group"));
const predictionDetailsAuthStorageKey = "noufar-doctor-auth-v1";
const predictionDetailsApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

if (detailsPageMobileButton && detailsPageSidebar) {
  detailsPageMobileButton.addEventListener("click", () => {
    const isOpen = detailsPageSidebar.classList.toggle("is-open");
    detailsPageMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

const detailParams = new URLSearchParams(window.location.search);
const detailId = detailParams.get("id");
const detailReturnTo = detailParams.get("returnTo");
let detailEntry = detailId ? getPredictionById(detailId) : null;

const isDatasetSelectionReturn = () => {
  if (!detailReturnTo) return false;
  const normalized = String(detailReturnTo || "").trim().toLowerCase();
  return normalized.startsWith("dataset-selection.html");
};

const getDetailReturnUrl = () => {
  const fallback = "dataset-selection.html";

  if (!detailReturnTo || !isDatasetSelectionReturn()) {
    return fallback;
  }

  const normalized = String(detailReturnTo || "").trim();
  if (!normalized || /^https?:/i.test(normalized) || normalized.startsWith("//")) {
    return fallback;
  }

  return normalized;
};

const hydrateDetailReturnButton = () => {
  if (!backToDataSelectionButton) return;

  if (!isDatasetSelectionReturn()) {
    backToDataSelectionButton.hidden = true;
    backToDataSelectionButton.style.display = "none";
    backToDataSelectionButton.href = "dataset-selection.html";
    return;
  }

  backToDataSelectionButton.href = getDetailReturnUrl();
  backToDataSelectionButton.hidden = false;
  backToDataSelectionButton.style.display = "";
};

hydrateDetailReturnButton();

const showPredictionDetailsToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const getPredictionDetailsDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(predictionDetailsAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const getPredictionDetailsAuthHeaders = () => {
  const session = getPredictionDetailsDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

const requestPredictionDetailsEntry = async (id) => {
  const response = await fetch(`${predictionDetailsApiBaseUrl}/predictions/${encodeURIComponent(id)}`, {
    headers: getPredictionDetailsAuthHeaders(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to load this prediction record.");
  }

  return data;
};

const updatePredictionDetailsEntry = async (id, payload) => {
  const response = await fetch(`${predictionDetailsApiBaseUrl}/predictions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getPredictionDetailsAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to save the confirmed outcome.");
  }

  return data;
};

const normalizePredictionDetailsEntry = (entry = {}) => {
  const normalizedBase =
    typeof normalizePredictionEntry === "function" ? normalizePredictionEntry(entry) : entry;

  return {
    ...normalizedBase,
    topFactors: Array.isArray(entry.topFactors) ? entry.topFactors : [],
    inputData: entry.inputData && typeof entry.inputData === "object" ? entry.inputData : {},
    modelName: entry.modelName || "LogisticRegression",
    predictedByName: entry.predictedByName || "",
    validatedByName: entry.validatedByName || "",
  };
};

const DETAIL_STORAGE_KEY = "noufar-detail-profiles";

const baseDetailCatalog = {
  "NFR-2401": {
    age: 34,
    consultationReason: "Dysthyroidie",
    stress: "Yes",
    palpitations: "Yes",
    spp: "No",
    amg: "Yes",
    diarrhea: "No",
    tremors: "Yes",
    agitation: "Yes",
    moodDisorder: "No",
    sleepDisorder: "Yes",
    sweating: "Yes",
    heatIntolerance: "Yes",
    muscleWeakness: "Yes",
    goiter: "Yes",
    goiterClass: "1B",
    tsh: 0.03,
    ft4: 2.41,
    antiTpo: "Positive",
    antiTpoTotal: 482,
    antiTg: "Positive",
    tsi: "Positive",
    tsiLevel: 4.7,
    ultrasound: "Diffuse goiter with vascular pattern",
    scintigraphy: "High uptake",
    therapy: "Antithyroid therapy",
    duration: 18,
    blockReplace: "No",
    surgery: "No",
    radioactiveIodine: "No",
  },
  "NFR-2402": {
    age: 41,
    consultationReason: "Compression signs",
    stress: "No",
    palpitations: "No",
    spp: "No",
    amg: "No",
    diarrhea: "No",
    tremors: "No",
    agitation: "No",
    moodDisorder: "No",
    sleepDisorder: "No",
    sweating: "No",
    heatIntolerance: "No",
    muscleWeakness: "No",
    goiter: "No",
    goiterClass: "0",
    tsh: 1.84,
    ft4: 1.02,
    antiTpo: "Negative",
    antiTpoTotal: 36,
    antiTg: "Negative",
    tsi: "Negative",
    tsiLevel: 0.4,
    ultrasound: "Normal thyroid volume",
    scintigraphy: "Normal uptake",
    therapy: "Maintenance monitoring",
    duration: 9,
    blockReplace: "No",
    surgery: "No",
    radioactiveIodine: "No",
  },
  "NFR-2403": {
    age: 29,
    consultationReason: "Tumefaction",
    stress: "Yes",
    palpitations: "Yes",
    spp: "Yes",
    amg: "Yes",
    diarrhea: "Yes",
    tremors: "Yes",
    agitation: "Yes",
    moodDisorder: "Yes",
    sleepDisorder: "Yes",
    sweating: "Yes",
    heatIntolerance: "Yes",
    muscleWeakness: "Yes",
    goiter: "Yes",
    goiterClass: "2",
    tsh: 0.02,
    ft4: 2.56,
    antiTpo: "Positive",
    antiTpoTotal: 600,
    antiTg: "Positive",
    tsi: "Positive",
    tsiLevel: 5.2,
    ultrasound: "Goiter with nodules",
    scintigraphy: "High uptake",
    therapy: "Antithyroid therapy",
    duration: 24,
    blockReplace: "Yes",
    surgery: "No",
    radioactiveIodine: "No",
  },
};

const readStoredDetailProfiles = () => {
  try {
    const raw = window.localStorage.getItem(DETAIL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

let storedDetailProfiles = readStoredDetailProfiles();
let pendingRerunProfile = null;

const persistDetailProfiles = () => {
  try {
    window.localStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(storedDetailProfiles));
  } catch (error) {
    // Ignore storage failures for offline local preview.
  }
};

const detailFieldMap = {
  age: "#detail-age",
  consultationReason: "#detail-consultation-reason",
  stress: "#detail-stress",
  palpitations: "#detail-palpitations",
  spp: "#detail-spp",
  amg: "#detail-amg",
  diarrhea: "#detail-diarrhea",
  tremors: "#detail-tremors",
  agitation: "#detail-agitation",
  moodDisorder: "#detail-mood-disorder",
  sleepDisorder: "#detail-sleep-disorder",
  sweating: "#detail-sweating",
  heatIntolerance: "#detail-heat-intolerance",
  muscleWeakness: "#detail-muscle-weakness",
  goiter: "#detail-goiter",
  goiterClass: "#detail-goiter-class",
  tsh: "#detail-tsh",
  ft4: "#detail-ft4",
  antiTpo: "#detail-anti-tpo",
  antiTpoTotal: "#detail-anti-tpo-total",
  antiTg: "#detail-anti-tg",
  tsi: "#detail-tsi",
  tsiLevel: "#detail-tsi-level",
  ultrasound: "#detail-ultrasound",
  scintigraphy: "#detail-scintigraphy",
  therapy: "#detail-therapy",
  duration: "#detail-duration",
  blockReplace: "#detail-block-replace",
  surgery: "#detail-surgery",
  radioactiveIodine: "#detail-rai",
};

const defaultDetailProfile = {
  age: 35,
  consultationReason: "Dysthyroidie",
  stress: "No",
  palpitations: "No",
  spp: "No",
  amg: "No",
  diarrhea: "No",
  tremors: "No",
  agitation: "No",
  moodDisorder: "No",
  sleepDisorder: "No",
  sweating: "No",
  heatIntolerance: "No",
  muscleWeakness: "No",
  goiter: "No",
  goiterClass: "0",
  tsh: 1.2,
  ft4: 1.1,
  antiTpo: "Negative",
  antiTpoTotal: 40,
  antiTg: "Negative",
  tsi: "Negative",
  tsiLevel: 0.5,
  ultrasound: "Normal thyroid volume",
  scintigraphy: "Normal uptake",
  therapy: "Maintenance monitoring",
  duration: 12,
  blockReplace: "No",
  surgery: "No",
  radioactiveIodine: "No",
};

const normalizeDetailConsultationReason = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.consultationReason;
  if (normalized === "dysthyroidie") return "Dysthyroidie";
  if (normalized === "signes de compression") return "Compression signs";
  if (normalized === "other" || normalized === "follow-up control") return "Other";
  return String(value ?? "").trim();
};

const normalizeDetailUltrasound = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.ultrasound;
  if (normalized === "goiter" || normalized === "goitre") return "Diffuse goiter with vascular pattern";
  if (normalized === "normal volume" || normalized === "volume normal") return "Normal thyroid volume";
  if (normalized === "goiter + nodules" || normalized === "goitre + nodules") return "Goiter with nodules";
  return String(value ?? "").trim();
};

const normalizeDetailScintigraphy = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.scintigraphy;
  if (normalized === "high uptake" || normalized === "hypercaptante") return "High uptake";
  if (normalized === "hot nodule" || normalized === "nodule chaud") return "Hot nodule";
  if (normalized === "normal uptake" || normalized === "normocaptante") return "Normal uptake";
  return String(value ?? "").trim();
};

const normalizeDetailProfile = (profile, entry) => ({
  ...defaultDetailProfile,
  ...profile,
  age: Number(profile?.age ?? entry.age ?? defaultDetailProfile.age),
  antiTpoTotal: Number(profile?.antiTpoTotal ?? defaultDetailProfile.antiTpoTotal),
  tsiLevel: Number(profile?.tsiLevel ?? defaultDetailProfile.tsiLevel),
  tsh: Number(profile?.tsh ?? defaultDetailProfile.tsh),
  ft4: Number(profile?.ft4 ?? defaultDetailProfile.ft4),
  duration: Number(profile?.duration ?? defaultDetailProfile.duration),
  therapy: profile?.therapy ?? profile?.treatment ?? defaultDetailProfile.therapy,
  radioactiveIodine:
    profile?.radioactiveIodine ?? profile?.rai ?? defaultDetailProfile.radioactiveIodine,
});

const getGeneratedDetailProfile = (entry) => {
  const index = Math.max(0, patientPredictions.findIndex((item) => item.id === entry.id));
  const consultationReasons = ["Dysthyroidie", "Compression signs", "Tumefaction", "Other"];
  const ultrasoundFindings = [
    "Diffuse goiter with vascular pattern",
    "Normal thyroid volume",
    "Goiter with nodules",
    "Mild heterogeneous texture",
  ];
  const scintigraphyFindings = ["High uptake", "Normal uptake", "Hot nodule", "Normal uptake"];
  const treatmentPlans = ["Antithyroid therapy", "Maintenance monitoring", "Block and replace", "Observation plan"];
  const classification = ["0", "1A", "1B", "2", "3"];
  const highRisk = entry.result === "Relapse";

  return normalizeDetailProfile({
    age: entry.age,
    consultationReason: consultationReasons[index % consultationReasons.length],
    stress: highRisk ? "Yes" : "No",
    palpitations: entry.probability >= 60 ? "Yes" : "No",
    spp: entry.probability >= 62 ? "Yes" : "No",
    amg: entry.probability >= 68 ? "Yes" : "No",
    diarrhea: entry.probability >= 58 ? "Yes" : "No",
    tremors: entry.probability >= 70 ? "Yes" : "No",
    agitation: entry.probability >= 64 ? "Yes" : "No",
    moodDisorder: entry.probability >= 60 ? "Yes" : "No",
    sleepDisorder: entry.probability >= 57 ? "Yes" : "No",
    sweating: entry.probability >= 61 ? "Yes" : "No",
    heatIntolerance: entry.probability >= 65 ? "Yes" : "No",
    muscleWeakness: entry.probability >= 56 ? "Yes" : "No",
    goiter: index % 2 === 0 ? "Yes" : "No",
    goiterClass: classification[(index + 1) % classification.length],
    tsh: Number(Math.max(0.03, ((100 - entry.probability) / 35).toFixed(2))),
    ft4: Number((0.85 + entry.probability / 60).toFixed(2)),
    antiTpo: highRisk ? "Positive" : "Negative",
    antiTpoTotal: Math.round(65 + entry.probability * 4.8),
    antiTg: index % 3 === 0 ? "Positive" : "Negative",
    tsi: highRisk ? "Positive" : "Negative",
    tsiLevel: Number((0.4 + entry.probability / 18).toFixed(2)),
    ultrasound: ultrasoundFindings[index % ultrasoundFindings.length],
    scintigraphy: scintigraphyFindings[index % scintigraphyFindings.length],
    therapy: treatmentPlans[index % treatmentPlans.length],
    duration: 8 + index * 3,
    blockReplace: index % 3 === 0 ? "Yes" : "No",
    surgery: "No",
    radioactiveIodine: index % 5 === 0 ? "Yes" : "No",
  }, entry);
};

const buildDetailProfileFromInputData = (entry) => {
  const input = entry?.inputData;
  if (!input || typeof input !== "object") return null;
  const asYesNo = (value) => (value === true || value === "Yes" || value === "true" ? "Yes" : "No");

  return normalizeDetailProfile(
    {
      age: Number(input.age ?? entry.age ?? defaultDetailProfile.age),
      consultationReason: normalizeDetailConsultationReason(
        input.consultationReason ?? input.consultReason ?? entry.consultationReason
      ),
      stress: asYesNo(input.stress),
      palpitations: asYesNo(input.palpitations),
      spp: asYesNo(input.spp),
      amg: asYesNo(input.amg),
      diarrhea: asYesNo(input.diarrhea),
      tremors: asYesNo(input.tremors),
      agitation: asYesNo(input.agitation),
      moodDisorder: asYesNo(input.moodDisorder),
      sleepDisorder: asYesNo(input.sleepDisorder),
      sweating: asYesNo(input.sweating ?? input.excessSweating),
      heatIntolerance: asYesNo(input.heatIntolerance),
      muscleWeakness: asYesNo(input.muscleWeakness),
      goiter: asYesNo(input.goiter),
      goiterClass: input.goiterClassification || defaultDetailProfile.goiterClass,
      tsh: Number(input.tsh ?? defaultDetailProfile.tsh),
      ft4: Number(input.ft4 ?? defaultDetailProfile.ft4),
      antiTpo: input.antiTPO || defaultDetailProfile.antiTpo,
      antiTpoTotal: Number(input.antiTPOtotal ?? defaultDetailProfile.antiTpoTotal),
      antiTg: input.antiTg || defaultDetailProfile.antiTg,
      tsi: input.TSI || defaultDetailProfile.tsi,
      tsiLevel: Number(input.TSIlevel ?? defaultDetailProfile.tsiLevel),
      ultrasound: normalizeDetailUltrasound(input.ultrasound),
      scintigraphy: normalizeDetailScintigraphy(input.scintigraphy),
      therapy: input.therapy || defaultDetailProfile.therapy,
      duration: Number(input.duration ?? entry.duration ?? defaultDetailProfile.duration),
      blockReplace: asYesNo(input.blockReplace),
      surgery: asYesNo(input.surgery),
      radioactiveIodine: asYesNo(input.radioactiveIodine),
    },
    entry
  );
};

const getDetailProfile = (entry) => {
  const inputProfile = buildDetailProfileFromInputData(entry);
  if (inputProfile) {
    return inputProfile;
  }
  if (storedDetailProfiles[entry.id]) {
    return normalizeDetailProfile(storedDetailProfiles[entry.id], entry);
  }
  if (baseDetailCatalog[entry.id]) {
    return normalizeDetailProfile(baseDetailCatalog[entry.id], entry);
  }
  return getGeneratedDetailProfile(entry);
};

const renderLoadingState = () => {
  const titleNode = document.querySelector("#detail-page-title");
  const summaryNode = document.querySelector("#detail-page-summary");
  const pillsNode = document.querySelector("#detail-page-pills");

  if (titleNode) titleNode.textContent = "Loading prediction record";
  if (summaryNode) {
    summaryNode.textContent = "The patient-level dossier is being retrieved from the clinical database.";
  }
  if (pillsNode) pillsNode.innerHTML = "";
};

const addDays = (dateString, days) => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date;
};

const formatTimelineDate = (date) =>
  date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const buildTimeline = (entry) => {
  const approvalCopy =
    entry.result === "Relapse"
      ? "Flagged for accelerated endocrine follow-up with elevated relapse probability."
      : "Published as a lower-risk profile for routine review planning.";

  const timeline = [
    {
      title: "Clinical data captured",
      copy: `${entry.source} intake completed and mapped into the physician review workspace.`,
      date: formatTimelineDate(addDays(entry.analyzedAt, -2)),
    },
    {
      title: "Prediction model executed",
      copy: `Relapse screening completed for ${entry.patient} with full probability scoring.`,
      date: formatTimelineDate(addDays(entry.analyzedAt, -1)),
    },
    {
      title: "Specialist review prepared",
      copy: "Most influential variables and patient-level interpretation assembled for clinical reading.",
      date: formatTimelineDate(new Date(entry.analyzedAt)),
    },
    {
      title: "Outcome shared",
      copy: approvalCopy,
      date: formatTimelineDate(addDays(entry.analyzedAt, 1)),
    },
  ];

  if (entry.actualOutcome && entry.validationStatus && entry.validationStatus !== "Pending") {
    timeline.push({
      title: "Real outcome recorded",
      copy:
        entry.validationStatus === "Correct"
          ? `Doctor confirmed the real result as ${entry.actualOutcome}, matching the prediction.`
          : `Doctor recorded the real result as ${entry.actualOutcome}, showing the prediction was incorrect.`,
      date: formatTimelineDate(new Date(entry.validationRecordedAt || addDays(entry.analyzedAt, 14))),
    });
  }

  return timeline;
};

const getValidationStatusMeta = (entry) => {
  const actualOutcome = entry.actualOutcome || "";
  const validationStatus = entry.validationStatus || "Pending";
  const recordedDate = entry.validationRecordedAt || "";

  if (!actualOutcome || validationStatus === "Pending") {
    return {
      predicted: entry.result,
      actual: "Awaiting confirmation",
      badgeLabel: "Pending Review",
      badgeTone: "pending",
      dateLabel: "Awaiting doctor update",
      copy: "No confirmed outcome has been saved yet. Record the observed patient result to validate this prediction.",
      actionLabel: "Record Real Outcome",
    };
  }

  return {
    predicted: entry.result,
    actual: actualOutcome,
    badgeLabel: validationStatus,
    badgeTone: validationStatus.toLowerCase(),
    dateLabel: recordedDate ? `Recorded ${formatDate(recordedDate, true)}` : "Recorded",
    copy:
      validationStatus === "Correct"
        ? `The confirmed patient outcome matches the model output. This case now supports validated model performance tracking.`
        : `The confirmed patient outcome differs from the model output. This case is stored as an incorrect prediction for review.`,
    actionLabel: "Update Real Outcome",
  };
};

const updateValidationPreview = () => {
  if (!validationPreviewNode || !detailEntry) return;

  const actualOutcome = validationOutcomeSelect?.value || "";
  validationPreviewNode.classList.remove("is-correct", "is-incorrect");

  if (!actualOutcome) {
    validationPreviewNode.textContent =
      "Select the confirmed outcome to preview whether this case will be saved as a correct or incorrect prediction.";
    return;
  }

  const isCorrect = actualOutcome === detailEntry.result;
  validationPreviewNode.classList.add(isCorrect ? "is-correct" : "is-incorrect");
  validationPreviewNode.innerHTML = isCorrect
    ? `<strong>Prediction will be marked correct.</strong> The confirmed outcome matches the predicted ${detailEntry.result.toLowerCase()} result.`
    : `<strong>Prediction will be marked incorrect.</strong> The confirmed outcome is ${actualOutcome.toLowerCase()}, which differs from the predicted ${detailEntry.result.toLowerCase()} result.`;
};

const closeDetailModals = () => {
  if (rerunConfirmationModal) rerunConfirmationModal.hidden = true;
  if (deletePredictionModal) deletePredictionModal.hidden = true;
  if (predictionValidationModal) predictionValidationModal.hidden = true;
  pendingRerunProfile = null;
  document.body.style.overflow = "";
};

const openDetailModal = (modal) => {
  if (!modal) return;
  closeDetailModals();
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

detailModalCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailModals);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetailModals();
  }
});

const formatTsh = (value) => `${Number(value).toFixed(2)} mIU/L`;
const formatFt4 = (value) => `${Number(value).toFixed(2)} ng/dL`;

const clearRerunWarning = () => {
  if (!rerunWarningNode) return;
  rerunWarningNode.hidden = true;
  rerunWarningNode.textContent = "";
};

const showRerunWarning = (message) => {
  if (!rerunWarningNode) return;
  rerunWarningNode.hidden = false;
  rerunWarningNode.textContent = message;
};

const mixImpactColor = (from, to, ratio) =>
  from.map((component, index) => Math.round(component + (to[index] - component) * ratio));

const impactGradientStyle = (value) => {
  const normalized = Math.max(0, Math.min(1, value / 100));
  const base = mixImpactColor([43, 110, 216], [207, 75, 69], normalized);
  const start = mixImpactColor(base, [16, 43, 84], 0.16);
  const end = mixImpactColor(base, [255, 255, 255], 0.18);
  return `--impact-start: rgb(${start.join(", ")}); --impact-end: rgb(${end.join(", ")});`;
};

const updateDetailTogglePresentation = (input) => {
  if (!input) return;
  const valueLabel = input.closest(".toggle-switch-control")?.querySelector(".toggle-switch-value");
  if (valueLabel) {
    valueLabel.textContent = input.checked ? "Yes" : "No";
  }
};

const updateDetailRangePresentation = (input) => {
  if (!input) return;

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const decimals = Number(input.dataset.rangeDecimals || 0);
  const target = document.getElementById(input.dataset.rangeTarget || "");
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  input.style.background = `linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%)`;

  if (target) {
    target.textContent = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }
};

const syncDetailChipSelectGroup = (group, value) => {
  if (!group) return;
  const hiddenInput = group.parentElement?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  hiddenInput.value = value;
  options.forEach((option) => {
    const isSelected = option.dataset.chipValue === value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
};

const initializeDetailChipSelect = (group) => {
  const hiddenInput = group.parentElement?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  syncDetailChipSelectGroup(group, hiddenInput.value || options[0].dataset.chipValue || "");

  options.forEach((option) => {
    option.addEventListener("click", () => {
      syncDetailChipSelectGroup(group, option.dataset.chipValue || "");
      clearRerunWarning();
    });
  });
};

const formatDetailValue = (key, value) => {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (key === "tsh") return formatTsh(value);
  if (key === "ft4") return formatFt4(value);
  if (key === "antiTpoTotal") return `${Number(value).toFixed(0)}`;
  if (key === "tsiLevel") return Number(value).toFixed(2);
  if (key === "duration") return `${value} months`;
  if (key === "age") return `${value} years`;
  return String(value);
};

const detailFieldLabels = {
  age: "Age",
  consultationReason: "Consultation reason",
  stress: "Stress",
  palpitations: "Palpitations",
  spp: "SPP",
  amg: "AMG",
  diarrhea: "Diarrhea",
  tremors: "Tremors",
  agitation: "Agitation",
  moodDisorder: "Mood disorder",
  sleepDisorder: "Sleep disorder",
  sweating: "Excess sweating",
  heatIntolerance: "Heat intolerance",
  muscleWeakness: "Muscle weakness",
  goiter: "Goiter",
  goiterClass: "Goiter classification",
  tsh: "TSH",
  ft4: "FT4",
  antiTpo: "Anti-TPO",
  antiTpoTotal: "Anti-TPO total",
  antiTg: "Anti-Tg",
  tsi: "TSI",
  tsiLevel: "TSI level",
  ultrasound: "Ultrasound",
  scintigraphy: "Scintigraphy",
  therapy: "Therapy",
  duration: "Duration",
  blockReplace: "Block and replace",
  surgery: "Surgery",
  radioactiveIodine: "Radioactive iodine",
};

const detailComparisonStepMap = {
  age: 1,
  duration: 1,
  tsh: 0.1,
  ft4: 0.1,
  antiTpoTotal: 10,
  tsiLevel: 0.1,
};

const normalizeDetailComparisonValue = (key, value) => {
  if (value === null || value === undefined) return "";

  if (Object.prototype.hasOwnProperty.call(detailComparisonStepMap, key)) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";

    const step = detailComparisonStepMap[key];
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    return Number((Math.round(numericValue / step) * step).toFixed(decimals));
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).trim();
};

const buildProfileDiff = (previousProfile, updatedProfile) =>
  Object.keys(detailFieldMap)
    .filter(
      (key) =>
        normalizeDetailComparisonValue(key, previousProfile[key]) !==
        normalizeDetailComparisonValue(key, updatedProfile[key])
    )
    .map((key) => ({
      key,
      label: detailFieldLabels[key] || key,
      previous: formatDetailValue(key, previousProfile[key]),
      next: formatDetailValue(key, updatedProfile[key]),
    }));

const scoreToImpactValue = (points) => Math.max(34, Math.min(88, Math.round(32 + Math.abs(points) * 3.1)));

const buildPredictionFromProfile = (profile) => {
  const contributions = [];
  let score = 18;

  const addContribution = (label, points, note, tone) => {
    if (!points) return;
    contributions.push({ label, points, note, tone });
    score += points;
  };

  addContribution("Stress", profile.stress === "Yes" ? 5 : 0, "Symptom burden increases instability", "warm");
  addContribution("Palpitations", profile.palpitations === "Yes" ? 6 : 0, "Clinical activity remains present", "warm");
  addContribution("SPP", profile.spp === "Yes" ? 4 : 0, "Additional clinical symptom burden", "warm");
  addContribution("AMG", profile.amg === "Yes" ? 5 : 0, "Systemic symptom signal remains present", "warm");
  addContribution("Diarrhea", profile.diarrhea === "Yes" ? 4 : 0, "Supports active hyperthyroid presentation", "warm");
  addContribution("Tremors", profile.tremors === "Yes" ? 6 : 0, "Ongoing symptom activity", "warm");
  addContribution("Agitation", profile.agitation === "Yes" ? 4 : 0, "Neurovegetative instability contributes to risk", "warm");
  addContribution("Mood disorder", profile.moodDisorder === "Yes" ? 3 : 0, "Behavioral symptoms remain clinically relevant", "warm");
  addContribution("Sleep disorder", profile.sleepDisorder === "Yes" ? 3 : 0, "Persistent symptoms affect recovery profile", "warm");
  addContribution("Excess sweating", profile.sweating === "Yes" ? 4 : 0, "Autonomic activity supports relapse concern", "warm");
  addContribution("Heat intolerance", profile.heatIntolerance === "Yes" ? 5 : 0, "Supports persistent hyperthyroid symptoms", "warm");
  addContribution("Muscle weakness", profile.muscleWeakness === "Yes" ? 4 : 0, "Functional burden supports closer monitoring", "warm");
  addContribution("Goiter", profile.goiter === "Yes" ? 6 : -2, profile.goiter === "Yes" ? "Structural thyroid burden remains present" : "No major structural burden", profile.goiter === "Yes" ? "warm" : "cool");

  const goiterScoreMap = { "0": -4, "1A": 2, "1B": 6, "2": 10, "3": 14 };
  addContribution(
    `Goiter class ${profile.goiterClass}`,
    goiterScoreMap[profile.goiterClass] ?? 0,
    profile.goiterClass === "0" ? "Lower structural recurrence concern" : "Severity contributes to relapse monitoring",
    profile.goiterClass === "0" ? "cool" : "warm"
  );

  const tsh = Number(profile.tsh);
  if (tsh < 0.1) addContribution("Suppressed TSH", 16, "Biological relapse signal", "warm");
  else if (tsh < 0.3) addContribution("Low TSH", 12, "Hyperthyroid pattern persists", "warm");
  else if (tsh < 0.5) addContribution("Borderline low TSH", 8, "Mild biological concern", "warm");
  else if (tsh < 1) addContribution("Near-normal TSH", 4, "Limited residual variability", "warm");
  else addContribution("Normalized TSH", -10, "Protective stability factor", "cool");

  const ft4 = Number(profile.ft4);
  if (ft4 > 2) addContribution("Elevated FT4", 14, "Hormonal activity remains high", "warm");
  else if (ft4 > 1.6) addContribution("Raised FT4", 10, "Moderate biological activity", "warm");
  else if (ft4 > 1.2) addContribution("Upper-normal FT4", 4, "Borderline activity", "warm");
  else addContribution("Stable FT4", -8, "Favorable biological context", "cool");

  addContribution("Anti-TPO", profile.antiTpo === "Positive" ? 8 : -4, profile.antiTpo === "Positive" ? "Autoimmune activity contributes to risk" : "Lower autoimmune pressure", profile.antiTpo === "Positive" ? "warm" : "cool");
  const antiTpoTotal = Number(profile.antiTpoTotal);
  if (antiTpoTotal >= 400) addContribution("Anti-TPO total", 10, "High antibody load supports relapse concern", "warm");
  else if (antiTpoTotal >= 150) addContribution("Anti-TPO total", 5, "Moderate antibody activity", "warm");
  else addContribution("Anti-TPO total", -3, "Lower antibody burden", "cool");
  addContribution("Anti-Tg", profile.antiTg === "Positive" ? 6 : -3, profile.antiTg === "Positive" ? "Additional antibody burden" : "Reduced antibody activity", profile.antiTg === "Positive" ? "warm" : "cool");
  addContribution("TSI", profile.tsi === "Positive" ? 16 : -8, profile.tsi === "Positive" ? "Dominant relapse driver" : "Reduced immunological drive", profile.tsi === "Positive" ? "warm" : "cool");
  const tsiLevel = Number(profile.tsiLevel);
  if (tsiLevel >= 4) addContribution("TSI level", 12, "High stimulating immunological activity", "warm");
  else if (tsiLevel >= 2) addContribution("TSI level", 7, "Moderate stimulating activity", "warm");
  else addContribution("TSI level", -4, "Lower stimulating antibody burden", "cool");

  const ultrasoundPoints = {
    "Diffuse goiter with vascular pattern": 8,
    "Diffuse goiter": 8,
    "Goiter with nodules": 10,
    "Mild heterogeneous texture": 4,
    "Normal thyroid volume": -6,
  };
  addContribution(
    "Ultrasound pattern",
    ultrasoundPoints[profile.ultrasound] ?? 0,
    profile.ultrasound === "Normal thyroid volume" ? "Favorable imaging context" : "Imaging pattern remains clinically relevant",
    profile.ultrasound === "Normal thyroid volume" ? "cool" : "warm"
  );

  const scintigraphyPoints = {
    "High uptake": 10,
    "Hot nodule": 7,
    "Normal uptake": -5,
  };
  addContribution(
    "Scintigraphy",
    scintigraphyPoints[profile.scintigraphy] ?? 0,
    profile.scintigraphy === "Normal uptake" ? "Lower activity on imaging" : "Scintigraphy supports ongoing thyroid activity",
    profile.scintigraphy === "Normal uptake" ? "cool" : "warm"
  );

  const treatmentPoints = {
    "Antithyroid therapy": 5,
    "Block and replace": 7,
    "Maintenance monitoring": 1,
    "Observation plan": 2,
  };
  addContribution("Treatment context", treatmentPoints[profile.therapy] ?? 0, "Current therapy contributes to prediction context", "warm");

  const duration = Number(profile.duration);
  if (duration < 12) addContribution("Short treatment duration", 8, "Shorter duration may increase relapse likelihood", "warm");
  else if (duration < 24) addContribution("Intermediate treatment duration", 4, "Moderate follow-up protection", "warm");
  else addContribution("Long treatment duration", -6, "Longer treatment duration helps stabilize risk", "cool");

  addContribution("Block and replace", profile.blockReplace === "Yes" ? 4 : 0, "Complex treatment context remains relevant", "warm");
  addContribution("Surgery", profile.surgery === "Yes" ? -18 : 0, "Surgical management lowers residual relapse burden", "cool");
  addContribution("Radioactive iodine", profile.radioactiveIodine === "Yes" ? -12 : 0, "Radioactive iodine reduces residual risk", "cool");

  const probability = Math.max(8, Math.min(92, Math.round(score)));
  const result = probability >= 55 ? "Relapse" : "No Relapse";

  const sortedContributions = contributions
    .filter((item) => item.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 4)
    .map((item) => ({
      label: item.label,
      note: item.note,
      tone: item.tone,
      value: scoreToImpactValue(item.points),
    }));

  const note =
    result === "Relapse"
      ? "Updated clinical entry keeps the patient in an elevated relapse band and supports closer endocrine follow-up."
      : "Updated clinical entry lowers the relapse signal and supports routine monitoring with continued physician oversight.";

  return { probability, result, impacts: sortedContributions, note };
};

const renderMissingState = () => {
  const main = document.querySelector("#prediction-details-main");
  if (!main) return;

  const returnAction = isDatasetSelectionReturn()
    ? `<a class="btn btn-secondary btn-sm" href="${getDetailReturnUrl()}">Back to Data Selection</a>`
    : "";

  main.innerHTML = `
      <section class="surface-card details-empty-state">
        <span class="prediction-page-kicker">Prediction details</span>
        <h1>Patient record not found</h1>
        <p>The selected prediction could not be loaded. Return to history and choose another patient record.</p>
        <div class="prediction-page-hero-actions">
          ${returnAction}
          <a class="btn btn-secondary btn-sm" href="history.html">Back to History</a>
          <a class="btn btn-primary btn-sm" href="dashboard.html">Open Dashboard</a>
        </div>
      </section>
    `;
};

const renderDetails = (entry) => {
  const profile = getDetailProfile(entry);
  const derived = buildPredictionFromProfile(profile);
  const badge = getPredictionBadge(entry);
  const titleNode = document.querySelector("#detail-page-title");
  const summaryNode = document.querySelector("#detail-page-summary");
  const pillsNode = document.querySelector("#detail-page-pills");
  const recordChipNode = document.querySelector("#detail-record-chip");
  const statGridNode = document.querySelector("#detail-stat-grid");
  const clinicalGridNode = document.querySelector("#detail-clinical-grid");
  const timelineNode = document.querySelector("#detail-timeline");
  const outcomeBadgeNode = document.querySelector("#detail-outcome-badge");
  const outcomeProbabilityNode = document.querySelector("#detail-outcome-probability");
  const outcomeLabelNode = document.querySelector("#detail-outcome-label");
  const outcomeBarNode = document.querySelector("#detail-outcome-bar");
  const outcomeCopyNode = document.querySelector("#detail-outcome-copy");
  const impactListNode = document.querySelector("#detail-impact-list");
  const validationState = getValidationStatusMeta(entry);

  if (titleNode) titleNode.textContent = `${entry.patient} Clinical Prediction Report`;
  if (summaryNode) {
    summaryNode.textContent =
      entry.result === "Relapse"
        ? `${entry.patient} presents an elevated relapse profile after ${entry.source.toLowerCase()} review, requiring closer endocrine surveillance and a structured physician follow-up plan.`
        : `${entry.patient} currently presents a lower relapse profile after ${entry.source.toLowerCase()} review, supporting routine monitoring with continued physician oversight.`;
  }

  if (pillsNode) {
    pillsNode.innerHTML = `
      <span class="dashboard-pill">${entry.id}</span>
      <span class="dashboard-pill">${entry.age} years / ${entry.sex}</span>
      <span class="dashboard-pill">${entry.source}</span>
      <span class="dashboard-pill">${formatDate(entry.analyzedAt, true)}</span>
    `;
  }

  if (recordChipNode) recordChipNode.textContent = profile.consultationReason;
  populateInlineForm(profile);
  clearRerunWarning();

  if (statGridNode) {
    const statItems = [
      ["Patient ID", entry.id],
      ["Age / Sex", `${entry.age} years / ${entry.sex}`],
      ["Input source", entry.source],
      ["Review date", formatDate(entry.analyzedAt, true)],
      ["Consultation reason", profile.consultationReason],
      ["Current result", badge.label],
      ["Probability", `${entry.probability}%`],
      ["Monitoring plan", entry.result === "Relapse" ? "Closer follow-up" : "Routine monitoring"],
    ];

    statGridNode.innerHTML = statItems
      .map(
        ([label, value]) => `
          <article class="details-stat-card">
            <span>${label}</span>
            <strong>${value}</strong>
          </article>
        `
      )
      .join("");
  }

  if (clinicalGridNode) {
    const sections = [
      {
        title: "Patient Information",
        items: [
          ["Patient name", entry.patient],
          ["Age", `${profile.age} years`],
          ["Consultation reason", profile.consultationReason],
        ],
      },
      {
        title: "Symptoms / Clinical",
        items: [
          ["Stress", profile.stress],
          ["Palpitations", profile.palpitations],
          ["SPP", profile.spp],
          ["AMG", profile.amg],
          ["Diarrhea", profile.diarrhea],
          ["Tremors", profile.tremors],
          ["Agitation", profile.agitation],
          ["Mood disorder", profile.moodDisorder],
          ["Sleep disorder", profile.sleepDisorder],
          ["Excess sweating", profile.sweating],
          ["Heat intolerance", profile.heatIntolerance],
          ["Muscle weakness", profile.muscleWeakness],
        ],
      },
      {
        title: "Thyroid Examination",
        items: [
          ["Goiter", profile.goiter],
          ["Goiter classification", profile.goiterClass],
        ],
      },
      {
        title: "Imaging",
        items: [
          ["Ultrasound", profile.ultrasound],
          ["Scintigraphy", profile.scintigraphy],
        ],
      },
      {
        title: "Biology",
        items: [
          ["TSH", formatTsh(profile.tsh)],
          ["FT4", formatFt4(profile.ft4)],
          ["Anti-TPO", profile.antiTpo],
          ["Anti-TPO total", `${Number(profile.antiTpoTotal).toFixed(0)}`],
          ["Anti-Tg", profile.antiTg],
          ["TSI", profile.tsi],
          ["TSI level", Number(profile.tsiLevel).toFixed(2)],
        ],
      },
      {
        title: "Treatment",
        items: [
          ["Therapy", profile.therapy],
          ["Duration", `${profile.duration} months`],
          ["Block and replace", profile.blockReplace],
          ["Surgery", profile.surgery],
          ["Radioactive iodine", profile.radioactiveIodine],
        ],
      },
    ];

    clinicalGridNode.innerHTML = sections
      .map(
        (section) => `
          <article class="details-clinical-card">
            <h3>${section.title}</h3>
            <div class="details-definition-list">
              ${section.items
                .map(
                  ([label, value]) => `
                    <div class="details-definition-row">
                      <span>${label}</span>
                      <strong>${value}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  }

  if (timelineNode) {
    timelineNode.innerHTML = buildTimeline(entry)
      .map(
        (item) => `
          <article class="details-timeline-item">
            <span class="details-timeline-marker" aria-hidden="true"></span>
            <div class="details-timeline-copy">
              <div class="details-timeline-head">
                <strong>${item.title}</strong>
                <span>${item.date}</span>
              </div>
              <p>${item.copy}</p>
            </div>
          </article>
        `
      )
      .join("");
  }

  if (outcomeBadgeNode) {
    outcomeBadgeNode.className = `prediction-badge ${badge.tone}`;
    outcomeBadgeNode.textContent = badge.label;
  }
  if (outcomeProbabilityNode) outcomeProbabilityNode.textContent = `${entry.probability}%`;
  if (outcomeLabelNode) outcomeLabelNode.textContent = entry.result === "Relapse" ? "Will Relapse" : "Will Not Relapse";
  if (outcomeBarNode) outcomeBarNode.style.width = `${entry.probability}%`;
  if (outcomeCopyNode) outcomeCopyNode.textContent = derived.note;

  if (validationPredictedNode) validationPredictedNode.textContent = validationState.predicted;
  if (validationActualNode) validationActualNode.textContent = validationState.actual;
  if (validationStatusHeadingNode) validationStatusHeadingNode.textContent = validationState.badgeLabel;
  if (validationBadgeNode) {
    validationBadgeNode.className = `details-validation-badge ${validationState.badgeTone}`;
    validationBadgeNode.textContent = validationState.badgeLabel;
  }
  if (validationDateNode) validationDateNode.textContent = validationState.dateLabel;
  if (validationCopyNode) validationCopyNode.textContent = validationState.copy;
  if (openValidationModalButton) openValidationModalButton.textContent = validationState.actionLabel;

  if (impactListNode) {
    impactListNode.innerHTML = derived.impacts
      .map(
        (impact) => `
          <article class="impact-card-item">
            <div class="impact-card-head">
              <strong>${impact.label}</strong>
              <span>${impact.note} · ${impact.value}%</span>
            </div>
            <div class="impact-card-bar" aria-hidden="true">
              <i class="${impact.tone === "warm" ? "is-warm" : "is-cool"}" style="width:${impact.value}%; ${impactGradientStyle(impact.value)}"></i>
            </div>
          </article>
        `
      )
      .join("");
  }
};

const populateInlineForm = (profile) => {
  if (rerunPatientNameInput && detailEntry) {
    rerunPatientNameInput.value = detailEntry.patient || detailEntry.patientName || "";
  }

  Object.entries(detailFieldMap).forEach(([key, selector]) => {
    const field = document.querySelector(selector);
    if (!field) return;

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = profile[key] === "Yes";
      updateDetailTogglePresentation(field);
      return;
    }

    field.value = profile[key];

    if (field instanceof HTMLInputElement && field.type === "hidden") {
      syncDetailChipSelectGroup(field.parentElement?.querySelector(".detail-chip-select-group"), profile[key]);
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "range") {
      updateDetailRangePresentation(field);
    }
  });
};

const collectRerunProfile = () => {
  const collected = {};
  Object.entries(detailFieldMap).forEach(([key, selector]) => {
    const field = document.querySelector(selector);
    if (!field) return;

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      collected[key] = field.checked ? "Yes" : "No";
      return;
    }

    collected[key] = field.value;
  });

  return {
    ...collected,
    age: Number(collected.age),
    tsh: Number(collected.tsh),
    ft4: Number(collected.ft4),
    antiTpoTotal: Number(collected.antiTpoTotal),
    tsiLevel: Number(collected.tsiLevel),
    duration: Number(collected.duration),
  };
};

const buildRerunPayloadFromProfile = (profile) => {
  const originalInput = detailEntry?.inputData && typeof detailEntry.inputData === "object" ? detailEntry.inputData : {};

  return {
    ...originalInput,
    rerunPrediction: true,
    name: detailEntry?.patient || detailEntry?.patientName || "",
    age: Number(profile.age),
    sex: detailEntry?.sex || originalInput.sex || "Not specified",
    consultationReason: profile.consultationReason,
    stress: profile.stress,
    palpitations: profile.palpitations,
    spp: profile.spp,
    amg: profile.amg,
    diarrhea: profile.diarrhea,
    tremors: profile.tremors,
    agitation: profile.agitation,
    moodDisorder: profile.moodDisorder,
    sleepDisorder: profile.sleepDisorder,
    sweating: profile.sweating,
    heatIntolerance: profile.heatIntolerance,
    muscleWeakness: profile.muscleWeakness,
    goiter: profile.goiter,
    goiterClassification: profile.goiterClass,
    tsh: Number(profile.tsh),
    ft4: Number(profile.ft4),
    antiTpo: profile.antiTpo,
    antiTpoTotal: Number(profile.antiTpoTotal),
    antiTg: profile.antiTg,
    tsi: profile.tsi,
    tsiLevel: Number(profile.tsiLevel),
    ultrasound: profile.ultrasound,
    scintigraphy: profile.scintigraphy,
    therapy: profile.therapy,
    duration: Number(profile.duration),
    blockReplace: profile.blockReplace,
    surgery: profile.surgery,
    radioactiveIodine: profile.radioactiveIodine,
    source: detailEntry?.source || originalInput.source || "Manual",
  };
};

const openRerunConfirmation = () => {
  if (!detailEntry || !inlineClinicalEntryForm || !inlineClinicalEntryForm.reportValidity()) return;

  const previousProfile = getDetailProfile(detailEntry);
  const updatedProfile = collectRerunProfile();
  const changes = buildProfileDiff(previousProfile, updatedProfile);

  if (!changes.length) {
    showRerunWarning("No changes were made to the Clinical Entry.");
    return;
  }

  clearRerunWarning();

  if (rerunSummaryCopy) {
    rerunSummaryCopy.innerHTML = changes.length
      ? `<strong>${changes.length} variable${changes.length > 1 ? "s" : ""} changed</strong><span>Review the previous and updated values before confirming the new prediction run for ${detailEntry.patient}.</span>`
      : `<strong>No clinical variables changed</strong><span>You can still confirm to run the prediction again with the current stored Clinical Entry.</span>`;
  }

  if (rerunChangeList) {
    rerunChangeList.innerHTML = changes.length
      ? changes
          .map(
            (change) => `
              <article class="details-change-item">
                <strong>${change.label}</strong>
                <div class="details-change-values">
                  <span><em>Previous</em>${change.previous}</span>
                  <span><em>Updated</em>${change.next}</span>
                </div>
              </article>
            `
          )
          .join("")
      : `
          <article class="details-change-item details-change-item-empty">
            <strong>Current values preserved</strong>
            <div class="details-change-values">
              <span><em>Status</em>No changes detected in the Clinical Entry.</span>
            </div>
          </article>
        `;
  }

  openDetailModal(rerunConfirmationModal);
  pendingRerunProfile = updatedProfile;
};

const openDeletePredictionModal = () => {
  if (!detailEntry || !deleteSummaryNode) return;

  deleteSummaryNode.innerHTML = `
    <strong>${detailEntry.patient}</strong>
    <span>${detailEntry.id} · ${detailEntry.probability}% probability · ${detailEntry.result}</span>
  `;
  openDetailModal(deletePredictionModal);
};

const openValidationModal = () => {
  if (!detailEntry || !predictionValidationModal) return;

  const currentStatus = getValidationStatusMeta(detailEntry);
  const predictionBadge = getPredictionBadge(detailEntry);
  const currentOutcomeLabel = detailEntry.actualOutcome || "Awaiting confirmation";
  const currentOutcomeMeta = detailEntry.actualOutcome ? currentStatus.dateLabel : "No confirmed outcome saved yet";

  if (validationModalSummary) {
    validationModalSummary.innerHTML = `
      <div class="details-validation-summary-head">
        <div>
          <strong>${detailEntry.patient}</strong>
          <span>${detailEntry.id} | Reviewed ${formatDate(detailEntry.analyzedAt, true)}</span>
        </div>
        <span class="prediction-badge ${predictionBadge.tone}">${predictionBadge.label}</span>
      </div>
      <div class="details-validation-summary-grid">
        <article class="details-validation-summary-item">
          <span>Predicted outcome</span>
          <strong>${detailEntry.result}</strong>
          <small>${detailEntry.probability}% probability</small>
        </article>
        <article class="details-validation-summary-item">
          <span>Current real outcome</span>
          <strong>${currentOutcomeLabel}</strong>
          <small>${currentOutcomeMeta}</small>
        </article>
      </div>
    `;
  }

  if (validationOutcomeSelect) {
    validationOutcomeSelect.value = detailEntry.actualOutcome || "";
  }

  updateValidationPreview();
  openDetailModal(predictionValidationModal);
};

openRerunPredictionButton?.addEventListener("click", openRerunConfirmation);
openDeletePredictionButton?.addEventListener("click", openDeletePredictionModal);
openValidationModalButton?.addEventListener("click", openValidationModal);
inlineClinicalEntryForm?.addEventListener("input", clearRerunWarning);
inlineClinicalEntryForm?.addEventListener("change", clearRerunWarning);
validationOutcomeSelect?.addEventListener("input", updateValidationPreview);
validationOutcomeSelect?.addEventListener("change", updateValidationPreview);

detailToggleInputs.forEach((input) => {
  updateDetailTogglePresentation(input);
  input.addEventListener("change", () => {
    updateDetailTogglePresentation(input);
  });
});

detailRangeInputs.forEach((input) => {
  updateDetailRangePresentation(input);
  input.addEventListener("input", () => {
    updateDetailRangePresentation(input);
  });
});

detailChipSelectGroups.forEach(initializeDetailChipSelect);

confirmRerunPredictionButton?.addEventListener("click", async () => {
  if (!detailEntry || !pendingRerunProfile) return;

  const updatedProfile = pendingRerunProfile;
  const payload = buildRerunPayloadFromProfile(updatedProfile);
  const previousLabel = confirmRerunPredictionButton.textContent;

  confirmRerunPredictionButton.disabled = true;
  confirmRerunPredictionButton.textContent = "Re-running...";

  try {
    const updated = await updatePredictionDetailsEntry(detailEntry.id, payload);

    storedDetailProfiles[detailEntry.id] = updatedProfile;
    persistDetailProfiles();

    detailEntry = normalizePredictionDetailsEntry(updated);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    closeDetailModals();
    renderDetails(detailEntry);
    showPredictionDetailsToast("Prediction updated successfully.");
  } catch (error) {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to re-run the prediction.",
      "danger"
    );
  } finally {
    confirmRerunPredictionButton.disabled = false;
    confirmRerunPredictionButton.textContent = previousLabel;
  }
});

confirmValidationResultButton?.addEventListener("click", async () => {
  if (!detailEntry || !validationOutcomeSelect) return;

  const actualOutcome = validationOutcomeSelect.value;
  if (!actualOutcome) {
    validationOutcomeSelect.reportValidity();
    updateValidationPreview();
    return;
  }

  const previousLabel = confirmValidationResultButton.textContent;
  confirmValidationResultButton.disabled = true;
  confirmValidationResultButton.textContent = "Saving...";

  try {
    const updated = await updatePredictionDetailsEntry(detailEntry.id, { actualOutcome });
    detailEntry = normalizePredictionDetailsEntry(updated);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    closeDetailModals();
    renderDetails(detailEntry);
    showPredictionDetailsToast("Real outcome saved successfully.");
  } catch (error) {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to save the confirmed outcome.",
      "danger"
    );
    if (validationPreviewNode) {
      validationPreviewNode.classList.remove("is-correct", "is-incorrect");
      validationPreviewNode.textContent =
        error instanceof Error ? error.message : "Unable to save the confirmed outcome.";
    }
  } finally {
    confirmValidationResultButton.disabled = false;
    confirmValidationResultButton.textContent = previousLabel;
  }
});

confirmDeletePredictionButton?.addEventListener("click", () => {
  if (!detailEntry) return;

  delete storedDetailProfiles[detailEntry.id];
  persistDetailProfiles();

  const deleted = deletePredictionRecordById(detailEntry.id);
  if (!deleted) return;

  window.location.href = "history.html";
});

const loadPredictionDetailsPage = async () => {
  if (!detailId) {
    renderMissingState();
    return;
  }

  if (detailEntry) {
    detailEntry = normalizePredictionDetailsEntry(detailEntry);
    renderDetails(detailEntry);
  } else {
    renderLoadingState();
  }

  try {
    const remoteEntry = await requestPredictionDetailsEntry(detailId);
    detailEntry = normalizePredictionDetailsEntry(remoteEntry);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    renderDetails(detailEntry);
  } catch (error) {
    if (detailEntry) {
      return;
    }
    renderMissingState();
  }
};

loadPredictionDetailsPage();
