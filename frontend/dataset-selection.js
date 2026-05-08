const datasetSidebar = document.querySelector(".sidebar");
const datasetMobileButton = document.querySelector(".mobile-nav-button");
const datasetName = document.querySelector("#dataset-name");
const datasetSubtitle = document.querySelector("#dataset-subtitle");
const datasetTotal = document.querySelector("#dataset-total");
const datasetColumns = document.querySelector("#dataset-columns");
const datasetSheet = document.querySelector("#dataset-sheet");
const datasetHead = document.querySelector("#dataset-head");
const datasetBody = document.querySelector("#dataset-body");
const datasetSearch = document.querySelector("#dataset-search");
const datasetPagination = document.querySelector("#dataset-pagination");
const datasetConsultationFilter = document.querySelector("#dataset-filter-consultation");
const datasetUltrasoundFilter = document.querySelector("#dataset-filter-ultrasound");
const datasetTsiFilter = document.querySelector("#dataset-filter-tsi");
const datasetFilterResetButton = document.querySelector("#dataset-filter-reset");
const datasetFilterStatus = document.querySelector("#dataset-filter-status");
const selectionSummary = document.querySelector("#selection-summary");
const runSelectedPredictionButton = document.querySelector("#run-selected-prediction");
const outcomeState = document.querySelector("#selection-outcome-state");
const outcomeHeading = document.querySelector("#selection-outcome-heading");
const outcomeText = document.querySelector("#selection-outcome-text");
const outcomeBadge = document.querySelector("#selection-outcome-badge");
const outcomeProbability = document.querySelector("#selection-outcome-probability");
const outcomeBar = document.querySelector("#selection-outcome-bar");
const outcomeSummary = document.querySelector("#selection-outcome-summary");
const impactList = document.querySelector("#selection-impact-list");
const printReportButton = document.querySelector("#selection-print-report-button");
const datasetDuplicateModal = document.querySelector("#dataset-duplicate-modal");
const datasetDuplicateCopy = document.querySelector("#dataset-duplicate-copy");
const datasetDuplicateViewButton = document.querySelector("#dataset-duplicate-view");
const datasetDuplicateOkButton = document.querySelector("#dataset-duplicate-ok");
const datasetDuplicateCloseButtons = document.querySelectorAll("[data-close-dataset-duplicate]");
const datasetServiceErrorModal = document.querySelector("#dataset-service-error-modal");
const datasetServiceErrorCopy = document.querySelector("#dataset-service-error-copy");
const datasetServiceErrorOkButton = document.querySelector("#dataset-service-error-ok");
const datasetServiceErrorSupportButton = document.querySelector("#dataset-service-error-support");
const datasetServiceErrorCloseButtons = document.querySelectorAll("[data-close-dataset-service-error]");

const { getUploadById, loadUploads, paginate, filterRows, predictionBadge, initRowStorage } =
  window.NoufarApp;

const datasetSelectionAuthStorageKey = "noufar-doctor-auth-v1";
const datasetSelectionApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

const params = new URLSearchParams(window.location.search);

let dataset = null;
let filteredRows = [];
let selectedRowId = "";
let currentPage = 1;
let searchTerm = "";
let latestSelectionResult = null;
let latestSelectedRow = null;
let duplicatePredictionId = "";
let datasetAiServiceWasUnavailable = false;
let activeClinicalFilters = {
  consultationReason: "",
  ultrasound: "",
  tsi: "",
};

const showDatasetSelectionToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const openDatasetDuplicateModal = (
  message = "A prediction already exists for this imported patient. Duplicate predictions are not allowed.",
  predictionId = ""
) => {
  duplicatePredictionId = String(predictionId || "").trim();

  if (datasetDuplicateCopy) {
    datasetDuplicateCopy.textContent = message;
  }
  if (datasetDuplicateViewButton) {
    datasetDuplicateViewButton.hidden = !duplicatePredictionId;
  }
  if (datasetDuplicateModal) {
    datasetDuplicateModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
};

const openDatasetServiceErrorModal = (
  message = "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
) => {
  if (datasetServiceErrorCopy) {
    datasetServiceErrorCopy.textContent = message;
  }
  if (datasetServiceErrorModal) {
    datasetServiceErrorModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
};

const closeDatasetDuplicateModal = () => {
  if (!datasetDuplicateModal) return;
  duplicatePredictionId = "";
  if (datasetDuplicateViewButton) {
    datasetDuplicateViewButton.hidden = true;
  }
  datasetDuplicateModal.hidden = true;
  document.body.style.overflow = "";
};

const closeDatasetServiceErrorModal = () => {
  if (!datasetServiceErrorModal) return;
  datasetServiceErrorModal.hidden = true;
  document.body.style.overflow = "";
};

const getDatasetSelectionDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(datasetSelectionAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const normalizeDatasetKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const getDatasetRowValue = (row, aliases, fallback = "") => {
  const normalizedAliases = aliases.map(normalizeDatasetKey);

  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeDatasetKey(key)) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
};

const getDatasetFilterMeta = (row) => ({
  consultationReason: String(getDatasetRowValue(row, ["Consultation reason", "Reason"], "")).trim(),
  ultrasound: String(getDatasetRowValue(row, ["Ultrasound"], "")).trim(),
  tsi: String(getDatasetRowValue(row, ["TSI"], "")).trim(),
});

const populateDatasetFilterOptions = () => {
  if (!dataset) return;

  const buildOptions = (select, values, emptyLabel) => {
    if (!select) return;
    const previous = select.value;
    const uniqueValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = emptyLabel;
    select.append(defaultOption);

    uniqueValues.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });

    select.value = uniqueValues.includes(previous) ? previous : "";
  };

  const metas = dataset.rows.map(getDatasetFilterMeta);
  buildOptions(
    datasetConsultationFilter,
    metas.map((item) => item.consultationReason),
    "All reasons"
  );
  buildOptions(
    datasetUltrasoundFilter,
    metas.map((item) => item.ultrasound),
    "All ultrasound findings"
  );
  buildOptions(
    datasetTsiFilter,
    metas.map((item) => item.tsi),
    "All TSI profiles"
  );
};

const applyClinicalFilters = (rows = []) =>
  rows.filter((row) => {
    const meta = getDatasetFilterMeta(row);

    if (
      activeClinicalFilters.consultationReason &&
      meta.consultationReason !== activeClinicalFilters.consultationReason
    ) {
      return false;
    }

    if (activeClinicalFilters.ultrasound && meta.ultrasound !== activeClinicalFilters.ultrasound) {
      return false;
    }

    if (activeClinicalFilters.tsi && meta.tsi !== activeClinicalFilters.tsi) {
      return false;
    }

    return true;
  });

const updateDatasetFilterStatus = (count) => {
  if (!datasetFilterStatus || !dataset) return;

  const activeCount = Object.values(activeClinicalFilters).filter(Boolean).length;
  if (!activeCount) {
    datasetFilterStatus.textContent = `Showing ${count} of ${dataset.rows.length} imported patient${dataset.rows.length > 1 ? "s" : ""}`;
    return;
  }

  datasetFilterStatus.textContent = `${count} patient${count > 1 ? "s" : ""} match ${activeCount} active clinical filter${activeCount > 1 ? "s" : ""}`;
};

const buildImportedPredictionPayload = (row) => {
  const patientId = String(
    getDatasetRowValue(row, ["Patient ID", "ID", "Patient Id"], "")
  ).trim();
  const patientName = String(
    getDatasetRowValue(row, ["Full Name", "Patient Name", "Name"], patientId || "Imported patient")
  ).trim();

  return {
    name: patientName || patientId || "Imported patient",
    age: Number(getDatasetRowValue(row, ["Age"], 0)) || 0,
    sex: String(getDatasetRowValue(row, ["Sex", "Gender"], "Not specified")).trim() || "Not specified",
    consultationReason: String(
      getDatasetRowValue(row, ["Consultation reason", "Reason"], "")
    ).trim(),
    stress: String(getDatasetRowValue(row, ["Stress"], "No")).trim(),
    palpitations: String(getDatasetRowValue(row, ["Palpitations"], "No")).trim(),
    spp: String(getDatasetRowValue(row, ["SPP"], "No")).trim(),
    amg: String(getDatasetRowValue(row, ["AMG"], "No")).trim(),
    diarrhea: String(getDatasetRowValue(row, ["Diarrhea"], "No")).trim(),
    tremors: String(getDatasetRowValue(row, ["Tremors"], "No")).trim(),
    agitation: String(getDatasetRowValue(row, ["Agitation"], "No")).trim(),
    moodDisorder: String(getDatasetRowValue(row, ["Mood disorder"], "No")).trim(),
    sleepDisorder: String(getDatasetRowValue(row, ["Sleep disorder"], "No")).trim(),
    sweating: String(getDatasetRowValue(row, ["Excess sweating"], "No")).trim(),
    heatIntolerance: String(getDatasetRowValue(row, ["Heat intolerance"], "No")).trim(),
    muscleWeakness: String(getDatasetRowValue(row, ["Muscle weakness"], "No")).trim(),
    goiter: String(getDatasetRowValue(row, ["Goiter"], "No")).trim(),
    goiterClassification: String(
      getDatasetRowValue(row, ["Goiter classification"], "")
    ).trim(),
    tsh: Number(getDatasetRowValue(row, ["TSH"], 0)) || 0,
    ft4: Number(getDatasetRowValue(row, ["FT4", "Free T4"], 0)) || 0,
    antiTpo: String(getDatasetRowValue(row, ["Anti-TPO", "Anti TPO"], "Negative")).trim(),
    antiTpoTotal: Number(getDatasetRowValue(row, ["Anti-TPO total", "Anti TPO total"], 0)) || 0,
    antiTg: String(getDatasetRowValue(row, ["Anti-Tg", "Anti Tg"], "Negative")).trim(),
    tsi: String(getDatasetRowValue(row, ["TSI"], "Negative")).trim(),
    tsiLevel: Number(getDatasetRowValue(row, ["TSI level"], 0)) || 0,
    ultrasound: String(getDatasetRowValue(row, ["Ultrasound"], "")).trim(),
    scintigraphy: String(getDatasetRowValue(row, ["Scintigraphy"], "")).trim(),
    therapy: String(getDatasetRowValue(row, ["Therapy"], "ATS")).trim(),
    blockReplace: String(getDatasetRowValue(row, ["Block and replace", "Block Replace"], "No")).trim(),
    duration: Number(
      getDatasetRowValue(row, ["Duration of treatment", "Treatment duration", "Duration"], 0)
    ) || 0,
    surgery: String(getDatasetRowValue(row, ["Surgery"], "No")).trim(),
    radioactiveIodine: String(getDatasetRowValue(row, ["Radioactive iodine"], "No")).trim(),
    source: "Data Import",
    importedPatientId: patientId,
    importedDatasetName: dataset?.name || "",
  };
};

const requestImportedPrediction = async (row) => {
  const session = getDatasetSelectionDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${datasetSelectionApiBaseUrl}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildImportedPredictionPayload(row)),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Unable to run the imported patient prediction.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const setSelectionPredictionLoadingState = (isLoading) => {
  if (!runSelectedPredictionButton) return;
  runSelectedPredictionButton.disabled = isLoading || !selectedRowId;
  runSelectedPredictionButton.textContent = isLoading ? "Running..." : "Run Prediction";
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

const reportSections = [
  {
    title: "Patient Information",
    fields: [
      ["Patient ID", "Patient ID"],
      ["Full Name", "Patient name"],
      ["Name", "Patient name"],
      ["Age", "Age"],
    ],
  },
  {
    title: "Symptoms and Clinical",
    fields: [
      ["Consultation reason", "Consultation reason"],
      ["Stress", "Stress"],
      ["Palpitations", "Palpitations"],
      ["SPP", "SPP"],
      ["AMG", "AMG"],
      ["Diarrhea", "Diarrhea"],
      ["Tremors", "Tremors"],
      ["Agitation", "Agitation"],
      ["Mood disorder", "Mood disorder"],
      ["Sleep disorder", "Sleep disorder"],
      ["Excess sweating", "Excess sweating"],
      ["Heat intolerance", "Heat intolerance"],
      ["Muscle weakness", "Muscle weakness"],
    ],
  },
  {
    title: "Thyroid Examination",
    fields: [
      ["Goiter", "Goiter"],
      ["Goiter classification", "Goiter classification"],
    ],
  },
  {
    title: "Biology",
    fields: [
      ["TSH", "TSH"],
      ["FT4", "FT4"],
      ["Anti-TPO", "Anti-TPO"],
      ["Anti-TPO total", "Anti-TPO total"],
      ["Anti-Tg", "Anti-Tg"],
      ["TSI", "TSI"],
      ["TSI level", "TSI level"],
    ],
  },
  {
    title: "Imaging",
    fields: [
      ["Ultrasound", "Ultrasound"],
      ["Scintigraphy", "Scintigraphy"],
    ],
  },
  {
    title: "Treatment",
    fields: [
      ["Therapy", "Therapy"],
      ["Block and replace", "Block and replace"],
      ["Duration of treatment", "Duration of treatment"],
      ["Surgery", "Surgery"],
      ["Radioactive iodine", "Radioactive iodine"],
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

const getRowValue = (row, keys) => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "Not provided";
};

const buildDatasetReportMarkup = (row, result) => {
  const badge = predictionBadge(result);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const logoSrc = getEmbeddedReportLogo();
  const sectionMarkup = reportSections
    .map((section) => {
      const rows = section.fields
        .map(([key, label]) => {
          const value = getRowValue(row, [key]);
          return { label, value };
        })
        .filter((entry, index, entries) => {
          if (entry.value === "Not provided" && entries.some((candidate) => candidate.label === entry.label && candidate.value !== "Not provided")) {
            return false;
          }
          return true;
        });

      return `
        <section class="report-section">
          <div class="report-section-head">${escapeReportHtml(section.title)}</div>
          <table class="report-table">
            <tbody>
              ${rows
                .map(
                  (item) => `
                    <tr>
                      <th>${escapeReportHtml(item.label)}</th>
                      <td>${escapeReportHtml(item.value)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `;
    })
    .join("");

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
        <td colspan="2">No strong explanatory drivers were detected from this patient row.</td>
      </tr>
    `;

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
          .report-shell { max-width: 960px; margin: 0 auto; }
          .report-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 24px;
            border-bottom: 2px solid #eef3fb;
          }
          .brand { display: flex; align-items: center; gap: 16px; }
          .brand img { width: 58px; height: 58px; object-fit: contain; }
          .brand strong { display: block; font-size: 24px; line-height: 1.1; }
          .brand span, .report-meta span {
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
          .summary-card, .result-card {
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
          .summary-card p, .result-copy {
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
                <span>Selected patient dataset review</span>
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
                This report summarizes the selected patient row from the imported dataset, the
                resulting relapse prediction, and the most influential variables identified by
                NOUFAR CDSS.
              </p>
            </article>
            <article class="result-card">
              <span class="result-badge">${escapeReportHtml(badge.label)}</span>
              <div class="result-score">${escapeReportHtml(result.probability)}%</div>
              <p class="result-copy">
                Estimated relapse probability based on the imported clinical, biological,
                imaging, and treatment variables.
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

const printSelectionReport = () => {
  if (!latestSelectionResult || !latestSelectedRow) return;

  const reportMarkup = buildDatasetReportMarkup(latestSelectedRow, latestSelectionResult);
  const reportBlob = new Blob([reportMarkup], { type: "text/html" });
  const reportUrl = URL.createObjectURL(reportBlob);
  const printWindow = window.open(reportUrl, "_blank", "width=1100,height=900");

  if (!printWindow) {
    URL.revokeObjectURL(reportUrl);
    return;
  }

  printWindow.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
      }, 180);
    },
    { once: true }
  );
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

const getDataset = () => {
  const requestedId = params.get("upload");
  const uploads = loadUploads();

  console.log("getDataset() called");
  console.log("requestedId from URL:", requestedId);
  console.log("uploads from loadUploads():", uploads);

  if (requestedId) {
    const result = getUploadById(requestedId);
    console.log("getUploadById result:", result);
    return result;
  }

  console.log("No requestedId, returning first upload:", uploads[0] || null);
  return uploads[0] || null;
};

const setPendingOutcome = () => {
  latestSelectionResult = null;

  if (outcomeState) outcomeState.classList.remove("relapse", "stable");
  if (outcomeState) outcomeState.classList.add("awaiting");
  if (outcomeHeading) outcomeHeading.textContent = "Awaiting Data Input";
  if (outcomeText) outcomeText.textContent =
    "Select a patient from the uploaded dataset to generate the individualized prediction result.";
  if (outcomeBadge) outcomeBadge.textContent = "Pending";
  if (outcomeBadge) outcomeBadge.className = "prediction-badge";
  if (outcomeProbability) outcomeProbability.textContent = "0%";
  if (outcomeBar) outcomeBar.style.width = "0%";
  if (outcomeSummary) outcomeSummary.innerHTML = `
    <strong>Pending analysis</strong>
    <span>Choose a patient row to activate the prediction workflow.</span>
    <span>Probability and explanatory variables will appear after model execution.</span>
  `;
  if (impactList) impactList.innerHTML =
    '<div class="impact-empty">Run the prediction to view the most influential variables for this patient.</div>';
  if (printReportButton) {
    printReportButton.hidden = true;
  }
  setSelectionPredictionLoadingState(false);
};

const renderSelectionSummary = (row) => {
  if (!row) {
    selectionSummary.innerHTML = `
      <span class="selection-summary-kicker">Selection pending</span>
      <strong>No patient selected</strong>
      <span>Select one row from the dataset table to prepare the patient-level prediction.</span>
    `;
    runSelectedPredictionButton.disabled = true;
    return;
  }

  const patientName = row["Full Name"] || row.Name || row["Patient Name"] || "Selected patient";
  const patientId = row["Patient ID"] || row.ID || row["Patient Id"] || "Unspecified ID";
  const patientAge = row.Age || "Not provided";
  const consultationReason = row["Consultation reason"] || row.Reason || "Not specified";
  const ultrasound = row.Ultrasound || "Not specified";
  const tsiProfile = row.TSI || "Not specified";

  selectionSummary.innerHTML = `
      <span class="selection-summary-kicker">Selected profile</span>
      <strong>${patientName}</strong>
      <span>Patient ID: ${patientId}</span>
      <span>Age: ${patientAge}</span>
      <div class="selection-summary-meta">
        <span>${consultationReason}</span>
        <span>${ultrasound}</span>
        <span>TSI: ${tsiProfile}</span>
      </div>
    `;
  setSelectionPredictionLoadingState(false);
};

const renderDatasetTable = () => {
  console.log("renderDatasetTable() called");
  console.log("dataset:", dataset);
  console.log("dataset.rows:", dataset?.rows);
  console.log("dataset.rows.length:", dataset?.rows?.length);

  filteredRows = applyClinicalFilters(filterRows(dataset.rows, searchTerm));
  console.log("filteredRows after filter:", filteredRows);

  if (selectedRowId && !filteredRows.some((row) => row.__rowId === selectedRowId)) {
    selectedRowId = "";
  }
  const pageData = paginate(filteredRows, currentPage, 8);
  console.log("pageData:", pageData);

  currentPage = pageData.currentPage;
  updateDatasetFilterStatus(filteredRows.length);

  datasetHead.innerHTML = `
    <tr>
      <th class="radio-cell">Select</th>
      ${dataset.columns.map((column) => `<th>${column}</th>`).join("")}
    </tr>
  `;

  if (!pageData.items.length) {
    datasetBody.innerHTML = `
      <tr>
        <td colspan="${dataset.columns.length + 1}">
          <div class="dataset-empty">No patients match the current search.</div>
        </td>
      </tr>
    `;
  } else {
    datasetBody.innerHTML = pageData.items
        .map((row) => {
          const checked = row.__rowId === selectedRowId ? "checked" : "";
          const selectedClass = row.__rowId === selectedRowId ? " is-selected" : "";
          return `
            <tr class="selectable-row${selectedClass}" data-row-id="${row.__rowId}">
              <td class="radio-cell">
                <input
                  class="row-picker"
                  type="radio"
                  name="selected-patient"
                  value="${row.__rowId}"
                  ${checked}
                  aria-label="Select patient row"
                />
              </td>
            ${dataset.columns
              .map((column) => `<td>${row[column] === "" ? "-" : row[column]}</td>`)
              .join("")}
          </tr>
        `;
      })
      .join("");
  }

  renderPagination(datasetPagination, pageData.currentPage, pageData.totalPages, (nextPage) => {
    currentPage = nextPage;
    renderDatasetTable();
  });

  const selectedRow = dataset.rows.find((row) => row.__rowId === selectedRowId) || null;
  renderSelectionSummary(selectedRow);
};

const renderOutcome = (result) => {
  latestSelectionResult = result;
  const badge = predictionBadge(result);

  if (outcomeState) {
    outcomeState.classList.remove("awaiting", "relapse", "stable");
    outcomeState.classList.add(result.relapse ? "relapse" : "stable");
    const selOutcomeCard = outcomeState?.closest(".outcome-card");
    if (selOutcomeCard) {
      selOutcomeCard.classList.remove("is-relapse", "is-stable");
      selOutcomeCard.classList.add(result.relapse ? "is-relapse" : "is-stable");
    }
  }

  if (outcomeHeading) outcomeHeading.textContent = badge.label;
  if (outcomeText) outcomeText.textContent = result.relapse
    ? "The selected patient profile indicates a higher probability of relapse and may require closer surveillance."
    : "The selected patient profile indicates a lower probability of relapse under the imported conditions.";
  if (outcomeBadge) outcomeBadge.textContent = badge.label;
  if (outcomeBadge) outcomeBadge.className = `prediction-badge ${badge.tone}`;
  if (outcomeProbability) outcomeProbability.textContent = `${result.probability}%`;
  if (outcomeBar) outcomeBar.style.width = `${result.probability}%`;
  if (outcomeSummary) outcomeSummary.innerHTML = `
    <strong>${result.patientName}</strong>
    <span>Consultation reason: ${result.consultationReason}</span>
    <span>Treatment duration: ${result.duration || 0} months</span>
    <span>Predicted outcome: ${badge.label}</span>
  `;

  if (impactList) impactList.innerHTML = "";

  if (!result.contributions.length) {
    if (impactList) impactList.innerHTML =
      '<div class="impact-empty">No strong explanatory drivers were detected from this patient row.</div>';
    return;
  }

  const maxImpact = Math.max(
    ...result.contributions.map((item) => Math.abs(Number(item.amount) || 0)),
    0
  );

  result.contributions.forEach((item) => {
    if (!impactList) return;

    const itemImpact = Math.abs(Number(item.amount) || 0);
    const relativePercent = maxImpact > 0 ? Math.round((itemImpact / maxImpact) * 100) : 0;
    const influence = Math.max(18, Math.min(relativePercent, 100));
    const impactItem = document.createElement("div");

    const tone = item.amount > 0 ? "is-warm" : "is-cool";
    impactItem.className = "impact-var";
    impactItem.innerHTML = `
      <div class="impact-var-head">
        <span class="impact-var-label">
          <span class="impact-var-dot ${tone}"></span>
          ${item.label}
        </span>
        <span class="impact-var-meta">${item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk"} · ${influence}%</span>
      </div>
      <div class="impact-var-track">
        <i class="${tone}" style="width:${influence}%; ${impactGradientStyle(influence)}"></i>
      </div>
    `;

    impactList.appendChild(impactItem);
  });

  if (printReportButton) {
    printReportButton.hidden = false;
  }
};

if (datasetMobileButton && datasetSidebar) {
  datasetMobileButton.addEventListener("click", () => {
    const isOpen = datasetSidebar.classList.toggle("is-open");
    datasetMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

(initRowStorage() || Promise.resolve()).then(() => {
  dataset = getDataset();

  if (!dataset) {
    datasetName.textContent = "No dataset available";
    datasetSubtitle.textContent = "Upload an Excel or CSV file from the New Prediction page to continue.";
    datasetBody.innerHTML = `
      <tr>
        <td colspan="2">
          <div class="dataset-empty">No uploaded dataset is available yet.</div>
        </td>
      </tr>
    `;
    renderPagination(datasetPagination, 1, 1, () => {});
    runSelectedPredictionButton.disabled = true;
    setPendingOutcome();
  } else {
    datasetName.textContent = dataset.name;
    datasetSubtitle.textContent = `Uploaded ${new Date(dataset.uploadedAt).toLocaleString()} - Select a patient to continue`;
    datasetTotal.textContent = String(dataset.rows.length);
    datasetColumns.textContent = String(dataset.columns.length);
    datasetSheet.textContent = dataset.sheetName || "Dataset";
    populateDatasetFilterOptions();
    setPendingOutcome();
    renderDatasetTable();
  }
});

if (datasetSearch) {
  datasetSearch.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    currentPage = 1;
    renderDatasetTable();
  });
}

datasetConsultationFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.consultationReason = event.target.value;
  currentPage = 1;
  renderDatasetTable();
});

datasetUltrasoundFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.ultrasound = event.target.value;
  currentPage = 1;
  renderDatasetTable();
});

datasetTsiFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.tsi = event.target.value;
  currentPage = 1;
  renderDatasetTable();
});

datasetFilterResetButton?.addEventListener("click", () => {
  activeClinicalFilters = {
    consultationReason: "",
    ultrasound: "",
    tsi: "",
  };

  if (datasetConsultationFilter) datasetConsultationFilter.value = "";
  if (datasetUltrasoundFilter) datasetUltrasoundFilter.value = "";
  if (datasetTsiFilter) datasetTsiFilter.value = "";
  currentPage = 1;
  renderDatasetTable();
});

if (datasetBody) {
  datasetBody.addEventListener("click", (event) => {
    const interactiveTarget = event.target.closest(".row-picker, a, button, input, select, textarea");
    if (interactiveTarget) return;

    const row = event.target.closest(".selectable-row[data-row-id]");
    if (!row) return;

    selectedRowId = row.dataset.rowId || "";
    renderDatasetTable();
  });

  datasetBody.addEventListener("change", (event) => {
    const picker = event.target.closest(".row-picker");
    if (!picker) return;

    selectedRowId = picker.value;
    renderDatasetTable();
  });
}

if (runSelectedPredictionButton) {
  runSelectedPredictionButton.addEventListener("click", async () => {
    if (!dataset || !selectedRowId) return;

    const selectedRow = dataset.rows.find((row) => row.__rowId === selectedRowId);
    if (!selectedRow) return;

    latestSelectedRow = selectedRow;
    setSelectionPredictionLoadingState(true);

      try {
        const response = await requestImportedPrediction(selectedRow);
        const predictionId = response?.prediction?.id;

        if (predictionId) {
          window.location.href = `prediction-details.html?id=${encodeURIComponent(predictionId)}&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }

        renderOutcome(response.displayResult);
        if (datasetAiServiceWasUnavailable) {
          showDatasetSelectionToast("AI prediction service is available again. Prediction generated successfully.");
          datasetAiServiceWasUnavailable = false;
        } else {
          showDatasetSelectionToast("Prediction generated successfully.");
        }
      } catch (error) {
        if (error?.status === 409) {
          openDatasetDuplicateModal(
            error instanceof Error
              ? error.message
              : "A prediction already exists for this imported patient. Duplicate predictions are not allowed.",
            error?.payload?.existingPredictionId || ""
          );
        } else {
          datasetAiServiceWasUnavailable = true;
          openDatasetServiceErrorModal(
            "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
          );
        }
        if (error?.status === 409) {
          setPendingOutcome();
          outcomeText.textContent = error instanceof Error ? error.message : "A prediction already exists for this imported patient.";
        }
    } finally {
      setSelectionPredictionLoadingState(false);
    }
  });
}

if (printReportButton) {
  printReportButton.addEventListener("click", printSelectionReport);
}

datasetDuplicateCloseButtons.forEach((button) => {
  button.addEventListener("click", closeDatasetDuplicateModal);
});

if (datasetDuplicateOkButton) {
  datasetDuplicateOkButton.addEventListener("click", closeDatasetDuplicateModal);
}

if (datasetDuplicateViewButton) {
  datasetDuplicateViewButton.addEventListener("click", () => {
    if (!duplicatePredictionId) {
      closeDatasetDuplicateModal();
      return;
    }

    const returnTo = `${window.location.pathname.split("/").pop() || "dataset-selection.html"}${window.location.search}`;
    const targetId = duplicatePredictionId;
    closeDatasetDuplicateModal();
    window.location.href = `prediction-details.html?id=${encodeURIComponent(targetId)}&returnTo=${encodeURIComponent(returnTo)}`;
  });
}

datasetServiceErrorCloseButtons.forEach((button) => {
  button.addEventListener("click", closeDatasetServiceErrorModal);
});

if (datasetServiceErrorOkButton) {
  datasetServiceErrorOkButton.addEventListener("click", closeDatasetServiceErrorModal);
}

if (datasetServiceErrorSupportButton) {
  datasetServiceErrorSupportButton.addEventListener("click", () => {
    closeDatasetServiceErrorModal();
    if (typeof window.openNoufarSupportModal === "function") {
      window.openNoufarSupportModal({
        category: "Technical issue",
        priority: "High",
        subject: "AI prediction service unavailable",
        message: "The AI prediction service is currently unavailable from the dataset selection workflow.",
      });
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (datasetDuplicateModal && !datasetDuplicateModal.hidden) {
    closeDatasetDuplicateModal();
  }
  if (datasetServiceErrorModal && !datasetServiceErrorModal.hidden) {
    closeDatasetServiceErrorModal();
  }
});

window.addEventListener("pageshow", () => {
  if (datasetDuplicateModal && !datasetDuplicateModal.hidden) {
    closeDatasetDuplicateModal();
  }
  if (datasetServiceErrorModal && !datasetServiceErrorModal.hidden) {
    closeDatasetServiceErrorModal();
  }
});
