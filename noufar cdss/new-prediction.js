const predictionSidebar = document.querySelector(".sidebar");
const predictionMobileButton = document.querySelector(".mobile-nav-button");
const predictionForm = document.querySelector("#prediction-form");
const runPredictionButton = document.querySelector("#run-prediction-button");
const predictionFormNote = document.querySelector("#prediction-form-note");
const outcomeCard = document.querySelector(".outcome-card");
const outcomeState = document.querySelector("#outcome-state");
const outcomeHeading = document.querySelector("#outcome-heading");
const outcomeText = document.querySelector("#outcome-text");
const outcomeBadge = document.querySelector("#outcome-badge");
const outcomeProbability = document.querySelector("#outcome-probability");
const outcomeBar = document.querySelector("#outcome-bar");
const outcomeSummary = document.querySelector("#outcome-summary");
const printReportButton = document.querySelector("#print-report-button");
const impactList = document.querySelector("#impact-list");
const impactEmpty = document.querySelector("#impact-empty");
const datasetFile = document.querySelector("#dataset-file");
const fileName = document.querySelector("#file-name");
const uploadDropzone = document.querySelector("#upload-dropzone");
const uploadDropHint = document.querySelector("#upload-drop-hint");
const uploadButtonLabel = document.querySelector("#upload-button-label");
const uploadError = document.querySelector("#upload-error");
const uploadSuccess = document.querySelector("#upload-success");
const uploadSuccessText = document.querySelector("#upload-success-text");
const choosePatientButton = document.querySelector("#choose-patient-button");
const recentUploadSearch = document.querySelector("#recent-upload-search");
const recentUploadList = document.querySelector("#recent-upload-list");
const allUploadsModal = document.querySelector("#all-uploads-modal");
const allUploadsList = document.querySelector("#all-uploads-list");
const allUploadsMeta = document.querySelector("#all-uploads-meta");
const allUploadsSearch = document.querySelector("#all-uploads-search");
const allUploadsCloseButtons = document.querySelectorAll("[data-close-all-uploads]");
const viewAllUploadsBtn = document.querySelector("#view-all-uploads-btn");
const consultModal = document.querySelector("#consult-modal");
const consultTitle = document.querySelector("#consult-title");
const consultMeta = document.querySelector("#consult-meta");
const consultHead = document.querySelector("#consult-head");
const consultBody = document.querySelector("#consult-body");
const consultPagination = document.querySelector("#consult-pagination");
const deleteModal = document.querySelector("#delete-modal");
const confirmDeleteButton = document.querySelector("#confirm-delete-button");
const deleteFileCopy = document.querySelector("#delete-file-copy");
const consultCloseButtons = document.querySelectorAll("[data-close-consult]");
const deleteCloseButtons = document.querySelectorAll("[data-close-delete]");
const duplicatePredictionModal = document.querySelector("#duplicate-prediction-modal");
const duplicatePredictionCopy = document.querySelector("#duplicate-prediction-copy");
const duplicatePredictionViewButton = document.querySelector("#duplicate-prediction-view");
const duplicatePredictionOkButton = document.querySelector("#duplicate-prediction-ok");
const duplicateCloseButtons = document.querySelectorAll("[data-close-duplicate]");
const serviceErrorModal = document.querySelector("#service-error-modal");
const serviceErrorCopy = document.querySelector("#service-error-copy");
const serviceErrorOkButton = document.querySelector("#service-error-ok");
const serviceErrorSupportButton = document.querySelector("#service-error-support");
const serviceErrorCloseButtons = document.querySelectorAll("[data-close-service-error]");
const predictionToggleInputs = Array.from(document.querySelectorAll(".toggle-switch-input"));
const predictionRangeInputs = Array.from(document.querySelectorAll(".range-input"));
const predictionChipSelectGroups = Array.from(document.querySelectorAll(".chip-select-group"));

const {
  loadUploads,
  addUpload,
  getUploadById,
  deleteUpload,
  formatFileSize,
  paginate,
  filterRows,
  parseWorkbookFile,
  createUploadRecord,
  predictionBadge,
} = window.NoufarApp;

const predictionDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const predictionApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

let latestUploadId = null;
let recentSearchTerm = "";
let recentSortTerm = "newest";
let consultUploadId = null;
let consultPage = 1;
let deleteTargetId = null;
let latestPredictionResult = null;
let duplicatePredictionId = "";
let aiServiceWasUnavailable = false;
const allowedUploadExtensions = [".csv", ".xlsx", ".xls"];

const showManualPredictionToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const showUploadDeleteToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const getPredictionDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(predictionDoctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const buildManualPredictionPayload = () => Object.fromEntries(buildPredictionFormData().entries());

const setPredictionLoadingState = (isLoading) => {
  if (runPredictionButton) {
    runPredictionButton.disabled = isLoading;
    runPredictionButton.textContent = isLoading ? "Running..." : "Run Prediction";
  }

  if (!predictionFormNote || !isLoading) return;

  predictionFormNote.classList.remove("is-error", "is-ready");
  predictionFormNote.textContent = "Prediction in progress. The backend is contacting the AI service...";
};

const revealPredictionOutcome = () => {
  if (!outcomeCard) return;

  window.requestAnimationFrame(() => {
    outcomeCard.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });
};

const requestManualPrediction = async () => {
  const session = getPredictionDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${predictionApiBaseUrl}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildManualPredictionPayload()),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Unable to run the AI prediction.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const predictionReportSections = [
  {
    title: "Patient Information",
    fields: [
      ["name", "Patient name"],
      ["age", "Age"],
    ],
  },
  {
    title: "Symptoms and Clinical",
    fields: [
      ["consultationReason", "Consultation reason"],
      ["stress", "Stress"],
      ["palpitations", "Palpitations"],
      ["spp", "SPP"],
      ["amg", "AMG"],
      ["diarrhea", "Diarrhea"],
      ["tremors", "Tremors"],
      ["agitation", "Agitation"],
      ["moodDisorder", "Mood disorder"],
      ["sleepDisorder", "Sleep disorder"],
      ["sweating", "Excess sweating"],
      ["heatIntolerance", "Heat intolerance"],
      ["muscleWeakness", "Muscle weakness"],
    ],
  },
  {
    title: "Thyroid Examination",
    fields: [
      ["goiter", "Goiter"],
      ["goiterClassification", "Goiter classification"],
    ],
  },
  {
    title: "Biology",
    fields: [
      ["tsh", "TSH"],
      ["ft4", "FT4"],
      ["antiTpo", "Anti-TPO"],
      ["antiTpoTotal", "Anti-TPO total"],
      ["antiTg", "Anti-Tg"],
      ["tsi", "TSI"],
      ["tsiLevel", "TSI level"],
    ],
  },
  {
    title: "Imaging",
    fields: [
      ["ultrasound", "Ultrasound"],
      ["scintigraphy", "Scintigraphy"],
    ],
  },
  {
    title: "Treatment",
    fields: [
      ["therapy", "Therapy"],
      ["blockReplace", "Block and replace"],
      ["duration", "Duration of treatment"],
      ["surgery", "Surgery"],
      ["radioactiveIodine", "Radioactive iodine"],
    ],
  },
];

const getEmbeddedReportLogo = () => {
  const logoImage = document.querySelector(".sidebar-logo-image");
  if (!(logoImage instanceof HTMLImageElement) || !logoImage.complete || !logoImage.naturalWidth) {
    return "";
  }

  try {
    const canvas = document.createElement("canvas");
    const size = Math.max(logoImage.naturalWidth, logoImage.naturalHeight);
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");

    if (!context) return "";

    const drawWidth = logoImage.naturalWidth;
    const drawHeight = logoImage.naturalHeight;
    const offsetX = (size - drawWidth) / 2;
    const offsetY = (size - drawHeight) / 2;

    context.clearRect(0, 0, size, size);
    context.drawImage(logoImage, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
};

const escapeReportHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getPredictionReportData = () => {
  if (!predictionForm) return [];

  const formData = buildPredictionFormData();
  return predictionReportSections
    .map((section) => ({
      title: section.title,
      rows: section.fields.map(([name, label]) => {
        const rawValue = formData.get(name);
        const value =
          rawValue === null || rawValue === "" ? "Not provided" : `${rawValue}${name === "duration" ? " months" : ""}`;
        return { label, value };
      }),
    }))
    .filter((section) => section.rows.length);
};

const buildPredictionReportMarkup = (result) => {
  const badge = predictionBadge(result);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const sections = getPredictionReportData();
  const logoSrc = getEmbeddedReportLogo();
  const impactsMarkup = result.contributions.length
    ? result.contributions
        .map(
          (item) => `
            <tr>
              <td>${escapeReportHtml(item.label)}</td>
              <td>${escapeReportHtml(item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk")}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="2">No strong explanatory drivers were detected from the current inputs.</td>
      </tr>
    `;

  const sectionMarkup = sections
    .map(
      (section) => `
        <section class="report-section">
          <div class="report-section-head">${escapeReportHtml(section.title)}</div>
          <table class="report-table">
            <tbody>
              ${section.rows
                .map(
                  (row) => `
                    <tr>
                      <th>${escapeReportHtml(row.label)}</th>
                      <td>${escapeReportHtml(row.value)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>NOUFAR CDSS | Prediction Report</title>
        <style>
          :root {
            color-scheme: light;
            --ink: #16345b;
            --muted: #6580a0;
            --line: #dce6f3;
            --panel: #f7fbff;
            --blue: #2d71d3;
            --red: #de5147;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            font-family: Arial, Helvetica, sans-serif;
            color: var(--ink);
            background: #ffffff;
          }
          .report-shell {
            max-width: 960px;
            margin: 0 auto;
          }
          .report-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 24px;
            border-bottom: 2px solid #eef3fb;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .brand img {
            width: 58px;
            height: 58px;
            object-fit: contain;
          }
          .brand strong {
            display: block;
            font-size: 24px;
            line-height: 1.1;
          }
          .brand span,
          .report-meta span {
            display: block;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
          }
          .report-summary {
            display: grid;
            grid-template-columns: 1.25fr 0.85fr;
            gap: 20px;
            margin: 28px 0 24px;
          }
          .summary-card,
          .result-card {
            padding: 20px 22px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: linear-gradient(180deg, #ffffff 0%, var(--panel) 100%);
          }
          .summary-card h1 {
            margin: 0 0 10px;
            font-size: 28px;
            line-height: 1.15;
          }
          .summary-card p,
          .result-copy,
          .report-note {
            margin: 0;
            color: var(--muted);
            line-height: 1.7;
            font-size: 14px;
          }
          .result-badge {
            display: inline-flex;
            align-items: center;
            min-height: 34px;
            padding: 0 14px;
            border-radius: 999px;
            color: #fff;
            font-weight: 700;
            font-size: 13px;
            background: ${result.relapse ? "var(--red)" : "var(--blue)"};
          }
          .result-score {
            margin: 14px 0 8px;
            font-size: 42px;
            font-weight: 800;
            letter-spacing: -0.03em;
          }
          .report-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .report-section {
            border: 1px solid var(--line);
            border-radius: 18px;
            overflow: hidden;
            background: #fff;
          }
          .report-section-head {
            padding: 14px 18px;
            background: #f5f9ff;
            border-bottom: 1px solid var(--line);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--blue);
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
          }
          .report-table th,
          .report-table td {
            padding: 12px 18px;
            border-bottom: 1px solid #edf2f8;
            text-align: left;
            vertical-align: top;
            font-size: 14px;
          }
          .report-table th {
            width: 42%;
            color: #456483;
            font-weight: 700;
          }
          .report-table tr:last-child th,
          .report-table tr:last-child td {
            border-bottom: none;
          }
          .impact-wrapper {
            margin-top: 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            overflow: hidden;
          }
          .impact-head {
            padding: 14px 18px;
            background: #f5f9ff;
            border-bottom: 1px solid var(--line);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--blue);
          }
          @media print {
            body { padding: 16px; }
            .report-shell { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="report-shell">
          <header class="report-head">
            <div class="brand">
              ${logoSrc ? `<img src="${logoSrc}" alt="NOUFAR CDSS logo" />` : ""}
              <div>
                <strong>NOUFAR CDSS</strong>
                <span>Clinical prediction report</span>
                <span>Hyperthyroid relapse decision support</span>
              </div>
            </div>
            <div class="report-meta">
              <span><strong>Generated:</strong> ${escapeReportHtml(generatedAt)}</span>
              <span><strong>Patient:</strong> ${escapeReportHtml(result.patientName)}</span>
              <span><strong>Consultation reason:</strong> ${escapeReportHtml(result.consultationReason)}</span>
            </div>
          </header>

          <section class="report-summary">
            <article class="summary-card">
              <h1>Clinical prediction report</h1>
              <p>
                This report summarizes the submitted manual clinical entry, the resulting relapse
                prediction, and the most influential explanatory variables identified by NOUFAR CDSS.
              </p>
            </article>
            <article class="result-card">
              <span class="result-badge">${escapeReportHtml(badge.label)}</span>
              <div class="result-score">${escapeReportHtml(result.probability)}%</div>
              <p class="result-copy">
                Estimated relapse probability based on the entered clinical, biological, imaging,
                and treatment variables.
              </p>
            </article>
          </section>

          <section class="report-grid">
            ${sectionMarkup}
          </section>

          <section class="impact-wrapper">
            <div class="impact-head">Most impactful variables</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Effect on prediction</th>
                </tr>
              </thead>
              <tbody>
                ${impactsMarkup}
              </tbody>
            </table>
          </section>
        </div>
      </body>
    </html>
  `;
};

const printPredictionReport = () => {
  if (!latestPredictionResult) return;

  const reportMarkup = buildPredictionReportMarkup(latestPredictionResult);
  const reportBlob = new Blob([reportMarkup], { type: "text/html" });
  const reportUrl = URL.createObjectURL(reportBlob);
  const printWindow = window.open(reportUrl, "_blank", "width=1100,height=900");

  if (!printWindow) {
    URL.revokeObjectURL(reportUrl);
    return;
  }

  const cleanup = () => {
    setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
  };

  printWindow.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        cleanup();
      }, 180);
    },
    { once: true }
  );
};

const initializePredictionChipSelect = (group) => {
  if (!(group instanceof HTMLElement)) return;

  const field = group.closest(".chip-select-field");
  const hiddenInput = field?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  const syncSelectedOption = (value) => {
    hiddenInput.value = value;
    options.forEach((option) => {
      const isSelected = option.dataset.chipValue === value;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  };

  syncSelectedOption(hiddenInput.value || options[0].dataset.chipValue || "");

  const handleOptionSelection = (option) => {
    if (!(option instanceof HTMLElement)) return;
    syncSelectedOption(option.dataset.chipValue || "");
    hiddenInput.dataset.touched = "true";
    updatePredictionSubmitState();
  };

  group.addEventListener("click", (event) => {
    const option = event.target.closest(".chip-select-option");
    if (!option) return;
    event.preventDefault();
    handleOptionSelection(option);
  });

  options.forEach((option) => {
    option.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleOptionSelection(option);
    });
  });
};

const isPredictionValidatableField = (field) =>
  (field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement) &&
  typeof field.checkValidity === "function" &&
  field.type !== "submit" &&
  field.type !== "button" &&
  field.type !== "reset" &&
  field.type !== "hidden" &&
  !field.disabled;

const getPredictionValidatableFields = () => {
  if (!predictionForm) return [];
  return Array.from(predictionForm.elements).filter(isPredictionValidatableField);
};

const getPredictionRequiredFields = () => {
  if (!predictionForm) return [];
  return Array.from(predictionForm.querySelectorAll("input[required], select[required], textarea[required]")).filter(
    (field) => field instanceof HTMLElement && typeof field.checkValidity === "function" && !field.disabled
  );
};

const getPredictionFieldContainer = (field) => field?.closest(".field, .toggle-switch-field") ?? null;

const ensurePredictionErrorElement = (field) => {
  const container = getPredictionFieldContainer(field);
  if (!container) return null;

  let errorElement = container.querySelector(".field-error-message");
  if (!errorElement) {
    errorElement = document.createElement("p");
    errorElement.className = "field-error-message";
    errorElement.setAttribute("aria-live", "polite");
    container.appendChild(errorElement);
  }

  return errorElement;
};

const getPredictionFieldErrorMessage = (field) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return "";

  if (field.validity.valueMissing) {
    return "This field is required.";
  }

  if (field.validity.badInput) {
    return "Please enter a valid number.";
  }

  if (field.validity.rangeUnderflow || field.validity.rangeOverflow) {
    if (field.name === "age") return "Age must be between 17 and 100.";
    if (field.name === "duration") return "Duration must be between 3 and 96 months.";
    return "Please enter a valid value.";
  }

  if (field.validity.customError) {
    return field.validationMessage;
  }

  return "Please review this field.";
};

const shouldShowPredictionFieldError = (field, force = false) => {
  if (!field) return false;
  if (force) return true;
  return predictionForm?.dataset.submitAttempted === "true" || field.dataset.touched === "true";
};

const syncPredictionFieldState = (field, force = false) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return;

  const container = getPredictionFieldContainer(field);
  const errorElement = ensurePredictionErrorElement(field);
  const isInvalid = shouldShowPredictionFieldError(field, force) && !field.checkValidity();

  container?.classList.toggle("is-invalid", isInvalid);

  if (errorElement) {
    errorElement.textContent = isInvalid ? getPredictionFieldErrorMessage(field) : "";
    errorElement.hidden = !isInvalid;
  }
};

const updateTogglePresentation = (input) => {
  if (!input) return;
  const valueLabel = input.closest(".toggle-switch-control")?.querySelector(".toggle-switch-value");
  if (valueLabel) {
    valueLabel.textContent = input.checked ? "Yes" : "No";
  }
};

const updateRangePresentation = (input) => {
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

const updatePredictionSubmitState = () => {
  if (!predictionForm || !runPredictionButton) return;

  const requiredFields = getPredictionRequiredFields();
  const isFormValid = requiredFields.every((field) => field.checkValidity());
  runPredictionButton.disabled = !isFormValid;

  if (!predictionFormNote) return;

  predictionFormNote.classList.remove("is-error", "is-ready");

  if (isFormValid) {
    predictionFormNote.textContent = "All required fields are ready. You can run the prediction.";
    predictionFormNote.classList.add("is-ready");
    return;
  }

  if (predictionForm.dataset.submitAttempted === "true") {
    predictionFormNote.textContent = "Complete the required fields highlighted below before running the prediction.";
    predictionFormNote.classList.add("is-error");
    return;
  }

  predictionFormNote.textContent = "Complete all required fields to enable prediction.";
};

const buildPredictionFormData = () => {
  const formData = new FormData(predictionForm);
  predictionToggleInputs.forEach((input) => {
    formData.set(input.name, input.checked ? "Yes" : "No");
  });
  return formData;
};

const buildPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
};

const renderPagination = (container, currentPage, totalPages, onPageChange) => {
  if (!container) return;

  const items = buildPaginationItems(currentPage, totalPages);
  const nextDisabled = currentPage >= totalPages;

  container.innerHTML = `
    <div class="pagination-track">
      ${items
        .map((item) => {
          if (item === "ellipsis") {
            return '<span class="pagination-ellipsis" aria-hidden="true">...</span>';
          }

          return `
            <button
              class="pagination-button ${item === currentPage ? "active" : ""}"
              type="button"
              data-page="${item}"
              aria-label="Go to page ${item}"
              ${item === currentPage ? 'aria-current="page"' : ""}
            >
              ${item}
            </button>
          `;
        })
        .join("")}
      <button
        class="pagination-button pagination-button-nav"
        type="button"
        data-page="${Math.min(currentPage + 1, totalPages)}"
        aria-label="Go to next page"
        ${nextDisabled ? "disabled" : ""}
      >
        &#8250;
      </button>
    </div>
  `;

  container.querySelectorAll(".pagination-button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.page);
      if (!nextPage || nextPage === currentPage) return;
      onPageChange(nextPage);
    });
  });
};

const resetUploadSelectionState = () => {
  latestUploadId = null;
  fileName.textContent = "No file selected";
  uploadDropzone?.classList.remove("is-ready");
  uploadDropzone?.classList.remove("has-selection");
  uploadSuccess.hidden = true;
  uploadError.hidden = true;
  choosePatientButton.hidden = true;
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Files";
  }
};

const selectRecentUpload = (uploadId) => {
  const upload = getUploadById(uploadId);
  if (!upload) return;

  renderUploadSuccess(upload);
};

const setOutcomePending = (message) => {
  if (!outcomeState) return;
  latestPredictionResult = null;

  outcomeState.classList.remove("relapse", "stable");
  outcomeState.classList.add("awaiting");
  outcomeHeading.textContent = "Awaiting Data Input";
  outcomeText.textContent =
    message ||
    "Enter clinical parameters manually or upload a dataset to run the prediction model.";

  if (outcomeBadge) {
    outcomeBadge.textContent = "Pending";
    outcomeBadge.className = "prediction-badge";
  }

  if (outcomeProbability) {
    outcomeProbability.textContent = "0%";
  }

  if (outcomeBar) {
    outcomeBar.style.width = "0%";
  }

  if (outcomeSummary) {
    outcomeSummary.innerHTML = `
      <strong>Pending analysis</strong>
      <span>Complete the clinical form or import a dataset to generate a patient-specific prediction.</span>
      <span>Estimated relapse probability will appear here after model execution.</span>
    `;
  }

  if (impactList) {
    impactList.innerHTML = `
      <div class="impact-empty" id="impact-empty">
        Run the prediction to view the most influential variables for this patient.
      </div>
    `;
  }

  if (printReportButton) {
    printReportButton.hidden = true;
  }
};

const renderOutcome = (result) => {
  latestPredictionResult = result;
  const badge = predictionBadge(result);

  outcomeState.classList.remove("awaiting", "relapse", "stable");
  outcomeState.classList.add(result.relapse ? "relapse" : "stable");
  outcomeHeading.textContent = badge.label;
  outcomeText.textContent = result.relapse
    ? "The current profile suggests a higher probability of relapse and may require closer follow-up."
    : "The current profile suggests a lower probability of relapse under the entered conditions.";

  outcomeBadge.textContent = badge.label;
  outcomeBadge.className = `prediction-badge ${badge.tone}`;
  outcomeProbability.textContent = `${result.probability}%`;
  outcomeBar.style.width = `${result.probability}%`;
  outcomeSummary.innerHTML = `
    <strong>${result.patientName}</strong>
    <span>Consultation reason: ${result.consultationReason}</span>
    <span>Treatment duration: ${result.duration || 0} months</span>
    <span>Predicted outcome: ${badge.label}</span>
  `;

  impactList.innerHTML = "";

  if (!result.contributions.length) {
    impactList.innerHTML = `
      <div class="impact-empty">
        No strong explanatory drivers were detected from the current inputs.
      </div>
    `;
    return;
  }

  const maxImpact = Math.max(
    ...result.contributions.map((item) => Math.abs(Number(item.amount) || 0)),
    0
  );

  result.contributions.forEach((item) => {
    const row = document.createElement("div");
    const itemImpact = Math.abs(Number(item.amount) || 0);
    const relativePercent = maxImpact > 0 ? Math.round((itemImpact / maxImpact) * 100) : 0;
    const influence = Math.max(18, Math.min(relativePercent, 100));

    row.className = "impact-item";
    row.innerHTML = `
      <div class="impact-item-head">
        <strong>${item.label}</strong>
        <span>${item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk"} · ${influence}%</span>
      </div>
      <div class="impact-bar">
        <i class="${item.amount > 0 ? "positive" : "negative"}" style="width:${influence}%; ${impactGradientStyle(influence)}"></i>
      </div>
    `;
    impactList.appendChild(row);
  });

  if (printReportButton) {
    printReportButton.hidden = false;
  }
};

const openDuplicatePredictionModal = (
  message = "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
  predictionId = ""
) => {
  duplicatePredictionId = String(predictionId || "").trim();
  if (duplicatePredictionCopy) {
    duplicatePredictionCopy.textContent = message;
  }
  if (duplicatePredictionViewButton) {
    duplicatePredictionViewButton.hidden = !duplicatePredictionId;
  }
  openModal(duplicatePredictionModal);
};

const openServiceErrorModal = (
  message = "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
) => {
  if (serviceErrorCopy) {
    serviceErrorCopy.textContent = message;
  }
  openModal(serviceErrorModal);
};

const openModal = (modal) => {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
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

const closeModal = (modal) => {
  if (!modal) return;
  modal.hidden = true;

  if (modal === duplicatePredictionModal) {
    duplicatePredictionId = "";
    if (duplicatePredictionViewButton) {
      duplicatePredictionViewButton.hidden = true;
    }
  }

  if (consultModal?.hidden && deleteModal?.hidden) {
    document.body.style.overflow = "";
  }
};

const openDeleteUploadModal = (uploadId) => {
  const upload = getUploadById(uploadId);
  deleteTargetId = uploadId;

  if (deleteFileCopy) {
    const fileNameToShow = upload?.name || "this imported file";
    deleteFileCopy.textContent = `Are you sure you want to permanently delete "${fileNameToShow}"?`;
  }

  openModal(deleteModal);
};

const renderUploadSuccess = (upload) => {
  latestUploadId = upload.id;
  fileName.textContent = upload.name;
  uploadDropzone?.classList.add("is-ready");
  uploadDropzone?.classList.add("has-selection");
  uploadError.hidden = true;
  uploadSuccess.hidden = false;
  uploadSuccessText.textContent = `${upload.rows.length} patient records parsed successfully. File is ready.`;
  choosePatientButton.hidden = false;
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Another File";
  }
};

const showUploadError = (message) => {
  latestUploadId = null;
  uploadDropzone?.classList.remove("is-ready");
  uploadDropzone?.classList.remove("has-selection");
  uploadSuccess.hidden = true;
  choosePatientButton.hidden = true;
  fileName.textContent = "No file selected";
  uploadError.textContent = message;
  uploadError.hidden = false;
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Files";
  }
};

const isValidUploadFile = (file) => {
  const lowerName = file.name.toLowerCase();
  return allowedUploadExtensions.some((extension) => lowerName.endsWith(extension));
};

const timeAgo = (isoDate) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const renderRecentUploads = () => {
  if (!recentUploadList) return;

  const filtered = filterRows(loadUploads(), recentSearchTerm);
  const uploads = [...filtered].sort((a, b) => {
    if (recentSortTerm === "oldest") return new Date(a.uploadedAt) - new Date(b.uploadedAt);
    if (recentSortTerm === "name") return a.name.localeCompare(b.name);
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });

  if (!uploads.length) {
    recentUploadList.innerHTML = `
      <div class="recent-upload-empty">
        No matching uploads found. Import an Excel or CSV file to build a new prediction list.
      </div>
    `;
    return;
  }

  recentUploadList.innerHTML = uploads
    .map((upload) => {
      const isCsv = upload.name.toLowerCase().endsWith(".csv");
      const when = upload.uploadedAt ? `Uploaded ${timeAgo(upload.uploadedAt)}` : "";
      const fileIcon = isCsv
        ? `<img class="upload-file-img" src="assets/csv-icon.png" alt="CSV file" aria-label="CSV file"/>`
        : `<img class="upload-file-img" src="assets/excel-icon.png" alt="Excel file" aria-label="Excel file"/>`;
      return `
        <article class="upload-item ${upload.id === latestUploadId ? "is-selected" : ""}" data-upload-select="${upload.id}">
          ${fileIcon}
          <div class="upload-meta">
            <strong>${upload.name}</strong>
            <span>${formatFileSize(upload.size)} · ${upload.rows?.length ?? "—"} patients${when ? ` · ${when}` : ""}</span>
          </div>
          <div class="upload-actions">
            <button class="upload-icon-btn" type="button" data-action="consult" data-upload-id="${upload.id}" title="Consult">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="upload-icon-btn upload-icon-btn-danger" type="button" data-action="delete" data-upload-id="${upload.id}" title="Delete">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderConsultModal = () => {
  const upload = getUploadById(consultUploadId);

  if (!upload) {
    closeModal(consultModal);
    return;
  }

  const pageData = paginate(upload.rows, consultPage, 7);
  consultPage = pageData.currentPage;
  consultTitle.textContent = upload.name;
  consultMeta.textContent = `${upload.rows.length} patients - ${upload.columns.length} columns - ${upload.sheetName}`;
  consultHead.innerHTML = `
    <tr>
      ${upload.columns.map((column) => `<th>${column}</th>`).join("")}
    </tr>
  `;

  consultBody.innerHTML = pageData.items
    .map(
      (row) => `
        <tr>
          ${upload.columns
            .map((column) => `<td>${row[column] === "" ? "-" : row[column]}</td>`)
            .join("")}
        </tr>
      `
    )
    .join("");

  renderPagination(consultPagination, pageData.currentPage, pageData.totalPages, (nextPage) => {
    consultPage = nextPage;
    renderConsultModal();
  });
};

const handleUpload = async (file) => {
  if (!file) return;

  if (!isValidUploadFile(file)) {
    showUploadError("Only `.csv`, `.xlsx`, or `.xls` files are accepted.");
    return;
  }

  const existingUploads = loadUploads();
  const isDuplicate = existingUploads.some(
    (u) => u.name.toLowerCase() === file.name.toLowerCase()
  );
  if (isDuplicate) {
    showManualPredictionToast("This file already exists in Recent Uploads.", "danger");
    return;
  }

  fileName.textContent = `${file.name} - Processing...`;
  uploadError.hidden = true;

  try {
    const dataset = await parseWorkbookFile(file);

    if (!dataset.rows.length) {
      throw new Error("The imported file does not contain any patient rows.");
    }

    const upload = createUploadRecord(file, dataset);
    addUpload(upload);
    renderUploadSuccess(upload);
    renderRecentUploads();
  } catch (error) {
    uploadDropzone?.classList.remove("is-ready");
    uploadDropzone?.classList.remove("has-selection");
    uploadSuccess.hidden = true;
    showUploadError(
      error instanceof Error
        ? error.message
        : "Unable to read this file. Please upload a valid Excel or CSV dataset."
    );
    choosePatientButton.hidden = true;
  }
};

if (predictionMobileButton && predictionSidebar) {
  predictionMobileButton.addEventListener("click", () => {
    const isOpen = predictionSidebar.classList.toggle("is-open");
    predictionMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

setOutcomePending();
resetUploadSelectionState();

// Load rows from IndexedDB into memory before first render
(window.NoufarApp.initRowStorage() || Promise.resolve()).then(() => {
  renderRecentUploads();
});

window.addEventListener("pageshow", () => {
  resetUploadSelectionState();
  renderRecentUploads();
});

if (predictionForm) {
  const predictionFields = getPredictionValidatableFields();

  predictionFields.forEach((field) => {
    const eventName =
      field.classList.contains("range-input") ? "input" : field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";

    field.addEventListener(eventName, () => {
      if (field.classList.contains("range-input")) {
        updateRangePresentation(field);
      }

      if (field.classList.contains("toggle-switch-input")) {
        updateTogglePresentation(field);
      }

      syncPredictionFieldState(field);
      updatePredictionSubmitState();
    });

    field.addEventListener("blur", () => {
      field.dataset.touched = "true";
      syncPredictionFieldState(field);
      updatePredictionSubmitState();
    });
  });

  predictionToggleInputs.forEach(updateTogglePresentation);
  predictionRangeInputs.forEach((input) => {
    updateRangePresentation(input);
    input.addEventListener("input", () => updateRangePresentation(input));
    input.addEventListener("change", () => updateRangePresentation(input));
  });
  predictionChipSelectGroups.forEach(initializePredictionChipSelect);
  updatePredictionSubmitState();

  predictionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    predictionForm.dataset.submitAttempted = "true";

    predictionFields.forEach((field) => {
      syncPredictionFieldState(field, true);
    });

    updatePredictionSubmitState();

    if (!predictionForm.checkValidity()) {
      return;
    }

    const submitPrediction = async () => {
      let hasError = false;
      try {
        setPredictionLoadingState(true);
        const response = await requestManualPrediction();
        if (typeof upsertPatientPrediction === "function" && response?.prediction) {
          upsertPatientPrediction(response.prediction);
        }
          renderOutcome(response.displayResult);
          revealPredictionOutcome();
          if (aiServiceWasUnavailable) {
            showManualPredictionToast("AI prediction service is available again. Prediction generated successfully.");
            aiServiceWasUnavailable = false;
          } else {
            showManualPredictionToast("Prediction generated successfully.");
          }
        } catch (error) {
          hasError = true;
          const isDuplicateError = error?.status === 409;
          const isServiceError = error?.status === 502;

        if (isDuplicateError) {
          openDuplicatePredictionModal(
            error instanceof Error
              ? error.message
              : "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
            error?.payload?.existingPredictionId || ""
          );
          }
          if (isServiceError) {
            aiServiceWasUnavailable = true;
            openServiceErrorModal(
              "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
            );
          }
        if (!isDuplicateError && !isServiceError) {
          showManualPredictionToast(
            error instanceof Error ? error.message : "Unable to run the AI prediction.",
            "danger"
          );
          predictionFormNote?.classList.remove("is-ready");
          predictionFormNote?.classList.add("is-error");
          if (predictionFormNote) {
            predictionFormNote.textContent =
              error instanceof Error ? error.message : "Unable to run the AI prediction.";
          }
          setOutcomePending(
            error instanceof Error
              ? error.message
              : "The prediction service is currently unavailable. Please try again."
          );
        }
      } finally {
        setPredictionLoadingState(false);
        if (!hasError) {
          updatePredictionSubmitState();
        }
      }
    };

    submitPrediction();
  });
}

if (datasetFile) {
  datasetFile.addEventListener("change", async () => {
    await handleUpload(datasetFile.files?.[0]);
  });
}

if (uploadDropzone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadDropzone.classList.add("is-drag-over");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadDropzone.classList.remove("is-drag-over");
    });
  });

  uploadDropzone.addEventListener("drop", async (event) => {
    const droppedFile = event.dataTransfer?.files?.[0];
    await handleUpload(droppedFile);
  });
}

if (recentUploadSearch) {
  recentUploadSearch.addEventListener("input", (event) => {
    recentSearchTerm = event.target.value;
    renderRecentUploads();
  });
}

const recentSortSelect = document.querySelector("#recent-sort-select");
if (recentSortSelect) {
  recentSortSelect.addEventListener("change", (event) => {
    recentSortTerm = event.target.value;
    renderRecentUploads();
  });
}

if (choosePatientButton) {
  choosePatientButton.addEventListener("click", () => {
    if (!latestUploadId) return;
    window.location.href = `dataset-selection.html?upload=${encodeURIComponent(latestUploadId)}`;
  });
}

if (printReportButton) {
  printReportButton.addEventListener("click", printPredictionReport);
}

duplicateCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(duplicatePredictionModal);
  });
});

if (duplicatePredictionOkButton) {
  duplicatePredictionOkButton.addEventListener("click", () => {
    closeModal(duplicatePredictionModal);
  });
}

if (duplicatePredictionViewButton) {
  duplicatePredictionViewButton.addEventListener("click", () => {
    if (!duplicatePredictionId) {
      closeModal(duplicatePredictionModal);
      return;
    }

    const returnTo = `${window.location.pathname.split("/").pop() || "new-prediction.html"}${window.location.search}`;
    const targetId = duplicatePredictionId;
    closeModal(duplicatePredictionModal);
    window.location.href = `prediction-details.html?id=${encodeURIComponent(targetId)}&returnTo=${encodeURIComponent(returnTo)}`;
  });
}

serviceErrorCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(serviceErrorModal);
  });
});

if (serviceErrorOkButton) {
  serviceErrorOkButton.addEventListener("click", () => {
    closeModal(serviceErrorModal);
  });
}

if (serviceErrorSupportButton) {
  serviceErrorSupportButton.addEventListener("click", () => {
    closeModal(serviceErrorModal);
    if (typeof window.openNoufarSupportModal === "function") {
      window.openNoufarSupportModal({
        category: "Technical issue",
        priority: "High",
        subject: "AI prediction service unavailable",
        message:
          "The AI prediction service is currently unavailable from the New Prediction workflow. Please review the Flask backend availability.",
      });
    }
  });
}

if (recentUploadList) {
  recentUploadList.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-upload-id]");

    if (!target) {
      const uploadRow = event.target.closest("[data-upload-select]");
      if (!uploadRow) return;
      selectRecentUpload(uploadRow.dataset.uploadSelect);
      renderRecentUploads();
      return;
    }

    const uploadId = target.dataset.uploadId;

    if (target.dataset.action === "consult") {
      consultUploadId = uploadId;
      consultPage = 1;
      renderConsultModal();
      openModal(consultModal);
      return;
    }

    if (target.dataset.action === "delete") {
      openDeleteUploadModal(uploadId);
    }
  });
}

consultCloseButtons.forEach((button) => {
  button.addEventListener("click", () => closeModal(consultModal));
});

let allUploadsSearchTerm = "";

const renderAllUploadsModal = () => {
  const all = loadUploads();
  const filtered = allUploadsSearchTerm
    ? all.filter((u) => u.name.toLowerCase().includes(allUploadsSearchTerm.toLowerCase()))
    : all;

  if (allUploadsMeta) {
    allUploadsMeta.textContent = `${all.length} file${all.length !== 1 ? "s" : ""} imported`;
  }

  if (!allUploadsList) return;

  if (!filtered.length) {
    allUploadsList.innerHTML = `<p class="all-uploads-empty">${allUploadsSearchTerm ? "No files match your search." : "No uploads yet."}</p>`;
    return;
  }

  allUploadsList.innerHTML = filtered.map((upload) => {
    const isCsv = upload.name.toLowerCase().endsWith(".csv");
    const icon = isCsv
      ? `<img class="all-uploads-file-img" src="assets/csv-icon.png" alt="CSV"/>`
      : `<img class="all-uploads-file-img" src="assets/excel-icon.png" alt="Excel"/>`;
    const when = upload.uploadedAt ? timeAgo(upload.uploadedAt) : "";
    return `
      <div class="all-uploads-item" data-upload-select="${upload.id}">
        ${icon}
        <div class="all-uploads-meta">
          <strong>${upload.name}</strong>
          <span>${formatFileSize(upload.size)} · ${upload.rows?.length ?? "—"} patients${when ? ` · ${when}` : ""}</span>
        </div>
        <span class="all-uploads-select-hint">Select</span>
        <div class="all-uploads-actions">
          <button class="upload-icon-btn" type="button" data-action="consult" data-upload-id="${upload.id}" title="Consult">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="upload-icon-btn upload-icon-btn-danger" type="button" data-action="delete" data-upload-id="${upload.id}" title="Delete">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
  }).join("");
};

if (viewAllUploadsBtn) {
  viewAllUploadsBtn.addEventListener("click", () => {
    allUploadsSearchTerm = "";
    if (allUploadsSearch) allUploadsSearch.value = "";
    renderAllUploadsModal();
    openModal(allUploadsModal);
  });
}

if (allUploadsSearch) {
  allUploadsSearch.addEventListener("input", (e) => {
    allUploadsSearchTerm = e.target.value;
    renderAllUploadsModal();
  });
}

allUploadsCloseButtons.forEach((btn) => {
  btn.addEventListener("click", () => closeModal(allUploadsModal));
});

if (allUploadsList) {
  allUploadsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (btn) {
      const { action, uploadId } = btn.dataset;
      if (action === "consult") {
        consultUploadId = uploadId;
        consultPage = 1;
        renderConsultModal();
        closeModal(allUploadsModal);
        openModal(consultModal);
      } else if (action === "delete") {
        deleteTargetId = uploadId;
        const upload = getUploadById(uploadId);
        if (deleteFileCopy) {
          deleteFileCopy.textContent = `Are you sure you want to permanently delete "${upload?.name || "this file"}"?`;
        }
        closeModal(allUploadsModal);
        openModal(deleteModal);
      }
      return;
    }

    const row = event.target.closest("[data-upload-select]");
    if (row) {
      selectRecentUpload(row.dataset.uploadSelect);
      renderRecentUploads();
      closeModal(allUploadsModal);
      showManualPredictionToast("File selected. You can now run the prediction.", "success");
    }
  });
}

deleteCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    deleteTargetId = null;
    closeModal(deleteModal);
  });
});

if (confirmDeleteButton) {
  confirmDeleteButton.addEventListener("click", () => {
    if (!deleteTargetId) {
      showUploadDeleteToast("Unable to delete this file.", "danger");
      return;
    }

    try {
      const upload = getUploadById(deleteTargetId);
      if (!upload) {
        throw new Error("Unable to find this imported file.");
      }

      const deletedFileName = upload.name || "Imported file";

      deleteUpload(deleteTargetId);

      if (deleteTargetId === latestUploadId) {
        latestUploadId = null;
        choosePatientButton.hidden = true;
        uploadSuccess.hidden = true;
        uploadDropzone?.classList.remove("is-ready");
        fileName.textContent = "No file selected";
      }

      deleteTargetId = null;
      renderRecentUploads();
      closeModal(deleteModal);
      showUploadDeleteToast(`"${deletedFileName}" deleted successfully.`);
    } catch (error) {
      showUploadDeleteToast(
        error instanceof Error ? error.message : "Unable to delete this file.",
        "danger"
      );
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (!consultModal?.hidden) {
    closeModal(consultModal);
  }

  if (!deleteModal?.hidden) {
    deleteTargetId = null;
    closeModal(deleteModal);
  }

  if (!allUploadsModal?.hidden) {
    closeModal(allUploadsModal);
  }
});
