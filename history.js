const historySidebar = document.querySelector(".sidebar");
const historyMobileButton = document.querySelector(".mobile-nav-button");

if (historyMobileButton && historySidebar) {
  historyMobileButton.addEventListener("click", () => {
    const isOpen = historySidebar.classList.toggle("is-open");
    historyMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

const statsHistory = getDashboardStats();
const historyTotal = document.querySelector("#history-total");
const historyRelapse = document.querySelector("#history-relapse");
const historyManual = document.querySelector("#history-manual");
const historyImported = document.querySelector("#history-imported");
const historyBody = document.querySelector("#history-body");

if (historyTotal) historyTotal.textContent = statsHistory.total.toLocaleString();
if (historyRelapse) historyRelapse.textContent = statsHistory.relapse.toLocaleString();
if (historyManual) {
  historyManual.textContent = patientPredictions
    .filter((entry) => entry.source === "Manual")
    .length.toLocaleString();
}

if (historyImported) {
  historyImported.textContent = patientPredictions
    .filter((entry) => entry.source !== "Manual")
    .length.toLocaleString();
}

if (historyBody) {
  [...patientPredictions]
    .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))
    .forEach((entry) => {
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
        <td><a class="table-action" href="dashboard.html">Details</a></td>
      `;
      historyBody.appendChild(row);
    });
}
