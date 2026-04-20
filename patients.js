const patientsSidebar = document.querySelector(".sidebar");
const patientsMobileButton = document.querySelector(".mobile-nav-button");

if (patientsMobileButton && patientsSidebar) {
  patientsMobileButton.addEventListener("click", () => {
    const isOpen = patientsSidebar.classList.toggle("is-open");
    patientsMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

const patientsBody = document.querySelector("#patients-body");
const patientsEmpty = document.querySelector("#patients-empty");
const patientsSearch = document.querySelector("#patients-search");
const patientsFilter = document.querySelector("#patients-filter");

const updateModal = document.querySelector("#update-patient-modal");
const deleteModal = document.querySelector("#delete-patient-modal");
const patientsCloseControls = document.querySelectorAll("[data-patients-close]");
const updateForm = document.querySelector("#update-patient-form");
const updatePatientName = document.querySelector("#update-patient-name");
const updatePatientResult = document.querySelector("#update-patient-result");
const updatePatientProbability = document.querySelector("#update-patient-probability");
const updatePatientSource = document.querySelector("#update-patient-source");
const deletePatientSummary = document.querySelector("#delete-patient-summary");
const confirmDeletePatient = document.querySelector("#confirm-delete-patient");

let patientsRegistry = [...patientPredictions];
let activePatientId = null;

const closePatientsModals = () => {
  if (updateModal) updateModal.hidden = true;
  if (deleteModal) deleteModal.hidden = true;
  document.body.style.overflow = "";
  activePatientId = null;
};

const openPatientsModal = (modal) => {
  if (!modal) return;
  closePatientsModals();
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

patientsCloseControls.forEach((control) => {
  control.addEventListener("click", closePatientsModals);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePatientsModals();
  }
});

const getFilteredPatients = () => {
  const query = patientsSearch?.value?.trim().toLowerCase() ?? "";
  const filter = patientsFilter?.value ?? "all";

  return [...patientsRegistry]
    .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))
    .filter((entry) => {
      const matchesQuery =
        !query ||
        entry.patient.toLowerCase().includes(query) ||
        entry.id.toLowerCase().includes(query) ||
        entry.source.toLowerCase().includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "relapse" && entry.result === "Relapse") ||
        (filter === "no-relapse" && entry.result === "No Relapse");

      return matchesQuery && matchesFilter;
    });
};

const openUpdateModal = (patientId) => {
  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient) return;

  activePatientId = patientId;
  updatePatientName.value = `${patient.patient} (${patient.id})`;
  updatePatientResult.value = patient.result;
  updatePatientProbability.value = patient.probability;
  updatePatientSource.value = patient.source;
  openPatientsModal(updateModal);
};

const openDeleteModal = (patientId) => {
  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient || !deletePatientSummary) return;

  activePatientId = patientId;
  deletePatientSummary.innerHTML = `
    <strong>${patient.patient}</strong>
    <span>${patient.id} · ${patient.probability}% probability · ${patient.result}</span>
  `;
  openPatientsModal(deleteModal);
};

const buildPatientsRow = (entry) => {
  const badge = getPredictionBadge(entry);
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>
      <div class="patient-meta">
        <strong>${entry.patient}</strong>
        <span>${entry.id}</span>
      </div>
    </td>
    <td>${entry.age} years / ${entry.sex}</td>
    <td>${formatDate(entry.analyzedAt)}</td>
    <td>${entry.source}</td>
    <td><span class="prediction-badge ${badge.tone}">${badge.label}</span></td>
    <td>
      <span class="probability-cell">
        <strong>${entry.probability}%</strong>
        <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
      </span>
    </td>
    <td>
      <div class="patients-row-actions">
        <button class="mini-btn" type="button" data-update-patient="${entry.id}">Update Prediction</button>
        <button class="mini-btn mini-btn-danger" type="button" data-delete-patient="${entry.id}">Delete</button>
      </div>
    </td>
  `;
  return row;
};

const renderPatients = () => {
  if (!patientsBody) return;

  const entries = getFilteredPatients();
  patientsBody.innerHTML = "";

  entries.forEach((entry) => {
    patientsBody.appendChild(buildPatientsRow(entry));
  });

  if (patientsEmpty) {
    patientsEmpty.hidden = entries.length > 0;
  }
};

patientsBody?.addEventListener("click", (event) => {
  const updateButton = event.target.closest("[data-update-patient]");
  if (updateButton) {
    openUpdateModal(updateButton.dataset.updatePatient);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-patient]");
  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.deletePatient);
  }
});

updateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!activePatientId || !updateForm.reportValidity()) return;

  patientsRegistry = patientsRegistry.map((entry) => {
    if (entry.id !== activePatientId) return entry;

    return {
      ...entry,
      result: updatePatientResult.value,
      probability: Number(updatePatientProbability.value),
      source: updatePatientSource.value,
      analyzedAt: new Date().toISOString().slice(0, 10),
    };
  });

  closePatientsModals();
  renderPatients();
});

confirmDeletePatient?.addEventListener("click", () => {
  if (!activePatientId) return;

  patientsRegistry = patientsRegistry.filter((entry) => entry.id !== activePatientId);
  closePatientsModals();
  renderPatients();
});

patientsSearch?.addEventListener("input", renderPatients);
patientsFilter?.addEventListener("change", renderPatients);

renderPatients();
