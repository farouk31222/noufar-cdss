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

const { getUploadById, loadUploads, paginate, filterRows, computePrediction, predictionBadge } =
  window.NoufarApp;

const params = new URLSearchParams(window.location.search);

let dataset = null;
let filteredRows = [];
let selectedRowId = "";
let currentPage = 1;
let searchTerm = "";

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

  if (requestedId) {
    return getUploadById(requestedId);
  }

  return uploads[0] || null;
};

const setPendingOutcome = () => {
  outcomeState.classList.remove("relapse", "stable");
  outcomeState.classList.add("awaiting");
  outcomeHeading.textContent = "Awaiting Data Input";
  outcomeText.textContent =
    "Select a patient from the uploaded dataset to generate the individualized prediction result.";
  outcomeBadge.textContent = "Pending";
  outcomeBadge.className = "prediction-badge";
  outcomeProbability.textContent = "0%";
  outcomeBar.style.width = "0%";
  outcomeSummary.innerHTML = `
    <strong>Pending analysis</strong>
    <span>Choose a patient row to activate the prediction workflow.</span>
    <span>Probability and explanatory variables will appear after model execution.</span>
  `;
  impactList.innerHTML =
    '<div class="impact-empty">Run the prediction to view the most influential variables for this patient.</div>';
};

const renderSelectionSummary = (row) => {
  if (!row) {
    selectionSummary.innerHTML = `
      <strong>No patient selected</strong>
      <span>Select one row from the dataset table to prepare the patient-level prediction.</span>
    `;
    runSelectedPredictionButton.disabled = true;
    return;
  }

  const patientName = row["Full Name"] || row.Name || row["Patient Name"] || "Selected patient";
  const patientId = row["Patient ID"] || row.ID || row["Patient Id"] || "Unspecified ID";
  const patientAge = row.Age || "Not provided";

  selectionSummary.innerHTML = `
    <strong>${patientName}</strong>
    <span>Patient ID: ${patientId}</span>
    <span>Age: ${patientAge}</span>
  `;
  runSelectedPredictionButton.disabled = false;
};

const renderDatasetTable = () => {
  filteredRows = filterRows(dataset.rows, searchTerm);
  const pageData = paginate(filteredRows, currentPage, 8);
  currentPage = pageData.currentPage;

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
        return `
          <tr class="selectable-row">
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
  const badge = predictionBadge(result);

  outcomeState.classList.remove("awaiting", "relapse", "stable");
  outcomeState.classList.add(result.relapse ? "relapse" : "stable");
  outcomeHeading.textContent = badge.label;
  outcomeText.textContent = result.relapse
    ? "The selected patient profile indicates a higher probability of relapse and may require closer surveillance."
    : "The selected patient profile indicates a lower probability of relapse under the imported conditions.";
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
    impactList.innerHTML =
      '<div class="impact-empty">No strong explanatory drivers were detected from this patient row.</div>';
    return;
  }

  result.contributions.forEach((item) => {
    const influence = Math.max(18, Math.round(Math.abs(item.amount) * 100 * 4.5));
    const impactItem = document.createElement("div");

    impactItem.className = "impact-item";
    impactItem.innerHTML = `
      <div class="impact-item-head">
        <strong>${item.label}</strong>
        <span>${item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk"}</span>
      </div>
      <div class="impact-bar">
        <i class="${item.amount > 0 ? "positive" : "negative"}" style="width:${Math.min(
          influence,
          100
        )}%"></i>
      </div>
    `;

    impactList.appendChild(impactItem);
  });
};

if (datasetMobileButton && datasetSidebar) {
  datasetMobileButton.addEventListener("click", () => {
    const isOpen = datasetSidebar.classList.toggle("is-open");
    datasetMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

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
  setPendingOutcome();
  renderDatasetTable();
}

if (datasetSearch) {
  datasetSearch.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    currentPage = 1;
    renderDatasetTable();
  });
}

if (datasetBody) {
  datasetBody.addEventListener("change", (event) => {
    const picker = event.target.closest(".row-picker");
    if (!picker) return;

    selectedRowId = picker.value;
    renderDatasetTable();
  });
}

if (runSelectedPredictionButton) {
  runSelectedPredictionButton.addEventListener("click", () => {
    if (!dataset || !selectedRowId) return;

    const selectedRow = dataset.rows.find((row) => row.__rowId === selectedRowId);
    if (!selectedRow) return;

    const result = computePrediction(selectedRow);
    renderOutcome(result);
  });
}
