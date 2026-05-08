(function () {
  const AUTH_KEY = "noufar-admin-auth-v1";
  const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function request(path, options = {}) {
    const session = getSession();
    if (!session?.token) {
      window.location.href = "login.html";
      throw new Error("Admin session missing");
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  function fmt(val) {
    return val === null || val === undefined || val === "" ? "-" : String(val);
  }

  function renderComparison(cmp) {
    const box = document.getElementById("comparison-box");
    if (!cmp) {
      box.textContent = "No comparison yet.";
      return;
    }
    box.innerHTML = `
      <div><strong>Status:</strong> ${fmt(cmp.status)}</div>
      <div><strong>Eligible:</strong> ${fmt(cmp.eligibleCount)} / ${fmt(cmp.threshold)}</div>
      <div><strong>Old:</strong> ${fmt(cmp.oldModelLabel)} (F1=${fmt(cmp.oldModelF1)})</div>
      <div><strong>New:</strong> ${fmt(cmp.newModelLabel)} (F1=${fmt(cmp.newModelF1)})</div>
      <div><strong>Decision:</strong> ${fmt(cmp.decision)}</div>
      <div><strong>Reason:</strong> ${fmt(cmp.decisionReason)}</div>
      ${cmp.errorMessage ? `<div style="color:#c0392b;"><strong>Error:</strong> ${cmp.errorMessage}</div>` : ""}
    `;
  }

  function rowActions(item) {
    if (item.validationStatus === "doctor_validated") {
      return `
        <button class="btn btn-primary btn-small" data-approve="${item._id}">Approve</button>
        <button class="btn btn-danger btn-small" data-reject="${item._id}">Reject</button>
      `;
    }
    return "-";
  }

  function renderRows(items) {
    const body = document.getElementById("feedback-body");
    if (!Array.isArray(items) || !items.length) {
      body.innerHTML = `<tr><td colspan="8">No feedback cases found.</td></tr>`;
      return;
    }
    body.innerHTML = items
      .map(
        (item) => `
      <tr>
        <td>${fmt(item.predictionId)}</td>
        <td>${fmt(item.predictedOutcome)}</td>
        <td>${fmt(item.realOutcome)}</td>
        <td>${fmt(item.modelNameUsed || item.selectedModelKey)}</td>
        <td>${fmt(item.validatedByDoctorName)}</td>
        <td>${fmt(item.validationStatus)}</td>
        <td>${item.isRetrainEligible ? "Yes" : "No"}</td>
        <td>${rowActions(item)}</td>
      </tr>`
      )
      .join("");
  }

  async function load() {
    const status = document.getElementById("status-filter").value;
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await request(`/feedback-cases${query}`);
    renderRows(data.items || []);
    renderComparison(data.comparison || null);
  }

  async function approve(id) {
    await request(`/feedback-cases/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
    await load();
  }

  async function rejectCase(id) {
    const reason = window.prompt("Reject reason (required):");
    if (!reason) return;
    await request(`/feedback-cases/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
    await load();
  }

  async function runNow() {
    await request("/feedback-cases/comparison/run", { method: "POST", body: JSON.stringify({}) });
    await load();
  }

  async function applyDecision(decision) {
    await request("/feedback-cases/comparison/decision", {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await load();
  }

  document.addEventListener("click", async (event) => {
    const approveBtn = event.target.closest("[data-approve]");
    if (approveBtn) {
      await approve(approveBtn.dataset.approve);
      return;
    }
    const rejectBtn = event.target.closest("[data-reject]");
    if (rejectBtn) {
      await rejectCase(rejectBtn.dataset.reject);
      return;
    }
  });

  document.getElementById("status-filter").addEventListener("change", () => {
    load().catch((e) => alert(e.message));
  });
  document.getElementById("run-comparison-btn").addEventListener("click", () => {
    runNow().catch((e) => alert(e.message));
  });
  document.getElementById("promote-btn").addEventListener("click", () => {
    applyDecision("PROMOTE").catch((e) => alert(e.message));
  });
  document.getElementById("keep-old-btn").addEventListener("click", () => {
    applyDecision("KEEP_OLD").catch((e) => alert(e.message));
  });

  load().catch((e) => alert(e.message));
})();

