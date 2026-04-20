const predictionSidebar = document.querySelector(".sidebar");
const predictionMobileButton = document.querySelector(".mobile-nav-button");
const predictionForm = document.querySelector("#prediction-form");
const outcomeState = document.querySelector("#outcome-state");
const outcomeHeading = document.querySelector("#outcome-heading");
const outcomeText = document.querySelector("#outcome-text");
const outcomeBadge = document.querySelector("#outcome-badge");
const outcomeProbability = document.querySelector("#outcome-probability");
const outcomeBar = document.querySelector("#outcome-bar");
const outcomeSummary = document.querySelector("#outcome-summary");
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
const consultModal = document.querySelector("#consult-modal");
const consultTitle = document.querySelector("#consult-title");
const consultMeta = document.querySelector("#consult-meta");
const consultHead = document.querySelector("#consult-head");
const consultBody = document.querySelector("#consult-body");
const consultPagination = document.querySelector("#consult-pagination");
const deleteModal = document.querySelector("#delete-modal");
const confirmDeleteButton = document.querySelector("#confirm-delete-button");
const consultCloseButtons = document.querySelectorAll("[data-close-consult]");
const deleteCloseButtons = document.querySelectorAll("[data-close-delete]");

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
  computePrediction,
  predictionBadge,
} = window.NoufarApp;

let latestUploadId = null;
let recentSearchTerm = "";
let consultUploadId = null;
let consultPage = 1;
let deleteTargetId = null;
const allowedUploadExtensions = [".csv", ".xlsx", ".xls"];

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
};

const renderOutcome = (result) => {
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

  result.contributions.forEach((item) => {
    const row = document.createElement("div");
    const influence = Math.max(18, Math.round(Math.abs(item.amount) * 100 * 4.5));

    row.className = "impact-item";
    row.innerHTML = `
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
    impactList.appendChild(row);
  });
};

const openModal = (modal) => {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.hidden = true;

  if (consultModal?.hidden && deleteModal?.hidden) {
    document.body.style.overflow = "";
  }
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

const renderRecentUploads = () => {
  if (!recentUploadList) return;

  const uploads = filterRows(loadUploads(), recentSearchTerm);

  if (!uploads.length) {
    recentUploadList.innerHTML = `
      <div class="recent-upload-empty">
        No matching uploads found. Import an Excel or CSV file to build a new prediction list.
      </div>
    `;
    return;
  }

  recentUploadList.innerHTML = uploads
    .map(
      (upload) => `
        <article class="upload-item ${upload.id === latestUploadId ? "is-selected" : ""}" data-upload-select="${upload.id}">
          <div class="upload-meta">
            <strong>${upload.name}</strong>
            <span>${formatFileSize(upload.size)} - ${upload.rows.length} patients</span>
          </div>
          <div class="upload-actions">
            <button class="mini-btn" type="button" data-action="consult" data-upload-id="${upload.id}">
              Consult
            </button>
            <button class="mini-btn mini-btn-danger" type="button" data-action="delete" data-upload-id="${upload.id}">
              Delete
            </button>
          </div>
        </article>
      `
    )
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
renderRecentUploads();

window.addEventListener("pageshow", () => {
  resetUploadSelectionState();
  renderRecentUploads();
});

if (predictionForm) {
  predictionForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!predictionForm.reportValidity()) {
      return;
    }

    const result = computePrediction(new FormData(predictionForm));
    renderOutcome(result);
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

if (choosePatientButton) {
  choosePatientButton.addEventListener("click", () => {
    if (!latestUploadId) return;
    window.location.href = `dataset-selection.html?upload=${encodeURIComponent(latestUploadId)}`;
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
      deleteTargetId = uploadId;
      openModal(deleteModal);
    }
  });
}

consultCloseButtons.forEach((button) => {
  button.addEventListener("click", () => closeModal(consultModal));
});

deleteCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    deleteTargetId = null;
    closeModal(deleteModal);
  });
});

if (confirmDeleteButton) {
  confirmDeleteButton.addEventListener("click", () => {
    if (!deleteTargetId) return;

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
});
