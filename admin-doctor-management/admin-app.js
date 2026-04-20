(function () {
  const STORAGE_KEY = "noufar-admin-dashboard-state-v1";
  const AUTH_KEY = "noufar-admin-auth-v1";
  const seed = window.NoufarAdminSeed || { doctors: [], tickets: [], auditLog: [], registrationSeries: [] };
  let state = loadState();
  let pendingConfirmation = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return clone(seed);
      const parsed = JSON.parse(saved);
      return {
        doctors: parsed.doctors || clone(seed.doctors),
        tickets: parsed.tickets || clone(seed.tickets),
        auditLog: parsed.auditLog || clone(seed.auditLog),
        registrationSeries: clone(seed.registrationSeries)
      };
    } catch (error) {
      return clone(seed);
    }
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function isAuthenticated() {
    const session = getAuthSession();
    return Boolean(session?.authenticated);
  }

  function requireAuth() {
    if (isAuthenticated()) return true;
    window.location.href = "login.html";
    return false;
  }

  function logoutAdmin() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
  }

  function formatDate(value, withTime = false) {
    const date = new Date(value);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    });
  }

  function slugifyBadge(value) {
    return value.toLowerCase().replace(/\s+/g, "-");
  }

  function createBadge(value, neutralFallback = false) {
    const span = document.createElement("span");
    span.className = `badge ${slugifyBadge(value)}${neutralFallback ? " neutral" : ""}`;
    span.textContent = value;
    return span;
  }

  function getDoctorById(id) {
    return state.doctors.find((doctor) => doctor.id === id);
  }

  function getTicketById(id) {
    return state.tickets.find((ticket) => ticket.id === id);
  }

  function getDoctorTickets(doctorId) {
    return state.tickets.filter((ticket) => ticket.doctorId === doctorId);
  }

  function addAuditLog(action, target) {
    state.auditLog.unshift({
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: "Admin Sarah M.",
      action,
      target
    });
    state.auditLog = state.auditLog.slice(0, 12);
  }

  function approveDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return;
    doctor.approvalStatus = "Approved";
    doctor.accountStatus = "Active";
    doctor.rejectionReason = "";
    doctor.statusHistory.unshift({
      date: new Date().toISOString(),
      label: "Doctor approved and account activated",
      by: "Admin Sarah M."
    });
    addAuditLog("Approved doctor registration", id);
    persistState();
    showToast(`${doctor.name} approved successfully.`);
  }

  function rejectDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return;
    doctor.approvalStatus = "Rejected";
    doctor.accountStatus = "Inactive";
    doctor.rejectionReason = reason || "No rejection reason was provided.";
    doctor.statusHistory.unshift({
      date: new Date().toISOString(),
      label: `Doctor rejected${reason ? `: ${reason}` : ""}`,
      by: "Admin Sarah M."
    });
    addAuditLog("Rejected doctor registration", id);
    persistState();
    showToast(`${doctor.name} was rejected.`, "danger");
  }

  function deactivateDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return;
    doctor.accountStatus = "Inactive";
    doctor.statusHistory.unshift({
      date: new Date().toISOString(),
      label: "Doctor account deactivated",
      by: "Admin Sarah M."
    });
    addAuditLog("Deactivated doctor account", id);
    persistState();
    showToast(`${doctor.name} deactivated.`);
  }

  function reactivateDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return;
    doctor.accountStatus = "Active";
    if (doctor.approvalStatus === "Rejected") {
      doctor.approvalStatus = "Approved";
    }
    doctor.statusHistory.unshift({
      date: new Date().toISOString(),
      label: "Doctor account reactivated",
      by: "Admin Sarah M."
    });
    addAuditLog("Reactivated doctor account", id);
    persistState();
    showToast(`${doctor.name} reactivated.`);
  }

  function deleteDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return;
    state.doctors = state.doctors.filter((entry) => entry.id !== id);
    state.tickets = state.tickets.filter((ticket) => ticket.doctorId !== id);
    addAuditLog("Deleted doctor account", id);
    persistState();
    showToast(`${doctor.name} removed from directory.`, "danger");
  }

  function updateTicketStatus(id, status) {
    const ticket = getTicketById(id);
    if (!ticket) return;
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    addAuditLog(`Updated support ticket status to ${status}`, id);
    persistState();
  }

  function replyToTicket(id, body) {
    const ticket = getTicketById(id);
    if (!ticket) return;
    ticket.messages.push({
      author: "Admin Sarah M.",
      role: "admin",
      body,
      date: new Date().toISOString()
    });
    ticket.updatedAt = new Date().toISOString();
    if (ticket.status === "Open") ticket.status = "In Progress";
    addAuditLog("Replied to doctor support ticket", id);
    persistState();
    showToast("Support reply sent.");
  }

  function renderLineChart(host) {
    if (!host) return;
    const points = state.registrationSeries;
    if (!points.length) return;
    const max = Math.max(...points.map((entry) => entry.value), 1);
    const width = 560;
    const height = 220;
    const step = width / (points.length - 1 || 1);

    const pointString = points
      .map((entry, index) => {
        const x = step * index;
        const y = height - (entry.value / max) * (height - 24) - 12;
        return `${x},${y}`;
      })
      .join(" ");

    host.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#76ebff"></stop>
            <stop offset="100%" stop-color="#338cff"></stop>
          </linearGradient>
          <linearGradient id="line-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(87,159,255,0.35)"></stop>
            <stop offset="100%" stop-color="rgba(87,159,255,0)"></stop>
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="url(#line-gradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${pointString}"></polyline>
      </svg>
    `;

    const labels = document.getElementById("registration-labels");
    if (labels) {
      labels.innerHTML = points.map((entry) => `<span>${entry.label}</span>`).join("");
    }
  }

  function populateOverview() {
    const doctors = state.doctors;
    const pending = doctors.filter((doctor) => doctor.approvalStatus === "Pending");
    const approved = doctors.filter((doctor) => doctor.approvalStatus === "Approved");
    const rejected = doctors.filter((doctor) => doctor.approvalStatus === "Rejected");
    const active = doctors.filter((doctor) => doctor.accountStatus === "Active");
    const inactive = doctors.filter((doctor) => doctor.accountStatus === "Inactive");
    const openTickets = state.tickets.filter((ticket) => ["Open", "In Progress"].includes(ticket.status));

    const values = {
      "metric-total": doctors.length,
      "metric-pending": pending.length,
      "metric-active": active.length,
      "metric-inactive": inactive.length,
      "metric-tickets": openTickets.length,
      "metric-rejected": rejected.length
    };

    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    });

    const recentRegistrations = [...doctors]
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 5);
    const registrationsBody = document.getElementById("recent-registrations");
    if (registrationsBody) {
      registrationsBody.innerHTML = recentRegistrations
        .map(
          (doctor) => `
            <tr>
              <td>
                <div class="table-meta">
                  <strong>${doctor.name}</strong>
                  <span>${doctor.id}</span>
                </div>
              </td>
              <td>${doctor.specialty}</td>
              <td>${formatDate(doctor.registrationDate)}</td>
              <td>${createBadgeMarkup(doctor.approvalStatus)}</td>
              <td>${createBadgeMarkup(doctor.accountStatus)}</td>
            </tr>
          `
        )
        .join("");
    }

    const recentMessages = [...state.tickets]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 4);
    const messagesList = document.getElementById("recent-messages");
    if (messagesList) {
      messagesList.innerHTML = recentMessages
        .map((ticket) => {
          const doctor = getDoctorById(ticket.doctorId);
          return `
            <article class="list-row">
              <div class="list-row-head">
                <strong>${ticket.subject}</strong>
                ${createBadgeMarkup(ticket.priority)}
              </div>
              <p>${doctor ? doctor.name : "Unknown doctor"} - ${ticket.category}</p>
              <div class="list-row-head">
                ${createBadgeMarkup(ticket.status)}
                <span class="link-action">${formatDate(ticket.updatedAt, true)}</span>
              </div>
            </article>
          `;
        })
        .join("");
    }

    const auditList = document.getElementById("audit-log-list");
    if (auditList) {
      auditList.innerHTML = state.auditLog
        .slice(0, 4)
        .map(
          (entry) => `
            <article class="list-row">
              <div class="list-row-head">
                <strong>${entry.action}</strong>
                <span class="link-action">${formatDate(entry.timestamp, true)}</span>
              </div>
              <p>${entry.actor} - ${entry.target}</p>
            </article>
          `
        )
        .join("");
    }

    const approvalRate = doctors.length ? Math.round((approved.length / doctors.length) * 100) : 0;
    const activationRate = approved.length ? Math.round((active.length / approved.length) * 100) : 0;
    const avgResponseHours = 3.2;

    const approvalNode = document.getElementById("insight-approval-rate");
    const activationNode = document.getElementById("insight-activation-rate");
    const responseNode = document.getElementById("insight-response-time");
    if (approvalNode) approvalNode.textContent = `${approvalRate}%`;
    if (activationNode) activationNode.textContent = `${activationRate}%`;
    if (responseNode) responseNode.textContent = `${avgResponseHours}h`;

    const specialtyList = document.getElementById("specialty-breakdown");
    if (specialtyList) {
      const specialtyCounts = doctors.reduce((acc, doctor) => {
        acc[doctor.specialty] = (acc[doctor.specialty] || 0) + 1;
        return acc;
      }, {});
      const entries = Object.entries(specialtyCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
      specialtyList.innerHTML = entries
        .map(([specialty, count]) => {
          const share = Math.round((count / doctors.length) * 100);
          return `
            <article class="mini-stat">
              <div>
                <strong>${specialty}</strong>
                <span>${share}% of doctor base</span>
              </div>
              <b>${count}</b>
            </article>
          `;
        })
        .join("");
    }

    renderLineChart(document.getElementById("registration-line-chart"));
  }

  function createBadgeMarkup(value, neutralFallback = false) {
    return `<span class="badge ${slugifyBadge(value)}${neutralFallback ? " neutral" : ""}">${value}</span>`;
  }

  function populateDoctorsPage() {
    const body = document.getElementById("doctor-table-body");
    if (!body) return;

    const search = document.getElementById("doctor-search");
    const approvalFilter = document.getElementById("approval-filter");
    const accountFilter = document.getElementById("account-filter");
    const specialtyFilter = document.getElementById("specialty-filter");
    const dateFilter = document.getElementById("date-filter");
    const exportButton = document.getElementById("export-doctors");
    const params = new URLSearchParams(window.location.search);

    const specialties = [...new Set(state.doctors.map((doctor) => doctor.specialty))];
    if (specialtyFilter) {
      specialtyFilter.innerHTML += specialties.map((specialty) => `<option value="${specialty}">${specialty}</option>`).join("");
    }

    const queryApproval = params.get("approval");
    if (queryApproval && approvalFilter) {
      approvalFilter.value = queryApproval;
    }

    const applyFilters = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const approval = approvalFilter?.value || "all";
      const account = accountFilter?.value || "all";
      const specialty = specialtyFilter?.value || "all";
      const dateRange = dateFilter?.value || "all";
      const now = new Date("2026-04-20T12:00:00");

      const filtered = state.doctors.filter((doctor) => {
        const matchesKeyword =
          !keyword ||
          [doctor.name, doctor.email, doctor.id, doctor.phone, doctor.hospital].join(" ").toLowerCase().includes(keyword);
        const matchesApproval = approval === "all" || doctor.approvalStatus === approval;
        const matchesAccount = account === "all" || doctor.accountStatus === account;
        const matchesSpecialty = specialty === "all" || doctor.specialty === specialty;
        let matchesDate = true;
        if (dateRange !== "all") {
          const registrationDate = new Date(doctor.registrationDate);
          const diff = (now - registrationDate) / (1000 * 60 * 60 * 24);
          if (dateRange === "7") matchesDate = diff <= 7;
          if (dateRange === "30") matchesDate = diff <= 30;
          if (dateRange === "90") matchesDate = diff <= 90;
        }
        return matchesKeyword && matchesApproval && matchesAccount && matchesSpecialty && matchesDate;
      });

      body.innerHTML = filtered
        .map((doctor) => {
          const approvalActions =
            doctor.approvalStatus !== "Approved"
              ? `<button class="action-button primary" data-action="approve" data-id="${doctor.id}">Approve</button>`
              : "";
          const rejectAction =
            doctor.approvalStatus !== "Rejected"
              ? `<button class="action-button secondary" data-action="reject" data-id="${doctor.id}">Reject</button>`
              : "";
          const accountAction =
            doctor.accountStatus === "Active"
              ? `<button class="action-button soft" data-action="deactivate" data-id="${doctor.id}">Deactivate</button>`
              : `<button class="action-button soft" data-action="reactivate" data-id="${doctor.id}">Reactivate</button>`;

          const reviewActionRow = [
            `<a class="action-button secondary" href="doctor-details.html?id=${doctor.id}">View</a>`,
            approvalActions,
            rejectAction
          ]
            .filter(Boolean)
            .join("");

          const accountActionRow = [
            accountAction,
            `<button class="action-button danger" data-action="delete" data-id="${doctor.id}">Delete</button>`
          ].join("");

          return `
            <tr>
              <td>
                <div class="table-meta">
                  <strong>${doctor.name}</strong>
                  <span>${doctor.id}</span>
                </div>
              </td>
              <td>${doctor.email}</td>
              <td>${doctor.phone}</td>
              <td>${doctor.specialty}</td>
              <td>${formatDate(doctor.registrationDate)}</td>
              <td>${createBadgeMarkup(doctor.approvalStatus)}</td>
              <td>${createBadgeMarkup(doctor.accountStatus)}</td>
              <td class="table-actions-cell">
                <div class="table-actions">
                  <div class="table-action-group">
                    <span class="table-action-label">Review</span>
                    <div class="table-action-row">
                      ${reviewActionRow}
                    </div>
                  </div>
                  <div class="table-action-group">
                    <span class="table-action-label">Account</span>
                    <div class="table-action-row">
                      ${accountActionRow}
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          `;
        })
        .join("");

      if (!filtered.length) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state">No doctors match the current filters.</div></td></tr>`;
      }
    };

    [search, approvalFilter, accountFilter, specialtyFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", applyFilters);
      element.addEventListener("change", applyFilters);
    });

    if (exportButton) {
      exportButton.addEventListener("click", () => {
        showToast("Doctors list exported to admin handoff queue.");
      });
    }

    body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === "approve") {
        approveDoctor(id);
        applyFilters();
        return;
      }
      if (action === "reactivate") {
        reactivateDoctor(id);
        applyFilters();
        return;
      }
      if (action === "reject") {
        openConfirmation({
          title: "Reject doctor registration",
          message: "You can add an optional rejection reason before rejecting this doctor.",
          confirmLabel: "Reject doctor",
          reasonField: true,
          variant: "danger",
          onConfirm: (reason) => {
            rejectDoctor(id, reason);
            applyFilters();
          }
        });
        return;
      }
      if (action === "deactivate") {
        openConfirmation({
          title: "Deactivate doctor account",
          message: "This doctor will lose access to the platform until reactivated by an admin.",
          confirmLabel: "Deactivate account",
          variant: "danger",
          onConfirm: () => {
            deactivateDoctor(id);
            applyFilters();
          }
        });
        return;
      }
      if (action === "delete") {
        openConfirmation({
          title: "Delete doctor account",
          message: "This action permanently removes the doctor record and related support history from the mock admin dashboard.",
          confirmLabel: "Delete doctor",
          variant: "danger",
          onConfirm: () => {
            deleteDoctor(id);
            applyFilters();
          }
        });
      }
    });

    applyFilters();
  }

  function populateDoctorDetails() {
    const root = document.getElementById("doctor-detail-root");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get("id") || state.doctors[0]?.id;
    const doctor = getDoctorById(selectedId);
    if (!doctor) return;

    const supportHistory = getDoctorTickets(doctor.id);
    document.getElementById("detail-name").textContent = doctor.name;
    document.getElementById("detail-subtitle").textContent = `${doctor.specialty} - ${doctor.hospital}`;
    document.getElementById("detail-approval").innerHTML = createBadgeMarkup(doctor.approvalStatus);
    document.getElementById("detail-account").innerHTML = createBadgeMarkup(doctor.accountStatus);
    document.getElementById("detail-email").textContent = doctor.email;
    document.getElementById("detail-phone").textContent = doctor.phone;
    document.getElementById("detail-license").textContent = doctor.licenseNumber;
    document.getElementById("detail-hospital").textContent = doctor.hospital;
    document.getElementById("detail-specialty").textContent = doctor.specialty;
    document.getElementById("detail-location").textContent = `${doctor.city}, ${doctor.country}`;
    document.getElementById("detail-practice").textContent = `${doctor.yearsPractice} years`;
    document.getElementById("detail-registration").textContent = formatDate(doctor.registrationDate, true);
    document.getElementById("detail-notes").textContent = doctor.notes;
    document.getElementById("detail-assigned").textContent = doctor.assignedAdmin;

    const documents = document.getElementById("detail-documents");
    documents.innerHTML = doctor.submittedDocuments
      .map(
        (document) => `
          <article class="document-row">
            <div>
              <strong>${document.label}</strong>
              <small>${document.file}</small>
            </div>
            ${createBadgeMarkup(document.verified ? "Approved" : "Pending")}
          </article>
        `
      )
      .join("");

    const timeline = document.getElementById("detail-timeline");
    timeline.innerHTML = doctor.statusHistory
      .map(
        (entry) => `
          <article class="timeline-item">
            <strong>${entry.label}</strong>
            <p>${entry.by}</p>
            <span>${formatDate(entry.date, true)}</span>
          </article>
        `
      )
      .join("");

    const supportList = document.getElementById("detail-support-history");
    supportList.innerHTML = supportHistory.length
      ? supportHistory
          .map(
            (ticket) => `
              <article class="list-row">
                <div class="list-row-head">
                  <strong>${ticket.subject}</strong>
                  ${createBadgeMarkup(ticket.status)}
                </div>
                <p>${ticket.category} - ${formatDate(ticket.updatedAt, true)}</p>
              </article>
            `
          )
          .join("")
      : `<div class="empty-state">No support history recorded for this doctor.</div>`;

    const actions = document.getElementById("detail-actions");
    actions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-detail-action]");
      if (!button) return;
      const action = button.dataset.detailAction;
      if (action === "approve") {
        approveDoctor(doctor.id);
        window.location.reload();
        return;
      }
      if (action === "reactivate") {
        reactivateDoctor(doctor.id);
        window.location.reload();
        return;
      }
      if (action === "reject") {
        openConfirmation({
          title: "Reject doctor registration",
          message: "Add an optional rejection reason before saving this decision.",
          confirmLabel: "Reject doctor",
          reasonField: true,
          variant: "danger",
          onConfirm: (reason) => {
            rejectDoctor(doctor.id, reason);
            window.location.reload();
          }
        });
        return;
      }
      if (action === "deactivate") {
        openConfirmation({
          title: "Deactivate doctor account",
          message: "This doctor will be prevented from using the platform until reactivated.",
          confirmLabel: "Deactivate account",
          variant: "danger",
          onConfirm: () => {
            deactivateDoctor(doctor.id);
            window.location.reload();
          }
        });
        return;
      }
      if (action === "delete") {
        openConfirmation({
          title: "Delete doctor account",
          message: "This permanently removes the doctor from the mock admin dashboard.",
          confirmLabel: "Delete doctor",
          variant: "danger",
          onConfirm: () => {
            deleteDoctor(doctor.id);
            window.location.href = "doctors.html";
          }
        });
      }
    });
  }

  function populateSupportCenter() {
    const list = document.getElementById("support-ticket-list");
    if (!list) return;

    const search = document.getElementById("ticket-search");
    const statusFilter = document.getElementById("ticket-status-filter");
    const priorityFilter = document.getElementById("ticket-priority-filter");
    const dateFilter = document.getElementById("ticket-date-filter");
    const replyForm = document.getElementById("reply-form");
    const replyInput = document.getElementById("reply-message");
    const statusSelect = document.getElementById("ticket-status-select");
    const resolveButton = document.getElementById("resolve-toggle");
    const params = new URLSearchParams(window.location.search);
    let currentTicketId = null;

    const queryStatus = params.get("status");
    if (queryStatus && statusFilter) {
      statusFilter.value = queryStatus;
    }

    const renderDetail = (ticket) => {
      if (!ticket) return;
      currentTicketId = ticket.id;
      const doctor = getDoctorById(ticket.doctorId);
      document.getElementById("ticket-subject").textContent = ticket.subject;
      document.getElementById("ticket-meta").textContent = `${doctor ? doctor.name : "Unknown doctor"} - ${ticket.category}`;
      document.getElementById("ticket-status-badge").innerHTML = createBadgeMarkup(ticket.status);
      document.getElementById("ticket-priority-badge").innerHTML = createBadgeMarkup(ticket.priority);
      document.getElementById("ticket-assigned").textContent = ticket.assignedAdmin;
      document.getElementById("ticket-created").textContent = formatDate(ticket.createdAt, true);
      document.getElementById("ticket-updated").textContent = formatDate(ticket.updatedAt, true);
      statusSelect.value = ticket.status;
      resolveButton.textContent = ticket.status === "Resolved" ? "Mark unresolved" : "Mark resolved";

      const conversation = document.getElementById("conversation-thread");
      conversation.innerHTML = ticket.messages
        .map(
          (message) => `
            <article class="message-bubble ${message.role === "admin" ? "admin" : ""}">
              <strong>${message.author}</strong>
              <p>${message.body}</p>
              <time>${formatDate(message.date, true)}</time>
            </article>
          `
        )
        .join("");

      list.querySelectorAll(".ticket-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.ticketId === ticket.id);
      });
    };

    const renderTickets = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const status = statusFilter?.value || "all";
      const priority = priorityFilter?.value || "all";
      const dateRange = dateFilter?.value || "all";
      const now = new Date("2026-04-20T12:00:00");

      const filtered = state.tickets.filter((ticket) => {
        const doctor = getDoctorById(ticket.doctorId);
        const haystack = [ticket.subject, doctor?.name || "", ticket.id, ticket.category].join(" ").toLowerCase();
        const matchesKeyword = !keyword || haystack.includes(keyword);
        const matchesStatus = status === "all" || ticket.status === status;
        const matchesPriority = priority === "all" || ticket.priority === priority;
        let matchesDate = true;
        if (dateRange !== "all") {
          const diff = (now - new Date(ticket.updatedAt)) / (1000 * 60 * 60 * 24);
          if (dateRange === "7") matchesDate = diff <= 7;
          if (dateRange === "30") matchesDate = diff <= 30;
        }
        return matchesKeyword && matchesStatus && matchesPriority && matchesDate;
      });

      list.innerHTML = filtered.length
        ? filtered
            .map((ticket) => {
              const doctor = getDoctorById(ticket.doctorId);
              return `
                <button class="ticket-item" type="button" data-ticket-id="${ticket.id}">
                  <div class="list-row-head">
                    <strong>${ticket.subject}</strong>
                    ${createBadgeMarkup(ticket.priority)}
                  </div>
                  <small>${doctor ? doctor.name : "Unknown doctor"} - ${ticket.category}</small>
                  <div class="list-row-head">
                    ${createBadgeMarkup(ticket.status)}
                    <span class="link-action">${formatDate(ticket.updatedAt, true)}</span>
                  </div>
                </button>
              `;
            })
            .join("")
        : `<div class="empty-state">No support tickets match the current filters.</div>`;

      const candidate = filtered.find((ticket) => ticket.id === currentTicketId) || filtered[0];
      if (candidate) {
        renderDetail(candidate);
      } else {
        currentTicketId = null;
        document.getElementById("ticket-subject").textContent = "No ticket selected";
        document.getElementById("ticket-meta").textContent = "Adjust filters to view a support conversation.";
        document.getElementById("ticket-status-badge").innerHTML = createBadgeMarkup("Open", true);
        document.getElementById("ticket-priority-badge").innerHTML = createBadgeMarkup("Low", true);
        document.getElementById("conversation-thread").innerHTML = `<div class="empty-state">No messages available.</div>`;
      }
    };

    [search, statusFilter, priorityFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", renderTickets);
      element.addEventListener("change", renderTickets);
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ticket-id]");
      if (!button) return;
      const ticket = getTicketById(button.dataset.ticketId);
      if (ticket) renderDetail(ticket);
    });

    statusSelect.addEventListener("change", () => {
      if (!currentTicketId) return;
      updateTicketStatus(currentTicketId, statusSelect.value);
      showToast(`Ticket status updated to ${statusSelect.value}.`);
      renderTickets();
    });

    resolveButton.addEventListener("click", () => {
      if (!currentTicketId) return;
      const ticket = getTicketById(currentTicketId);
      const nextStatus = ticket.status === "Resolved" ? "In Progress" : "Resolved";
      updateTicketStatus(currentTicketId, nextStatus);
      showToast(`Ticket marked ${nextStatus}.`);
      renderTickets();
    });

    replyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!currentTicketId || !replyInput.value.trim()) return;
      replyToTicket(currentTicketId, replyInput.value.trim());
      replyInput.value = "";
      renderTickets();
      const selected = getTicketById(currentTicketId);
      if (selected) renderDetail(selected);
    });

    renderTickets();
  }

  function createModal() {
    if (document.getElementById("confirmation-modal")) return;
    const modal = document.createElement("section");
    modal.className = "modal-shell";
    modal.id = "confirmation-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal></div>
      <div class="modal-card" id="confirmation-card">
        <div class="modal-head">
          <div>
            <h3 id="confirmation-title">Confirm action</h3>
            <p id="confirmation-message">Are you sure you want to continue?</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close confirmation" data-close-modal>X</button>
        </div>
        <form class="modal-form" id="confirmation-form">
          <div id="confirmation-reason-wrap" hidden>
            <label class="filter-label" for="confirmation-reason">Optional rejection reason</label>
            <textarea class="control" id="confirmation-reason" rows="4" placeholder="Add an optional reason for this action..."></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" data-close-modal>Cancel</button>
            <button class="btn btn-danger" type="submit" id="confirmation-submit">Confirm</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-modal")) closeConfirmation();
    });

    document.getElementById("confirmation-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const reason = document.getElementById("confirmation-reason").value.trim();
      if (pendingConfirmation?.onConfirm) pendingConfirmation.onConfirm(reason);
      closeConfirmation();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeConfirmation();
    });
  }

  function openConfirmation(options) {
    createModal();
    pendingConfirmation = options;
    const modal = document.getElementById("confirmation-modal");
    const card = document.getElementById("confirmation-card");
    const reasonWrap = document.getElementById("confirmation-reason-wrap");
    const reasonInput = document.getElementById("confirmation-reason");
    document.getElementById("confirmation-title").textContent = options.title;
    document.getElementById("confirmation-message").textContent = options.message;
    document.getElementById("confirmation-submit").textContent = options.confirmLabel || "Confirm";
    card.classList.toggle("danger", options.variant === "danger");
    reasonWrap.hidden = !options.reasonField;
    reasonInput.value = "";
    modal.hidden = false;
  }

  function closeConfirmation() {
    const modal = document.getElementById("confirmation-modal");
    if (modal) modal.hidden = true;
    pendingConfirmation = null;
  }

  function showToast(message, variant = "success") {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${variant}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function buildNotificationItems() {
    const pendingDoctors = [...state.doctors]
      .filter((doctor) => doctor.approvalStatus === "Pending")
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 2)
      .map(
        (doctor) => `
          <article class="topbar-popover-item">
            <div>
              <strong>${doctor.name}</strong>
              <p>Pending approval · ${doctor.specialty}</p>
            </div>
            <span>${formatDate(doctor.registrationDate)}</span>
          </article>
        `
      );

    const openTickets = [...state.tickets]
      .filter((ticket) => ["Open", "In Progress"].includes(ticket.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 2)
      .map((ticket) => {
        const doctor = getDoctorById(ticket.doctorId);
        return `
          <article class="topbar-popover-item">
            <div>
              <strong>${ticket.subject}</strong>
              <p>${doctor ? doctor.name : "Unknown doctor"} · ${ticket.status}</p>
            </div>
            <span>${formatDate(ticket.updatedAt, true)}</span>
          </article>
        `;
      });

    return [...pendingDoctors, ...openTickets].join("");
  }

  function buildNotificationItems() {
    const pendingDoctors = [...state.doctors]
      .filter((doctor) => doctor.approvalStatus === "Pending")
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 2);

    const supportMessages = [...state.tickets]
      .filter((ticket) => ["Open", "In Progress"].includes(ticket.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);

    const sections = [];

    if (pendingDoctors.length) {
      sections.push(`
        <section class="topbar-popover-section">
          <div class="topbar-popover-section-head">
            <strong>Pending doctor approvals</strong>
            <span>${pendingDoctors.length}</span>
          </div>
          <div class="topbar-popover-list">
            ${pendingDoctors
              .map(
                (doctor) => `
                  <article class="topbar-popover-item">
                    <div>
                      <strong>${doctor.name}</strong>
                      <p>Pending approval · ${doctor.specialty}</p>
                    </div>
                    <span>${formatDate(doctor.registrationDate)}</span>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `);
    }

    if (supportMessages.length) {
      sections.push(`
        <section class="topbar-popover-section">
          <div class="topbar-popover-section-head">
            <strong>Support message notifications</strong>
            <span>${supportMessages.length}</span>
          </div>
          <div class="topbar-popover-list">
            ${supportMessages
              .map((ticket) => {
                const doctor = getDoctorById(ticket.doctorId);
                return `
                  <article class="topbar-popover-item">
                    <div>
                      <strong>${ticket.subject}</strong>
                      <p>${doctor ? doctor.name : "Unknown doctor"} · ${ticket.status}</p>
                    </div>
                    <span>${formatDate(ticket.updatedAt, true)}</span>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `);
    }

    if (!sections.length) {
      return `
        <section class="topbar-popover-section">
          <div class="topbar-popover-empty">
            <strong>No new alerts</strong>
            <p>Doctor approvals and support message notifications will appear here.</p>
          </div>
        </section>
      `;
    }

    return sections.join("").replace(/Â·/g, " - ");
  }

  function setupTopbarMenus() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;

    const notificationTrigger = actions.querySelector(".notification-trigger");
    const profileTrigger = actions.querySelector(".profile-trigger");

    if (notificationTrigger && !actions.querySelector("#admin-notification-popover")) {
      const notificationCount = state.doctors.filter((doctor) => doctor.approvalStatus === "Pending").length
        + state.tickets.filter((ticket) => ["Open", "In Progress"].includes(ticket.status)).length;
      const notificationDot = notificationTrigger.querySelector(".notification-dot");
      if (notificationDot) {
        notificationDot.textContent = String(notificationCount);
        notificationDot.hidden = notificationCount === 0;
      }

      const notificationPopover = document.createElement("div");
      notificationPopover.className = "topbar-popover";
      notificationPopover.id = "admin-notification-popover";
      notificationPopover.hidden = true;
      notificationPopover.innerHTML = `
        <div class="topbar-popover-head">
          <div>
            <strong>Notifications</strong>
            <p>Recent doctor approvals and support message activity.</p>
          </div>
        </div>
        <div class="topbar-popover-list">${buildNotificationItems()}</div>
      `;
      actions.appendChild(notificationPopover);

      notificationTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        notificationPopover.querySelector(".topbar-popover-list").innerHTML = buildNotificationItems();
        notificationPopover.hidden = !notificationPopover.hidden;
        const profilePopover = document.getElementById("admin-profile-popover");
        if (profilePopover) profilePopover.hidden = true;
      });
    }

    if (profileTrigger && !actions.querySelector("#admin-profile-popover")) {
      const profilePopover = document.createElement("div");
      profilePopover.className = "topbar-popover topbar-popover-profile";
      profilePopover.id = "admin-profile-popover";
      profilePopover.hidden = true;
      profilePopover.innerHTML = `
        <div class="topbar-popover-head">
          <div class="topbar-popover-profile-copy">
            <strong>Sarah M.</strong>
            <p>Lead platform admin</p>
          </div>
        </div>
        <div class="topbar-popover-actions">
          <button class="btn btn-secondary topbar-logout-button" type="button">Logout</button>
        </div>
      `;
      actions.appendChild(profilePopover);

      profileTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        profilePopover.hidden = !profilePopover.hidden;
        const notificationPopover = document.getElementById("admin-notification-popover");
        if (notificationPopover) notificationPopover.hidden = true;
      });

      profilePopover.querySelector(".topbar-logout-button").addEventListener("click", () => {
        logoutAdmin();
      });
    }

    document.addEventListener("click", (event) => {
      if (!actions.contains(event.target)) {
        const notificationPopover = document.getElementById("admin-notification-popover");
        const profilePopover = document.getElementById("admin-profile-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        if (profilePopover) profilePopover.hidden = true;
      }
    });
  }

  function setupSidebar() {
    const sidebar = document.querySelector(".admin-sidebar");
    const toggle = document.querySelector(".topbar-toggle");
    if (!sidebar || !toggle) return;
    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("is-open");
    });
  }

  function init() {
    if (!requireAuth()) return;
    setupSidebar();
    setupTopbarMenus();
    createModal();
    const page = document.body.dataset.page;
    if (page === "overview") populateOverview();
    if (page === "doctors") populateDoctorsPage();
    if (page === "doctor-details") populateDoctorDetails();
    if (page === "support") populateSupportCenter();
  }

  window.NoufarAdminApp = {
    openConfirmation,
    showToast
  };

  document.addEventListener("DOMContentLoaded", init);
})();
