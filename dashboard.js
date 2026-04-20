const stats = getDashboardStats();
const averageProbability = getAverageProbability();
const totalNode = document.querySelector("#stat-total");
const relapseNode = document.querySelector("#stat-relapse");
const noRelapseNode = document.querySelector("#stat-no-relapse");
const averageNode = document.querySelector("#stat-average");
const totalNoteNode = document.querySelector("#stat-total-note");
const relapseNoteNode = document.querySelector("#stat-relapse-note");
const noRelapseNoteNode = document.querySelector("#stat-no-relapse-note");
const averageNoteNode = document.querySelector("#stat-average-note");

if (totalNode) totalNode.textContent = stats.total.toLocaleString();
if (relapseNode) relapseNode.textContent = stats.relapse.toLocaleString();
if (noRelapseNode) noRelapseNode.textContent = stats.noRelapse.toLocaleString();
if (averageNode) averageNode.textContent = `${averageProbability}%`;

const relapsePercent = stats.total ? Math.round((stats.relapse / stats.total) * 100) : 0;
const stablePercent = stats.total ? 100 - relapsePercent : 0;

if (totalNoteNode) totalNoteNode.textContent = `${relapsePercent}% flagged for closer follow-up`;
if (relapseNoteNode) relapseNoteNode.textContent = `${relapsePercent}% of total cases`;
if (noRelapseNoteNode) noRelapseNoteNode.textContent = `${stablePercent}% of total cases`;
if (averageNoteNode) averageNoteNode.textContent = "Stable across cohort";

const donutCircumference = 2 * Math.PI * 42;
const relapseRatio = stats.total ? stats.relapse / stats.total : 0;
const stableRatio = 1 - relapseRatio;
const relapseArc = relapseRatio * donutCircumference;
const stableArc = stableRatio * donutCircumference;

const donutRelapse = document.querySelector("#donut-relapse");
const donutSafe = document.querySelector("#donut-safe");
const donutTotal = document.querySelector("#donut-total");
const legendRelapse = document.querySelector("#legend-relapse");
const legendSafe = document.querySelector("#legend-safe");
const legendRelapseCount = document.querySelector("#legend-relapse-count");
const legendSafeCount = document.querySelector("#legend-safe-count");

if (donutRelapse) {
  donutRelapse.style.strokeDasharray = `${relapsePercent} 100`;
}

if (donutSafe) {
  donutSafe.style.strokeDasharray = "100 100";
}

if (donutTotal) donutTotal.textContent = `${stats.total}`;
if (legendRelapse) legendRelapse.textContent = `${relapsePercent}%`;
if (legendSafe) legendSafe.textContent = `${stablePercent}%`;
if (legendRelapseCount) legendRelapseCount.textContent = `${stats.relapse} patient${stats.relapse === 1 ? "" : "s"}`;
if (legendSafeCount) legendSafeCount.textContent = `${stats.noRelapse} patient${stats.noRelapse === 1 ? "" : "s"}`;

const recentHost = document.querySelector("#recent-activity");
const trendHost = document.querySelector("#trend-series");
const focusPatientId = document.querySelector("#focus-patient-id");
const focusPatientMeta = document.querySelector("#focus-patient-meta");
const focusPatientResult = document.querySelector("#focus-patient-result");
const focusPatientProbability = document.querySelector("#focus-patient-probability");
const focusPatientBar = document.querySelector("#focus-patient-bar");
const manualSourceNode = document.querySelector("#source-manual");
const importSourceNode = document.querySelector("#source-import");
const highRiskNode = document.querySelector("#high-risk-count");
const queueCountNode = document.querySelector("#queue-count");
const priorityListHost = document.querySelector("#priority-list");
const allPatients = getRecentPatients(stats.total || 1000);
const topRiskPatients = getTopRiskPatients(3);
const focusPatient = topRiskPatients[0];

if (recentHost) {
  recentHost.innerHTML = "";
  getRecentPatients().forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.id}</td>
      <td>${formatDate(entry.analyzedAt)}</td>
      <td><span class="prediction-badge ${badge.tone}">${badge.label}</span></td>
      <td>
        <span class="probability-cell">
          <strong>${entry.probability}%</strong>
          <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
        </span>
      </td>
      <td><a class="table-action" href="history.html">Details</a></td>
    `;
    recentHost.appendChild(row);
  });
}

if (trendHost) {
  trendHost.innerHTML = "";
  getTrendSeries().forEach((entry) => {
    const score = Math.round(entry.value * 100);
    const bar = document.createElement("article");
    bar.className = "trend-bar";
    bar.innerHTML = `
      <div class="trend-bar-meter">
        <div class="trend-bar-fill" style="height: ${Math.max(score, 12)}%"></div>
      </div>
      <strong class="trend-bar-value">${score}%</strong>
      <span class="trend-bar-label">${entry.label}</span>
    `;
    trendHost.appendChild(bar);
  });
}

if (focusPatientId && focusPatient) {
  const focusBadge = getPredictionBadge(focusPatient);
  focusPatientId.textContent = `${focusPatient.id} - ${focusPatient.patient}`;
  focusPatientMeta.textContent = `${focusPatient.age} years - ${focusPatient.sex} - ${focusPatient.source} - ${formatDate(focusPatient.analyzedAt)}`;
  focusPatientResult.textContent = focusBadge.label;
  focusPatientResult.className = `prediction-badge ${focusBadge.tone}`;
}

if (focusPatientProbability && focusPatient) {
  focusPatientProbability.textContent = `${focusPatient.probability}%`;
}

if (focusPatientBar && focusPatient) {
  focusPatientBar.style.width = `${focusPatient.probability}%`;
}

if (manualSourceNode) {
  manualSourceNode.textContent = allPatients.filter((entry) => entry.source === "Manual").length.toLocaleString();
}

if (importSourceNode) {
  importSourceNode.textContent = allPatients.filter((entry) => entry.source !== "Manual").length.toLocaleString();
}

if (highRiskNode) {
  highRiskNode.textContent = allPatients.filter((entry) => entry.probability >= 70).length.toLocaleString();
}

if (queueCountNode) {
  queueCountNode.textContent = `${topRiskPatients.length} cases`;
}

if (priorityListHost) {
  priorityListHost.innerHTML = "";
  topRiskPatients.forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const item = document.createElement("article");
    item.className = "priority-item";
    item.innerHTML = `
      <div class="priority-item-head">
        <div>
          <strong>${entry.id} - ${entry.patient}</strong>
          <span>${formatDate(entry.analyzedAt)} - ${entry.source}</span>
        </div>
        <span class="prediction-badge ${badge.tone}">${badge.label}</span>
      </div>
      <span class="probability-cell">
        <strong>${entry.probability}%</strong>
        <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
      </span>
    `;
    priorityListHost.appendChild(item);
  });
}
