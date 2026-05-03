(function () {
  const STORAGE_KEY = "noufar-admin-dashboard-state-v1";
  const AUTH_KEY = "noufar-admin-auth-v1";
  const UI_KEY = "noufar-admin-ui-v1";
  const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
  const DEFAULT_SYSTEM_MODEL = "Logistic Regression";
  const SYSTEM_MODEL_OPTIONS = [
    {
      key: "logistic_regression",
      label: "Logistic Regression",
      description: "Fast linear baseline for structured relapse scoring."
    },
    {
      key: "random_forest",
      label: "Random Forest",
      description: "Tree-based ensemble that captures non-linear feature patterns."
    },
    {
      key: "deep_neural_network",
      label: "Deep Neural Network",
      description: "High-capacity model for complex signal interactions in the review layer."
    }
  ];
  const seed = window.NoufarAdminSeed || { doctors: [], tickets: [], predictions: [], auditLog: [], registrationSeries: [] };
  let state = loadState();
  let pendingConfirmation = null;
  let adminUi = loadUiState();
  let adminNotificationsCache = [];
  let previousUnreadNotificationCount = null;
  let adminNotificationPollingStarted = false;
  let adminNotificationAudioArmed = false;
  let adminNotificationAudio = null;
  let adminRealtimeSource = null;
  let adminRealtimeConnected = false;
  const ADMIN_FALLBACK_POLL_INTERVAL = 15000;
  let adminRealtimeRefreshTimer = null;
  let adminRealtimeRefreshInFlight = false;
  let adminRealtimeRefreshQueued = false;
  let systemPredictionsCache = [];
  let systemModelOptionsCache = SYSTEM_MODEL_OPTIONS.map((option) => ({ ...option, deployed: option.key === "logistic_regression" }));

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
        predictions: parsed.predictions || clone(seed.predictions || []),
        tickets: clone(seed.tickets),
        auditLog: parsed.auditLog || clone(seed.auditLog),
        registrationSeries: clone(seed.registrationSeries),
        readNotifications: []
      };
    } catch (error) {
      return {
        doctors: clone(seed.doctors),
        predictions: clone(seed.predictions || []),
        tickets: clone(seed.tickets),
        auditLog: clone(seed.auditLog),
        registrationSeries: clone(seed.registrationSeries),
        readNotifications: []
      };
    }
  }

  function persistState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        predictions: state.predictions || [],
        tickets: [],
        readNotifications: [],
      })
    );
    document.dispatchEvent(new CustomEvent("noufar-admin-state-updated"));
  }

  function loadUiState() {
    try {
      const saved = localStorage.getItem(UI_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      const selectedModel = SYSTEM_MODEL_OPTIONS.some((option) => option.label === parsed.systemModel)
        ? parsed.systemModel
        : DEFAULT_SYSTEM_MODEL;
      return {
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
        systemModel: selectedModel
      };
    } catch (error) {
      return { sidebarCollapsed: false, systemModel: DEFAULT_SYSTEM_MODEL };
    }
  }

  function persistUiState() {
    localStorage.setItem(UI_KEY, JSON.stringify(adminUi));
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
    return Boolean(session?.authenticated && session?.token && session?.user?.role === "admin");
  }

  function requireAuth() {
    if (isAuthenticated()) return true;
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
    return false;
  }

  function logoutAdmin() {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
  }

  async function requestAdminJson(path, options = {}) {
    const session = getAuthSession();
    const token = session?.token;

    if (!token) {
      throw new Error("Admin session token is missing");
    }

    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || "Admin request failed");
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async function fetchAdminNotifications() {
    const notifications = await requestAdminJson("/notifications");
    adminNotificationsCache = Array.isArray(notifications) ? notifications : [];
    return adminNotificationsCache;
  }

  function getCurrentAdminPage() {
    return document.body.dataset.page || "overview";
  }

  function adminPageNeedsSupportTickets(page = getCurrentAdminPage()) {
    return page === "overview" || page === "support" || page === "doctor-details";
  }

  function adminPageNeedsPredictions(page = getCurrentAdminPage()) {
    return page === "system";
  }

  async function runAdminRealtimeRefresh() {
    if (adminRealtimeRefreshInFlight) {
      adminRealtimeRefreshQueued = true;
      return;
    }

    adminRealtimeRefreshInFlight = true;

    try {
      const refreshTasks = [syncDoctorsFromBackend()];
      if (adminPageNeedsPredictions()) {
        refreshTasks.push(syncPredictionsFromBackend());
      }
      if (adminPageNeedsSupportTickets()) {
        refreshTasks.push(syncSupportTicketsFromBackend());
      }

      await Promise.allSettled(refreshTasks);

      document.dispatchEvent(new CustomEvent("noufar-admin-state-updated"));
      renderCurrentAdminPage();
    } finally {
      adminRealtimeRefreshInFlight = false;

      if (adminRealtimeRefreshQueued) {
        adminRealtimeRefreshQueued = false;
        runAdminRealtimeRefresh().catch(() => {});
      }
    }
  }

  function scheduleAdminRealtimeRefresh() {
    if (adminRealtimeRefreshTimer) {
      clearTimeout(adminRealtimeRefreshTimer);
    }

    adminRealtimeRefreshTimer = setTimeout(() => {
      adminRealtimeRefreshTimer = null;
      runAdminRealtimeRefresh().catch(() => {});
    }, 250);
  }

  function startAdminRealtimeStream() {
    if (adminRealtimeSource || !isAuthenticated() || typeof EventSource === "undefined") return;

    const session = getAuthSession();
    if (!session?.token) return;

    const streamUrl = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(session.token)}`;
    adminRealtimeSource = new EventSource(streamUrl);
    adminRealtimeSource.addEventListener("open", () => {
      adminRealtimeConnected = true;
    });

    adminRealtimeSource.addEventListener("notification:new", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("support:ticket-updated", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("doctor:registration", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("error", () => {
      adminRealtimeConnected = false;
      if (!isAuthenticated()) {
        adminRealtimeSource?.close();
        adminRealtimeSource = null;
      }
    });
  }

  function armAdminNotificationAudio() {
    adminNotificationAudioArmed = true;
  }

  function getAdminNotificationAudio() {
    if (!adminNotificationAudio) {
      adminNotificationAudio = new Audio("assets/admin%20sound.mp3");
      adminNotificationAudio.preload = "auto";
    }
    return adminNotificationAudio;
  }

  async function playAdminNotificationSound() {
    if (!adminNotificationAudioArmed || document.hidden) return;
    const audio = getAdminNotificationAudio();
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      // Ignore autoplay or transient playback errors.
    }
  }

  async function markAdminNotificationAsRead(notificationId) {
    const response = await requestAdminJson(`/notifications/${notificationId}/read`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    if (response?.notification) {
      adminNotificationsCache = adminNotificationsCache.map((notification) =>
        notification.id === response.notification.id ? response.notification : notification
      );
    }

    return response?.notification;
  }

  async function markAllAdminNotificationsAsRead() {
    await requestAdminJson("/notifications/read-all", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    adminNotificationsCache = adminNotificationsCache.map((notification) => ({
      ...notification,
      isRead: true,
      readAt: notification.readAt || new Date().toISOString(),
    }));
  }

  async function openAdminNotificationTarget(notificationId) {
    const response = await requestAdminJson(`/notifications/${notificationId}/open`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (response?.notification) {
      adminNotificationsCache = adminNotificationsCache.map((notification) =>
        notification.id === response.notification.id ? response.notification : notification
      );
    }

    return response?.target || null;
  }

  function buildDoctorInitials(name = "") {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function mapBackendUserToDoctor(user) {
    const nameParts = String(user.name || "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "Doctor";
    const lastName = nameParts.slice(1).join(" ") || "Account";
    const isApproved = user.approvalStatus === "Approved";
    const registrationDate = user.createdAt || new Date().toISOString();

    return {
      id: user._id,
      firstName,
      lastName,
      name: user.name || `${firstName} ${lastName}`.trim(),
      email: user.email || "",
      phone: user.phone || "Not provided",
      specialty: user.specialty || "Not specified",
      hospital: user.hospital || "Not provided",
      city: user.city || "",
      country: user.country || "",
      registrationDate,
      approvalStatus: user.approvalStatus || "Pending",
      accountStatus: user.accountStatus || (isApproved ? "Active" : "Inactive"),
      assignedAdmin: user.assignedAdmin || "Unassigned",
      licenseNumber: user.licenseNumber || "",
      yearsPractice: Number(user.yearsPractice || 0),
      deactivationReason: user.deactivationReason || "",
      submittedDocuments: Array.isArray(user.submittedDocuments)
        ? user.submittedDocuments.map((document) => ({
            label: document.label,
            file: document.file || document.fileName || "",
            filePath: document.filePath || "",
            mimeType: document.mimeType || "",
            fileSize: document.fileSize || 0,
            verified: Boolean(document.verified),
          }))
        : [],
      notes: user.notes || "Registered through the doctor signup form.",
      supportTicketIds: Array.isArray(user.supportTicketIds) ? user.supportTicketIds : [],
      rejectionReason: user.rejectionReason || "",
      deletionReason: user.deletionReason || "",
      avatarInitials: buildDoctorInitials(user.name),
      statusHistory:
        Array.isArray(user.statusHistory) && user.statusHistory.length
          ? user.statusHistory
          : [
              {
                date: registrationDate,
                label: "Doctor registration submitted",
                by: "System",
              },
              ...(user.approvalStatus === "Pending"
                ? [
                    {
                      date: registrationDate,
                      label: "Waiting for admin approval",
                      by: "System",
                    },
                  ]
                : []),
            ],
    };
  }

  async function syncDoctorsFromBackend() {
    try {
      const users = await requestAdminJson("/auth/admin/users");
      const backendDoctors = users
        .filter((user) => user.role === "doctor")
        .map((user) => mapBackendUserToDoctor(user));

      if (!backendDoctors.length) return;

      state.doctors = backendDoctors;
    } catch (error) {
      console.warn("Unable to load doctors from backend:", error.message);
    }
  }

  function formatModelName(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return DEFAULT_SYSTEM_MODEL;
    if (normalized === "logisticregression" || normalized === "logistic regression") {
      return "Logistic Regression";
    }
    if (normalized === "randomforest" || normalized === "random forest") {
      return "Random Forest";
    }
    if (
      normalized === "deepneuralnetwork" ||
      normalized === "deep neural network" ||
      normalized === "dnn"
    ) {
      return "Deep Neural Network";
    }
    return String(value);
  }

  function mapBackendPredictionToSystemRecord(entry) {
    const runDate = entry.createdAt || entry.analyzedAt || entry.updatedAt || new Date().toISOString();
    return {
      id: String(entry._id || entry.id || ""),
      doctorId: String(entry.predictedBy || ""),
      doctorName: entry.predictedByName || entry.doctorName || "Unknown doctor",
      source: entry.source || "Manual",
      result:
        entry.result ||
        (Number(entry.prediction) === 1 ? "Relapse" : "No Relapse"),
      actualOutcome: entry.actualOutcome || "",
      validationStatus: entry.validationStatus || "Pending",
      validationRecordedAt: entry.validationRecordedAt || "",
      modelName: formatModelName(entry.modelName),
      runDate,
      analyzedAt: runDate,
      updatedAt: entry.updatedAt || runDate,
      validatedByName: entry.validatedByName || "",
    };
  }

  async function syncPredictionsFromBackend() {
    try {
      const predictions = await requestAdminJson("/predictions");
      systemPredictionsCache = Array.isArray(predictions)
        ? predictions.map((entry) => mapBackendPredictionToSystemRecord(entry))
        : [];
      state.predictions = clone(systemPredictionsCache);
      persistState();
    } catch (error) {
      console.warn("Unable to load predictions from backend:", error.message);
      systemPredictionsCache = Array.isArray(state.predictions)
        ? clone(state.predictions)
        : [];
    }
  }

  function mapBackendTicketToTicket(ticket) {
    return {
      id: ticket.id,
      doctorId: ticket.doctorId,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedAdmin: ticket.assignedAdmin || "Unassigned",
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      unreadByAdmin: Boolean(ticket.unreadByAdmin),
      unreadByDoctor: Boolean(ticket.unreadByDoctor),
      lastDoctorMessageAt: ticket.lastDoctorMessageAt,
      lastAdminMessageAt: ticket.lastAdminMessageAt,
      messages: Array.isArray(ticket.messages)
        ? ticket.messages.map((message) => ({
            id: message.id,
            author: message.senderName,
            role: message.senderRole,
            body: message.body,
            preview: message.preview || message.body || "",
            attachment: message.attachment || null,
            date: message.createdAt,
            readByAdmin: message.readByAdmin,
            readByDoctor: message.readByDoctor,
          }))
        : [],
    };
  }

  function escapeAdminHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatSupportFileSize(size) {
    const fileSize = Number(size || 0);
    if (!fileSize) return "";
    if (fileSize < 1024) return `${fileSize} B`;
    if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getTicketMessagePreview(message, fallbackText) {
    return (
      String(message?.body || "").trim() ||
      (message?.attachment?.originalName
        ? `Shared file: ${message.attachment.originalName}`
        : fallbackText)
    );
  }

  function buildSupportAttachmentMarkup(attachment, role) {
    if (!attachment?.fileUrl && !attachment?.filePath) return "";

    const fileUrl = attachment.fileUrl || attachment.filePath;
    const fileName = attachment.originalName || attachment.fileName || "Attachment";
    const metaParts = [
      attachment.mimeType ? attachment.mimeType.split("/").pop()?.toUpperCase() : "",
      formatSupportFileSize(attachment.fileSize),
    ].filter(Boolean);

    return `
      <div class="support-attachment-card support-attachment-card-${role}">
        <div class="support-attachment-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8"></path></svg>
        </div>
        <div class="support-attachment-copy">
          <strong>${escapeAdminHtml(fileName)}</strong>
          ${metaParts.length ? `<span>${escapeAdminHtml(metaParts.join(" • "))}</span>` : ""}
        </div>
        <div class="support-attachment-actions">
          <a href="${escapeAdminHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open file" title="Open file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.5h5.5L19 9v10.5A1.5 1.5 0 0 1 17.5 21h-9A1.5 1.5 0 0 1 7 19.5v-14A1.5 1.5 0 0 1 8.5 4h4.5"></path><path d="M13 4v5h5"></path><path d="M10 13h4"></path><path d="M10 16h4"></path></svg>
          </a>
          <a href="${escapeAdminHtml(fileUrl)}" download="${escapeAdminHtml(fileName)}" aria-label="Download file" title="Download file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10"></path><path d="m8 10 4 4 4-4"></path><path d="M5 19h14"></path></svg>
          </a>
        </div>
      </div>
    `;
  }

  function buildSupportReplyFormData(body, file) {
    const formData = new FormData();
    if (body) formData.append("body", body);
    if (file) formData.append("attachment", file);
    return formData;
  }

  async function syncSupportTicketsFromBackend() {
    try {
      const tickets = await requestAdminJson("/support/admin/tickets");
      state.tickets = Array.isArray(tickets) ? tickets.map((ticket) => mapBackendTicketToTicket(ticket)) : [];
      return state.tickets;
    } catch (error) {
      console.warn("Unable to load support tickets from backend:", error.message);
      return state.tickets;
    }
  }

  async function markAdminSupportTicketsRead() {
    try {
      await requestAdminJson("/support/admin/tickets/read", {
        method: "PATCH",
        body: JSON.stringify({}),
      });

      state.tickets = state.tickets.map((ticket) => ({
        ...ticket,
        unreadByAdmin: false,
        messages: Array.isArray(ticket.messages)
          ? ticket.messages.map((message) =>
              message.role === "doctor" ? { ...message, readByAdmin: true } : message
            )
          : [],
      }));
      persistState();
    } catch (error) {
      console.warn("Unable to mark admin support notifications as read:", error.message);
    }
  }

  function showAdminThreadUnavailablePopup(message) {
    openConfirmation({
      title: "Thread unavailable",
      message,
      confirmLabel: "Understood",
      variant: "danger",
      hideCancel: true,
      onConfirm: () => {}
    });
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

  function getSelectedSystemModel() {
    return systemModelOptionsCache.some((option) => option.label === adminUi.systemModel)
      ? adminUi.systemModel
      : DEFAULT_SYSTEM_MODEL;
  }

  function getSystemModelOptionByKey(key) {
    return systemModelOptionsCache.find((option) => option.key === key) || null;
  }

  function buildSystemModelOptions() {
    const selectedModel = getSelectedSystemModel();
    return systemModelOptionsCache.map((option) => {
      const isActive = option.label === selectedModel;
      const isUnavailable = option.deployed === false;
      return `
        <button class="system-model-option${isActive ? " is-active" : ""}${isUnavailable ? " is-unavailable" : ""}" type="button" data-system-model="${option.label}" data-system-model-key="${option.key || ""}" ${isUnavailable ? "disabled" : ""}>
          <div>
            <strong>${option.label}</strong>
            <p>${option.description}</p>
          </div>
          <span class="system-model-option-state">${isActive ? "Selected" : isUnavailable ? "Unavailable" : "Select"}</span>
        </button>
      `;
    }).join("");
  }

  function syncSystemModelUi() {
    const selectedModel = getSelectedSystemModel();
    const triggerLabel = document.getElementById("system-model-trigger-label");
    const activeModel = document.getElementById("system-active-model");
    const trigger = document.getElementById("system-model-trigger");
    const popover = document.getElementById("system-model-popover");
    const list = popover?.querySelector(".system-model-options");

    if (triggerLabel) triggerLabel.textContent = selectedModel;
    if (activeModel) activeModel.textContent = selectedModel;
    if (trigger) trigger.setAttribute("aria-label", `Change model. Current model: ${selectedModel}`);
    if (list) list.innerHTML = buildSystemModelOptions();
  }

  async function syncSystemModelFromBackend() {
    const payload = await requestAdminJson("/predictions/models");
    const options = Array.isArray(payload?.options) && payload.options.length ? payload.options : SYSTEM_MODEL_OPTIONS;

    systemModelOptionsCache = options.map((option) => ({
      key: option.key || "",
      label: option.label || DEFAULT_SYSTEM_MODEL,
      description: option.description || "",
      deployed: option.deployed !== false,
    }));

    adminUi.systemModel = payload?.activeModelLabel || DEFAULT_SYSTEM_MODEL;
    persistUiState();
    syncSystemModelUi();
    return payload;
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

  function getNotificationFeed() {
    return adminNotificationsCache
      .map((notification) => ({
        key: notification.id,
        type: notification.type === "doctor-registration" ? "approval" : "support",
        title: notification.title,
        description: notification.message,
        date: notification.createdAt,
        href:
          notification.targetType === "doctor-profile"
            ? `doctor-details.html?id=${notification.targetId}`
            : `support-center.html?ticket=${notification.targetId}`,
        read: Boolean(notification.isRead),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function getUnreadNotificationCount() {
    return getNotificationFeed().filter((item) => !item.read).length;
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

  async function approveDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const response = await requestAdminJson(`/auth/admin/users/${id}/approve`, {
        method: "PATCH",
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;

      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Active",
            rejectionReason: "",
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: "Doctor approved and account activated",
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      } else {
        doctor.approvalStatus = "Approved";
        doctor.accountStatus = "Active";
        doctor.rejectionReason = "";
      }

      addAuditLog("Approved doctor registration", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} approved and email sent.`);
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} approved. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} approved, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} approved successfully.`);
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to approve this doctor right now.", "danger");
      return false;
    }
  }

  async function rejectDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No rejection reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      state.doctors = state.doctors.filter((entry) => entry.id !== id);

      addAuditLog("Rejected doctor registration", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} rejected and email sent.`, "danger");
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} rejected. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} rejected, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} was rejected.`, "danger");
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to reject this doctor right now.", "danger");
      return false;
    }
  }

  async function deactivateDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No deactivation reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/deactivate`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Inactive",
            deactivationReason: finalReason,
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: `Doctor account deactivated: ${finalReason}`,
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog("Deactivated doctor account", id);
      persistState();
      showToast(`${doctor.name} deactivated.`);
      return true;
    } catch (error) {
      showToast(error.message || "Unable to deactivate this doctor right now.", "danger");
      return false;
    }
  }

  async function reactivateDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const response = await requestAdminJson(`/auth/admin/users/${id}/activate`, {
        method: "PATCH",
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Active",
            deactivationReason: "",
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: "Doctor account activated",
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog("Activated doctor account", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} activated and email sent.`);
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} activated. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} activated, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} activated.`);
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to activate this doctor right now.", "danger");
      return false;
    }
  }

  async function deleteDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No deletion reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/delete`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Deleted",
            deletionReason: finalReason,
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: `Doctor account deleted: ${finalReason}`,
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog("Deleted doctor account", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} deleted and email sent.`, "danger");
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} deleted. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} deleted, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} deleted.`, "danger");
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to delete this doctor account right now.", "danger");
      return false;
    }
  }

  async function updateTicketStatus(id, status) {
    const response = await requestAdminJson(`/support/admin/tickets/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const index = state.tickets.findIndex((ticket) => ticket.id === id);
      if (index > -1) {
        state.tickets[index] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }
      addAuditLog(`Updated support ticket status to ${status}`, id);
      persistState();
      return nextTicket;
    }

    throw new Error("Support ticket status could not be updated.");
  }

  async function replyToTicket(id, body, file = null) {
    const response = await requestAdminJson(`/support/tickets/${id}/reply`, {
      method: "POST",
      body: buildSupportReplyFormData(body, file),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const index = state.tickets.findIndex((ticket) => ticket.id === id);
      if (index > -1) {
        state.tickets[index] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }
      addAuditLog("Replied to doctor support ticket", id);
      persistState();
      showToast("Support reply sent.");
      return nextTicket;
    }

    throw new Error("Support reply could not be sent.");
  }

  async function deleteSupportThread(id) {
    const response = await requestAdminJson(`/support/tickets/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    });

    state.tickets = state.tickets.filter((ticket) => ticket.id !== id);
    addAuditLog("Deleted support thread", id);
    persistState();
    showToast(response?.message || "Support thread deleted.", "danger");
    return response;
  }

  async function deleteSupportThreadsBulk({ ticketIds = [], deleteAll = false } = {}) {
    const response = await requestAdminJson("/support/tickets", {
      method: "DELETE",
      body: JSON.stringify({ ticketIds, deleteAll }),
    });

    const deletedIds = new Set((response?.deletedIds || []).map((value) => String(value)));
    state.tickets = deleteAll
      ? []
      : state.tickets.filter((ticket) => !deletedIds.has(String(ticket.id)));

    addAuditLog(deleteAll ? "Deleted all support threads" : "Deleted selected support threads", deleteAll ? "All tickets" : ticketIds.join(", "));
    persistState();
    showToast(response?.message || "Support threads deleted.", "danger");
    return response;
  }

  function deleteTicketMessage(ticketId, messageIndex) {
    const ticket = getTicketById(ticketId);
    if (!ticket) return;
    const message = ticket.messages[messageIndex];
    if (!message || message.role !== "admin") return;
    ticket.messages.splice(messageIndex, 1);
    ticket.updatedAt = new Date().toISOString();
    addAuditLog("Deleted admin support reply", `${ticketId} / message ${messageIndex + 1}`);
    persistState();
    showToast("Sent message deleted.", "danger");
  }

  function getDoctorDocument(doctor, identifier) {
    if (!doctor?.submittedDocuments?.length) return null;

    if (typeof identifier === "number" && Number.isInteger(identifier)) {
      return doctor.submittedDocuments[identifier] || null;
    }

    if (typeof identifier === "string" && /^\d+$/.test(identifier)) {
      return doctor.submittedDocuments[Number(identifier)] || null;
    }

    if (identifier === "medical-license") {
      return doctor.submittedDocuments.find((document) => /medical license/i.test(document.label)) || null;
    }

    if (identifier === "national-id") {
      return doctor.submittedDocuments.find((document) => /national id|identity document/i.test(document.label)) || null;
    }

    return null;
  }

  function buildDocumentPreviewMarkup(doctor, document) {
    if (!document) {
      return `<div class="empty-state">This document is not available.</div>`;
    }

    const fileName = document.file || document.fileName || "Unknown file";
    const fileUrl = document.filePath ? `http://localhost:5000${document.filePath}` : "";
    const isPdf = /pdf/i.test(document.mimeType) || /\.pdf$/i.test(fileName);
    const isImage = /^image\//i.test(document.mimeType) || /\.(png|jpe?g|webp)$/i.test(fileName);
    const previewClassName = `document-preview document-preview-clean${isImage ? " document-preview-image-layout" : ""}`;
    const previewMarkup = isPdf
      ? `<iframe class="document-preview-embed" src="${fileUrl}" title="${document.label} preview"></iframe>`
      : isImage
        ? `<img class="document-preview-image" src="${fileUrl}" alt="${document.label} preview" />`
        : `<div class="empty-state">Preview is not available for this file type.</div>`;

    return `
      <article class="${previewClassName}">
        <div class="document-preview-clean-body">
          <div class="document-preview-visual">
            ${fileUrl ? previewMarkup : '<div class="empty-state">File URL is not available for this document.</div>'}
          </div>
          <div class="document-preview-clean-footer">
            <strong>${document.label}</strong>
            <span>${fileName}</span>
          </div>
        </div>
      </article>
    `;
  }

  function setupDocumentPreviewModal() {
    const modal = document.getElementById("document-preview-modal");
    if (!modal || modal.dataset.ready === "true") return;
    modal.dataset.ready = "true";

    modal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-document-modal")) {
        setDocumentPreviewModalState(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setDocumentPreviewModalState(false);
      }
    });
  }

  function setDocumentPreviewModalState(isOpen) {
    const modal = document.getElementById("document-preview-modal");
    if (!modal) return;

    if (isOpen) {
      modal.hidden = false;
      modal.removeAttribute("hidden");
      modal.style.display = "grid";
      modal.setAttribute("aria-hidden", "false");
      return;
    }

    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  function openDocumentPreview(doctor, type) {
    setupDocumentPreviewModal();
    const modal = document.getElementById("document-preview-modal");
    const title = document.getElementById("document-preview-title");
    const subtitle = document.getElementById("document-preview-subtitle");
    const frame = document.getElementById("document-preview-frame");
    if (!modal || !title || !subtitle || !frame) return;

    const selectedDocument = getDoctorDocument(doctor, type);
    title.textContent = selectedDocument?.label || "Document";
    subtitle.textContent = "";
    frame.innerHTML = buildDocumentPreviewMarkup(doctor, selectedDocument);
    setDocumentPreviewModalState(true);
  }

  function buildRegistrationSeries(doctors) {
    const validDates = doctors
      .map((doctor) => new Date(doctor.registrationDate))
      .filter((date) => Number.isFinite(date.getTime()));

    const latestDoctorDate = validDates.length
      ? new Date(Math.max(...validDates.map((date) => date.getTime())))
      : new Date();

    const anchorDate = latestDoctorDate > new Date() ? latestDoctorDate : new Date();
    const monthStarts = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      monthStarts.push(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - offset, 1));
    }

    return monthStarts.map((monthStart) => {
      const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const value = validDates.filter(
        (date) => date >= monthStart && date < nextMonth
      ).length;

      return {
        label: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(monthStart),
        value
      };
    });
  }

  function calculateRegistrationAnalytics(points = []) {
    if (!points.length) {
      return {
        total: 0,
        average: 0,
        peakLabel: "--",
        peakValue: 0,
        growthPercent: 0,
        growthCaption: "No trend available",
        deltaPercent: 0,
        footnote: "Waiting for live registrations...",
      };
    }

    const total = points.reduce((sum, point) => sum + point.value, 0);
    const average = Math.round(total / points.length);
    const peakPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    const previousPoint = points[points.length - 2] || null;
    const latestPoint = points[points.length - 1];
    const previousTotal = points.slice(0, 3).reduce((sum, point) => sum + point.value, 0);
    const currentTotal = points.slice(-3).reduce((sum, point) => sum + point.value, 0);
    const deltaBase = previousTotal || 1;
    const deltaPercent = previousTotal ? Math.round(((currentTotal - previousTotal) / deltaBase) * 100) : 0;
    const growthPercent = previousPoint?.value
      ? Math.round(((latestPoint.value - previousPoint.value) / previousPoint.value) * 100)
      : latestPoint.value > 0
        ? 100
        : 0;
    const trendDirection =
      growthPercent > 0 ? "increase" : growthPercent < 0 ? "slowdown" : "steady volume";

    return {
      total,
      average,
      peakLabel: peakPoint.label,
      peakValue: peakPoint.value,
      growthPercent,
      growthCaption: previousPoint ? `From ${previousPoint.label} to ${latestPoint.label}` : "First tracked month",
      deltaPercent,
      footnote: `Registration ${trendDirection} detected. ${peakPoint.label} is currently the highest month with ${peakPoint.value} signup${peakPoint.value === 1 ? "" : "s"}.`,
    };
  }

  function buildOverviewAuditEntries(doctors, tickets) {
    const doctorEntries = doctors.flatMap((doctor) =>
      Array.isArray(doctor.statusHistory)
        ? doctor.statusHistory
            .filter((entry) => entry?.date && entry?.label)
            .map((entry) => ({
              id: `doctor-${doctor.id}-${entry.date}-${entry.label}`,
              timestamp: entry.date,
              actor: entry.by || "System",
              action: entry.label,
              target: doctor.name,
            }))
        : []
    );

    const ticketEntries = tickets.flatMap((ticket) => {
      const entries = [];

      if (ticket.deletedByAdmin && ticket.deletedByAdminAt) {
        entries.push({
          id: `ticket-${ticket.id}-deleted-admin`,
          timestamp: ticket.deletedByAdminAt,
          actor: ticket.assignedAdmin || "Admin",
          action: "Deleted support thread",
          target: ticket.id,
        });
      }

      if (Array.isArray(ticket.messages)) {
        ticket.messages.forEach((message) => {
          if (message.role !== "admin" || !message.date) return;
          entries.push({
            id: `ticket-${ticket.id}-message-${message.id || message.date}`,
            timestamp: message.date,
            actor: message.author || ticket.assignedAdmin || "Admin",
            action: message.attachment?.fileName
              ? "Sent support reply with file"
              : "Replied to doctor support ticket",
            target: ticket.id,
          });
        });
      }

      return entries;
    });

    return [...doctorEntries, ...ticketEntries]
      .filter((entry) => Number.isFinite(new Date(entry.timestamp).getTime()))
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  }

  function calculateAverageReplyHours(tickets) {
    const responseWindows = [];

    tickets.forEach((ticket) => {
      const messages = Array.isArray(ticket.messages)
        ? [...ticket.messages]
            .filter((message) => message?.date)
            .sort((left, right) => new Date(left.date) - new Date(right.date))
        : [];

      for (let index = 0; index < messages.length; index += 1) {
        const currentMessage = messages[index];
        if (currentMessage.role !== "doctor") continue;

        const nextAdminMessage = messages.slice(index + 1).find((message) => message.role === "admin");
        if (!nextAdminMessage) continue;

        const diffHours =
          (new Date(nextAdminMessage.date).getTime() - new Date(currentMessage.date).getTime()) /
          (1000 * 60 * 60);

        if (Number.isFinite(diffHours) && diffHours >= 0) {
          responseWindows.push(diffHours);
        }
      }
    });

    if (!responseWindows.length) {
      return null;
    }

    const average = responseWindows.reduce((sum, value) => sum + value, 0) / responseWindows.length;
    return Number(average.toFixed(1));
  }

  function renderLineChart(host, points = []) {
    if (!host) return;
    if (!points.length) return;
    const max = Math.max(...points.map((entry) => entry.value), 1);
    const width = 900;
    const height = 300;
    const chartLeft = 72;
    const chartRight = width - 32;
    const chartTop = 34;
    const chartBottom = height - 40;
    const chartWidth = chartRight - chartLeft;
    const step = chartWidth / (points.length - 1 || 1);

    const chartPoints = points
      .map((entry, index) => {
        const x = chartLeft + step * index;
        const y = chartBottom - (entry.value / max) * (chartBottom - chartTop);
        return { ...entry, x, y };
      });

    const pointString = chartPoints.map((entry) => `${entry.x},${entry.y}`).join(" ");
    const areaPath = `M ${chartPoints[0].x} ${chartBottom} L ${chartPoints
      .map((entry) => `${entry.x} ${entry.y}`)
      .join(" L ")} L ${chartPoints[chartPoints.length - 1].x} ${chartBottom} Z`;
    const maxLabel = Math.max(...points.map((entry) => entry.value), 0);
    const gridLabels = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => Math.round(maxLabel * ratio))
      .filter((value, index, array) => array.indexOf(value) === index);
    const peakValue = Math.max(...points.map((entry) => entry.value), 0);
    const latestNonZeroIndex = [...chartPoints].reverse().findIndex((entry) => entry.value > 0);
    const latestNonZeroPoint =
      latestNonZeroIndex === -1 ? null : chartPoints[chartPoints.length - 1 - latestNonZeroIndex];

    host.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#67f0ff"></stop>
            <stop offset="100%" stop-color="#3a83ff"></stop>
          </linearGradient>
          <linearGradient id="line-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(87,159,255,0.28)"></stop>
            <stop offset="100%" stop-color="rgba(87,159,255,0)"></stop>
          </linearGradient>
          <filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        ${gridLabels
          .map((label, index) => {
            const ratio = maxLabel ? label / maxLabel : index / (gridLabels.length - 1 || 1);
            const y = chartBottom - ratio * (chartBottom - chartTop);
            return `
              <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(134, 154, 196, 0.12)" stroke-dasharray="6 6"></line>
              <text x="18" y="${y + 4}" fill="#7f90b4" font-size="14" font-weight="600">${label}</text>
            `;
          })
          .join("")}
        <path d="${areaPath}" fill="url(#line-fill)"></path>
        <polyline fill="none" stroke="url(#line-gradient)" filter="url(#chartGlow)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${pointString}"></polyline>
        ${chartPoints
          .map(
            (entry) => `
              <g>
                <circle cx="${entry.x}" cy="${entry.y}" r="8" fill="#0f1524" stroke="#4b93ff" stroke-width="4"></circle>
                ${
                  entry.value > 0 && (entry.value === peakValue || entry === latestNonZeroPoint)
                    ? `<text x="${entry.x - (entry === latestNonZeroPoint ? 8 : 0)}" y="${entry.y - 18}" text-anchor="${entry === latestNonZeroPoint ? "end" : "middle"}" fill="#ffffff" font-size="14" font-weight="800">${entry.value}</text>`
                    : ""
                }
              </g>
            `
          )
          .join("")}
      </svg>
    `;

    const labels = document.getElementById("registration-labels");
    if (labels) {
      labels.innerHTML = chartPoints
        .map(
          (entry) =>
            `<span style="left:${((entry.x / width) * 100).toFixed(2)}%">${entry.label}</span>`
        )
        .join("");
    }
  }

  function populateOverview() {
    const doctors = state.doctors;
    const pending = doctors.filter((doctor) => doctor.approvalStatus === "Pending");
    const approved = doctors.filter((doctor) => doctor.approvalStatus === "Approved");
    const rejected = doctors.filter((doctor) => doctor.approvalStatus === "Rejected");
    const active = doctors.filter((doctor) => doctor.accountStatus === "Active");
    const inactive = doctors.filter((doctor) => doctor.accountStatus === "Inactive");
    const values = {
      "metric-total": doctors.length,
      "metric-pending": pending.length,
      "metric-active": active.length,
      "metric-approved": approved.length,
      "metric-inactive": inactive.length,
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

    const auditEntries = buildOverviewAuditEntries(doctors, state.tickets);

    const auditList = document.getElementById("audit-log-list");
    if (auditList) {
      auditList.innerHTML = auditEntries
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
    const avgResponseHours = calculateAverageReplyHours(state.tickets);
    const registrationSeries = buildRegistrationSeries(doctors);
    const registrationAnalytics = calculateRegistrationAnalytics(registrationSeries);

    const approvalNode = document.getElementById("insight-approval-rate");
    const activationNode = document.getElementById("insight-activation-rate");
    const responseNode = document.getElementById("insight-response-time");
    const auditEntriesNode = document.getElementById("insight-audit-entries");
    if (approvalNode) approvalNode.textContent = `${approvalRate}%`;
    if (activationNode) activationNode.textContent = `${activationRate}%`;
    if (responseNode) responseNode.textContent = avgResponseHours === null ? "--" : `${avgResponseHours}h`;
    if (auditEntriesNode) auditEntriesNode.textContent = String(auditEntries.length);

    const registrationTotalNode = document.getElementById("registration-kpi-total");
    const registrationDeltaNode = document.getElementById("registration-kpi-delta");
    const registrationAverageNode = document.getElementById("registration-kpi-average");
    const registrationPeakLabelNode = document.getElementById("registration-kpi-peak-label");
    const registrationPeakValueNode = document.getElementById("registration-kpi-peak-value");
    const registrationGrowthNode = document.getElementById("registration-kpi-growth");
    const registrationGrowthCaptionNode = document.getElementById("registration-kpi-growth-caption");
    const registrationFootnoteNode = document.getElementById("registration-analytics-footnote");
    const registrationCaptionNode = document.getElementById("registration-chart-caption");

    if (registrationTotalNode) registrationTotalNode.textContent = registrationAnalytics.total.toLocaleString("en-GB");
    if (registrationDeltaNode) {
      const deltaPrefix = registrationAnalytics.deltaPercent > 0 ? "+" : "";
      registrationDeltaNode.textContent = `${deltaPrefix}${registrationAnalytics.deltaPercent}% vs previous 3 months`;
    }
    if (registrationAverageNode) registrationAverageNode.textContent = String(registrationAnalytics.average);
    if (registrationPeakLabelNode) registrationPeakLabelNode.textContent = registrationAnalytics.peakLabel;
    if (registrationPeakValueNode) {
      registrationPeakValueNode.textContent = `${registrationAnalytics.peakValue} registration${registrationAnalytics.peakValue === 1 ? "" : "s"}`;
    }
    if (registrationGrowthNode) {
      const growthPrefix = registrationAnalytics.growthPercent > 0 ? "+" : "";
      registrationGrowthNode.textContent = `${growthPrefix}${registrationAnalytics.growthPercent}%`;
    }
    if (registrationGrowthCaptionNode) registrationGrowthCaptionNode.textContent = registrationAnalytics.growthCaption;
    if (registrationFootnoteNode) {
      registrationFootnoteNode.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.25h.01"></path><path d="M11 12h1v4h1"></path><path d="M12 3.75a8.25 8.25 0 1 1 0 16.5 8.25 8.25 0 0 1 0-16.5Z"></path></svg>
        <p>${registrationAnalytics.footnote}</p>
      `;
    }
    if (registrationCaptionNode) {
      registrationCaptionNode.textContent = `Live onboarding activity across the latest ${registrationSeries.length}-month window.`;
    }

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

    renderLineChart(document.getElementById("registration-line-chart"), registrationSeries);
  }

  function createBadgeMarkup(value, neutralFallback = false) {
    return `<span class="badge ${slugifyBadge(value)}${neutralFallback ? " neutral" : ""}">${value}</span>`;
  }

  function getSystemPredictionRecords() {
    const records =
      (systemPredictionsCache.length
        ? systemPredictionsCache.map((entry) => ({ ...entry }))
        : Array.isArray(state.predictions) && state.predictions.length
          ? state.predictions.map((entry) => ({ ...entry }))
          : window.NoufarPredictionStore?.getRecords?.() ||
            (typeof patientPredictions !== "undefined" ? patientPredictions.map((entry) => ({ ...entry })) : []));

    return records
      .map((entry) => {
        const doctorFromState =
          (entry.doctorId && getDoctorById(entry.doctorId)) ||
          state.doctors.find((doctor) => doctor.name === entry.doctorName) ||
          null;

        return {
          ...entry,
          doctorId: entry.doctorId || doctorFromState?.id || "",
          doctorName: entry.doctorName || doctorFromState?.name || entry.predictedByName || "Unknown doctor",
          actualOutcome: entry.actualOutcome || "",
          validationStatus: entry.validationStatus || "Pending",
          source: entry.source || "Manual",
          modelName: formatModelName(entry.modelName),
          runDate: entry.runDate || entry.createdAt || entry.analyzedAt || entry.updatedAt || "",
          correctionDate: entry.validationRecordedAt || "",
          validatedByName: entry.validatedByName || "",
          probability: Number(entry.probability || 0),
        };
      })
      .sort((a, b) => new Date(b.runDate || b.analyzedAt) - new Date(a.runDate || a.analyzedAt));
  }

  function renderSystemComparison(records) {
    const summaryStack = document.getElementById("system-summary-stack");
    if (!summaryStack) return;

    const validatedRecords = records.filter((entry) => entry.actualOutcome && entry.validationStatus !== "Pending");
    const correctCount = validatedRecords.filter((entry) => entry.validationStatus === "Correct").length;
    const incorrectCount = validatedRecords.filter((entry) => entry.validationStatus === "Incorrect").length;
    const pendingCount = records.filter((entry) => !entry.actualOutcome || entry.validationStatus === "Pending").length;
    const accuracy = validatedRecords.length ? Math.round((correctCount / validatedRecords.length) * 100) : 0;

    summaryStack.innerHTML = `
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${correctCount}</strong>
          ${createBadgeMarkup("Correct")}
        </div>
        <p>Validated predictions where the real doctor outcome matched the system output.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${incorrectCount}</strong>
          ${createBadgeMarkup("Incorrect")}
        </div>
        <p>Validated predictions where the real doctor correction differs from the system output.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${pendingCount}</strong>
          ${createBadgeMarkup("Pending")}
        </div>
        <p>Predictions still waiting for the doctor to record the real outcome after follow-up.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${accuracy}%</strong>
          <span class="badge neutral">Accuracy</span>
        </div>
        <p>Current validation accuracy across the predictions that already have a doctor correction.</p>
      </article>
    `;
  }

  function getReadinessIconMarkup(type) {
    const icons = {
      validated: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.75h8M9 2.75h6a1 1 0 0 1 1 1v1H8v-1a1 1 0 0 1 1-1Zm-1 4h8.5a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2V8.75a2 2 0 0 1 2-2Zm2.5 4.25h5m-5 4h5" /></svg>`,
      accuracy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.75a7.25 7.25 0 1 0 7.25 7.25" /><path d="M12 12l4.15-4.15" /><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" /></svg>`,
      coverage: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 14.5h3l2-6 3.5 10 2-6h4.5" /></svg>`,
      sensitivity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4 4 10-10" /></svg>`,
      specificity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14l-5.5 6.5v5L10.5 18v-6.5Z" /></svg>`,
      pending: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /></svg>`,
      tp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12.5 3.2 3.2L17 9" /></svg>`,
      fp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5m0 4h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /></svg>`,
      fn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8" /></svg>`,
      tn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 12h9.5" /><path d="M9.25 8.9h5.5M9.25 15.1h5.5" opacity="0.35" /></svg>`,
    };

    return icons[type] || icons.coverage;
  }

  function renderSystemReadiness(records) {
    const readinessModel = document.getElementById("system-readiness-model");
    const readinessBanner = document.getElementById("system-readiness-banner");
    const evidenceMetrics = document.getElementById("system-evidence-metrics");
    const matrixGrid = document.getElementById("system-matrix-grid");

    if (readinessModel) {
      readinessModel.textContent = adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
    }

    if (!readinessBanner || !evidenceMetrics || !matrixGrid) return;

    const activeModel = adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
    const modelScopedRecords = records.filter((entry) => formatModelName(entry.modelName) === activeModel);
    const validatedRecords = modelScopedRecords.filter(
      (entry) => entry.actualOutcome && entry.validationStatus !== "Pending"
    );
    const totalCount = modelScopedRecords.length;
    const validatedCount = validatedRecords.length;
    const pendingCount = totalCount - validatedCount;
    const coverage = totalCount ? Math.round((validatedCount / totalCount) * 100) : 0;

    const tp = validatedRecords.filter(
      (entry) => entry.result === "Relapse" && entry.actualOutcome === "Relapse"
    ).length;
    const fp = validatedRecords.filter(
      (entry) => entry.result === "Relapse" && entry.actualOutcome === "No Relapse"
    ).length;
    const fn = validatedRecords.filter(
      (entry) => entry.result === "No Relapse" && entry.actualOutcome === "Relapse"
    ).length;
    const tn = validatedRecords.filter(
      (entry) => entry.result === "No Relapse" && entry.actualOutcome === "No Relapse"
    ).length;

    const accuracy = validatedCount ? Math.round(((tp + tn) / validatedCount) * 100) : 0;
    const sensitivity = tp + fn ? Math.round((tp / (tp + fn)) * 100) : 0;
    const specificity = tn + fp ? Math.round((tn / (tn + fp)) * 100) : 0;

    let recommendationTone = "neutral";
    let recommendationTitle = "Insufficient evidence";
    let recommendationCopy =
      "This model does not yet have enough doctor-confirmed evidence to justify a production change.";

    if (validatedCount >= 20 && accuracy >= 80 && sensitivity >= 75) {
      recommendationTone = "good";
      recommendationTitle = "Model is stable for review";
      recommendationCopy =
        "Validated performance looks consistent enough for an admin review before deciding whether to switch the production model.";
    } else if (validatedCount >= 10 && accuracy >= 65) {
      recommendationTone = "warning";
      recommendationTitle = "Model needs closer review";
      recommendationCopy =
        "The model has partial evidence, but the validation base is still moderate. Review risky cases before any switch.";
    }

    readinessBanner.className = `system-readiness-banner tone-${recommendationTone}`;
    readinessBanner.innerHTML = `
      <div class="system-readiness-banner-copy">
        <span class="system-readiness-kicker">Recommendation</span>
        <strong>${recommendationTitle}</strong>
        <p>${recommendationCopy}</p>
      </div>
      <div class="system-readiness-stats">
        <div class="system-readiness-stat-card icon-validated">
          <span class="system-readiness-stat-icon">${getReadinessIconMarkup("validated")}</span>
          <div class="system-readiness-stat-copy">
            <span>Validated cases</span>
            <b>${validatedCount}</b>
          </div>
        </div>
        <div class="system-readiness-stat-card icon-accuracy">
          <span class="system-readiness-stat-icon">${getReadinessIconMarkup("accuracy")}</span>
          <div class="system-readiness-stat-copy">
            <span>Observed accuracy</span>
            <b>${accuracy}%</b>
          </div>
        </div>
      </div>
    `;

    evidenceMetrics.innerHTML = `
      <article class="system-evidence-metric icon-coverage">
        <span class="system-metric-icon">${getReadinessIconMarkup("coverage")}</span>
        <div class="system-metric-copy">
          <span>Coverage</span>
          <strong>${coverage}%</strong>
          <small>${validatedCount} of ${totalCount || 0} predictions doctor-validated</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-sensitivity">
        <span class="system-metric-icon">${getReadinessIconMarkup("sensitivity")}</span>
        <div class="system-metric-copy">
          <span>Sensitivity</span>
          <strong>${sensitivity}%</strong>
          <small>Relapse cases correctly identified</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-specificity">
        <span class="system-metric-icon">${getReadinessIconMarkup("specificity")}</span>
        <div class="system-metric-copy">
          <span>Specificity</span>
          <strong>${specificity}%</strong>
          <small>No-relapse cases correctly excluded</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-pending">
        <span class="system-metric-icon">${getReadinessIconMarkup("pending")}</span>
        <div class="system-metric-copy">
          <span>Pending follow-up</span>
          <strong>${pendingCount}</strong>
          <small>Predictions still waiting for correction</small>
        </div>
      </article>
    `;

    matrixGrid.innerHTML = `
      <article class="system-matrix-cell icon-tp">
        <span class="system-matrix-icon">${getReadinessIconMarkup("tp")}</span>
        <div class="system-matrix-copy">
          <span>True Positive</span>
          <strong>${tp}</strong>
          <small>Predicted relapse and confirmed relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-fp">
        <span class="system-matrix-icon">${getReadinessIconMarkup("fp")}</span>
        <div class="system-matrix-copy">
          <span>False Positive</span>
          <strong>${fp}</strong>
          <small>Predicted relapse but doctor confirmed no relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-fn">
        <span class="system-matrix-icon">${getReadinessIconMarkup("fn")}</span>
        <div class="system-matrix-copy">
          <span>False Negative</span>
          <strong>${fn}</strong>
          <small>Predicted no relapse but doctor confirmed relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-tn">
        <span class="system-matrix-icon">${getReadinessIconMarkup("tn")}</span>
        <div class="system-matrix-copy">
          <span>True Negative</span>
          <strong>${tn}</strong>
          <small>Predicted no relapse and doctor confirmed no relapse</small>
        </div>
      </article>
    `;

  }

  function populateSystemPage() {
    const tableBody = document.getElementById("system-table-body");
    if (!tableBody) return;

    syncSystemModelUi();

    const search = document.getElementById("system-search");
    const validationFilter = document.getElementById("system-validation-filter");
    const resultFilter = document.getElementById("system-result-filter");
    const summary = document.getElementById("system-table-summary");
    const pagination = document.getElementById("system-pagination");
    let currentPage = 1;
    const pageSize = 10;

    const updateMetrics = (records) => {
      const validatedCount = records.filter((entry) => entry.actualOutcome && entry.validationStatus !== "Pending").length;
      const correctCount = records.filter((entry) => entry.validationStatus === "Correct").length;
      const pendingCount = records.filter((entry) => !entry.actualOutcome || entry.validationStatus === "Pending").length;
      const accuracy = validatedCount ? Math.round((correctCount / validatedCount) * 100) : 0;

      const metricTotal = document.getElementById("system-total-predictions");
      const metricPending = document.getElementById("system-pending-corrections");
      const metricValidated = document.getElementById("system-validated-predictions");
      const metricAccuracy = document.getElementById("system-validation-accuracy");

      if (metricTotal) metricTotal.textContent = String(records.length);
      if (metricPending) metricPending.textContent = String(pendingCount);
      if (metricValidated) metricValidated.textContent = String(validatedCount);
      if (metricAccuracy) metricAccuracy.textContent = `${accuracy}%`;
    };

    const renderPagination = (totalItems) => {
      if (!pagination) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const pages = [];

      for (let page = 1; page <= totalPages; page += 1) {
        pages.push(`
          <button class="pagination-button${page === currentPage ? " active" : ""}" type="button" data-page="${page}">
            ${page}
          </button>
        `);
      }

      pagination.innerHTML = `
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>
          Prev
        </button>
        ${pages.join("")}
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>
          Next
        </button>
      `;
      pagination.hidden = totalItems <= pageSize;
    };

    const renderTable = (records) => {
      if (!records.length) {
        tableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No predictions match the current system filters.</div></td></tr>`;
        if (summary) summary.textContent = "Showing 0 predictions";
        if (pagination) {
          pagination.hidden = true;
          pagination.innerHTML = "";
        }
        return;
      }

      const totalItems = records.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      currentPage = Math.min(currentPage, totalPages);
      const start = (currentPage - 1) * pageSize;
      const visibleRecords = records.slice(start, start + pageSize);

      tableBody.innerHTML = visibleRecords
        .map(
          (entry) => `
            <tr class="${
              entry.validationStatus === "Incorrect"
                ? "system-row-incorrect"
                : entry.validationStatus === "Correct"
                  ? "system-row-correct"
                  : "system-row-pending"
            }">
              <td>
                <div class="table-meta">
                  <strong>${entry.id}</strong>
                  <span>${formatDate(entry.runDate || entry.analyzedAt, true)}</span>
                </div>
              </td>
              <td>${escapeAdminHtml(entry.doctorName)}</td>
              <td>${escapeAdminHtml(entry.modelName || DEFAULT_SYSTEM_MODEL)}</td>
              <td>${escapeAdminHtml(entry.source)}</td>
              <td>${createBadgeMarkup(entry.result)}</td>
              <td>
                <div class="table-meta">
                  ${createBadgeMarkup(entry.actualOutcome || "Pending", !entry.actualOutcome)}
                  <span>${entry.validatedByName ? `Recorded by ${escapeAdminHtml(entry.validatedByName)}` : "Awaiting doctor correction"}</span>
                </div>
              </td>
              <td>${createBadgeMarkup(entry.validationStatus)}</td>
              <td>${entry.correctionDate ? formatDate(entry.correctionDate, true) : "/"}</td>
            </tr>
          `
        )
        .join("");

      if (summary) {
        const startItem = start + 1;
        const endItem = Math.min(start + pageSize, totalItems);
        summary.textContent = `Showing ${startItem}-${endItem} of ${totalItems} prediction${totalItems > 1 ? "s" : ""}`;
      }

      renderPagination(totalItems);
    };

    const applyFilters = (resetPage = false) => {
      if (resetPage) currentPage = 1;
      const keyword = (search?.value || "").trim().toLowerCase();
      const validation = validationFilter?.value || "all";
      const predictedResult = resultFilter?.value || "all";

      const filtered = getSystemPredictionRecords().filter((entry) => {
        const matchesKeyword =
          !keyword ||
          [entry.id, entry.doctorName, entry.source, entry.result, entry.actualOutcome, entry.validationStatus]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
        const matchesValidation = validation === "all" || entry.validationStatus === validation;
        const matchesResult = predictedResult === "all" || entry.result === predictedResult;
        return matchesKeyword && matchesValidation && matchesResult;
      });

      updateMetrics(filtered);
      renderSystemComparison(filtered);
      renderSystemReadiness(filtered);
      renderTable(filtered);
    };

    [search, validationFilter, resultFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", () => applyFilters(true));
      element.addEventListener("change", () => applyFilters(true));
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      const nextPage = Number(button.dataset.page || currentPage);
      if (!Number.isFinite(nextPage) || nextPage === currentPage) return;
      currentPage = nextPage;
      applyFilters(false);
    });

    applyFilters(true);
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
    const summary = document.getElementById("doctor-table-summary");
    const pagination = document.getElementById("doctor-pagination");
    const params = new URLSearchParams(window.location.search);
    let currentPage = 1;
    const pageSize = 5;

    const specialties = [...new Set(state.doctors.map((doctor) => doctor.specialty))];
    if (specialtyFilter) {
      specialtyFilter.innerHTML += specialties.map((specialty) => `<option value="${specialty}">${specialty}</option>`).join("");
    }

    const queryApproval = params.get("approval");
    if (queryApproval && approvalFilter) {
      approvalFilter.value = queryApproval;
    }

    const renderPagination = (totalItems) => {
      if (!pagination) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const pages = [];

      for (let page = 1; page <= totalPages; page += 1) {
        pages.push(`
          <button class="pagination-button${page === currentPage ? " active" : ""}" type="button" data-page="${page}">
            ${page}
          </button>
        `);
      }

      pagination.innerHTML = `
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>
          Prev
        </button>
        ${pages.join("")}
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>
          Next
        </button>
      `;
      pagination.hidden = totalItems <= pageSize;
    };

    const applyFilters = (resetPage = false) => {
      if (resetPage) currentPage = 1;
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

      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      currentPage = Math.min(currentPage, totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const pagedDoctors = filtered.slice(startIndex, startIndex + pageSize);

      body.innerHTML = pagedDoctors
        .map((doctor) => {
          const isDeletedAccount = doctor.accountStatus === "Deleted";
          const approvalActions =
            doctor.approvalStatus === "Pending" && !isDeletedAccount
              ? `<button class="action-button primary" data-action="approve" data-id="${doctor.id}">Approve</button>`
              : "";
            const rejectAction =
              doctor.approvalStatus === "Pending" && !isDeletedAccount
                ? `<button class="action-button danger" data-action="reject" data-id="${doctor.id}">Reject</button>`
                : "";
            const accountAction =
              doctor.approvalStatus === "Approved" && doctor.accountStatus === "Active" && !isDeletedAccount
                ? `<button class="action-button warning" data-action="deactivate" data-id="${doctor.id}">Deactivate</button>`
                : doctor.approvalStatus === "Approved" && !isDeletedAccount
                  ? `<button class="action-button success" data-action="reactivate" data-id="${doctor.id}">Activate</button>`
                  : "";
          const deleteAction =
            doctor.approvalStatus === "Approved" && !isDeletedAccount
              ? `<button class="action-button danger icon-action-button" data-action="delete" data-id="${doctor.id}" aria-label="Delete doctor" title="Delete">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 3.75h6a1 1 0 0 1 1 1v1.25h3a.75.75 0 0 1 0 1.5h-1.05l-.82 11.04A2.25 2.25 0 0 1 14.89 20.75H9.11a2.25 2.25 0 0 1-2.24-2.21L6.05 7.5H5a.75.75 0 0 1 0-1.5h3V4.75a1 1 0 0 1 1-1Zm.5 2.25h5V5.25h-5V6Zm-1.95 1.5.82 10.93a.75.75 0 0 0 .74.7h5.78a.75.75 0 0 0 .74-.7l.82-10.93H7.55Zm2.7 2.2a.75.75 0 0 1 .75.75v5.6a.75.75 0 0 1-1.5 0v-5.6a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v5.6a.75.75 0 0 1-1.5 0v-5.6a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
                  </svg>
                </button>`
              : "";

          const actionRow = [
            `<a class="action-button secondary icon-action-button" href="doctor-details.html?id=${doctor.id}" aria-label="View doctor details" title="View">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5c5.1 0 9.27 4.03 10.45 6.68a.75.75 0 0 1 0 .64C21.27 14.97 17.1 19 12 19S2.73 14.97 1.55 12.32a.75.75 0 0 1 0-.64C2.73 9.03 6.9 5 12 5Zm0 1.5c-4.24 0-7.8 3.21-8.92 5.5 1.12 2.29 4.68 5.5 8.92 5.5s7.8-3.21 8.92-5.5C19.8 9.71 16.24 6.5 12 6.5Zm0 2.25a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Zm0 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z" fill="currentColor"/>
              </svg>
            </a>`,
            approvalActions,
            rejectAction,
            accountAction,
            deleteAction
          ]
            .filter(Boolean)
            .join("");

          return `
              <tr>
                <td>
                <div class="table-meta">
                  <strong>${doctor.name}</strong>
                  <span>${doctor.id}</span>
                </div>
                </td>
                <td>${doctor.email}</td>
                <td>${doctor.specialty}</td>
                <td>${formatDate(doctor.registrationDate)}</td>
                <td>${createBadgeMarkup(doctor.approvalStatus)}</td>
                <td>${createBadgeMarkup(doctor.accountStatus)}</td>
                <td class="table-actions-cell">
                  <div class="table-actions">
                    <div class="table-action-row">
                      ${actionRow}
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

      if (summary) {
        if (!filtered.length) {
          summary.textContent = "Showing 0 doctors";
        } else {
          const visibleFrom = startIndex + 1;
          const visibleTo = startIndex + pagedDoctors.length;
          summary.textContent = `Showing ${visibleFrom}-${visibleTo} of ${filtered.length} doctors`;
        }
      }

      renderPagination(filtered.length);
    };

    [search, approvalFilter, accountFilter, specialtyFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", () => applyFilters(true));
      element.addEventListener("change", () => applyFilters(true));
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      currentPage = Number(button.dataset.page);
      applyFilters();
    });

    if (exportButton) {
      exportButton.addEventListener("click", () => {
        showToast("Doctors list exported to admin handoff queue.");
      });
    }

    body.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === "approve") {
        const didApprove = await approveDoctor(id);
        if (didApprove) applyFilters();
        return;
      }
      if (action === "reactivate") {
        const didActivate = await reactivateDoctor(id);
        if (didActivate) applyFilters();
        return;
      }
      if (action === "reject") {
        openConfirmation({
          title: "Reject doctor registration",
          message: "You can add an optional rejection reason before rejecting this doctor.",
          confirmLabel: "Reject doctor",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didReject = await rejectDoctor(id, reason);
            if (didReject) applyFilters();
          }
        });
        return;
      }
        if (action === "deactivate") {
          openConfirmation({
            title: "Deactivate doctor account",
            message: "Add the reason for deactivation. The doctor will see it when trying to log in.",
            confirmLabel: "Deactivate account",
            reasonField: true,
            variant: "warning",
            onConfirm: async (reason) => {
              const didDeactivate = await deactivateDoctor(id, reason);
              if (didDeactivate) applyFilters();
            }
        });
        return;
      }
      if (action === "delete") {
        openConfirmation({
          title: "Delete doctor account",
          message: "Add the reason for deleting this account. The doctor will receive it by email and see it when trying to log in.",
          confirmLabel: "Delete account",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didDelete = await deleteDoctor(id, reason);
            if (didDelete) applyFilters();
          }
        });
      }
    });

    applyFilters(true);
  }

  function populateDoctorDetails() {
    const root = document.getElementById("doctor-detail-root");
    if (!root) return;
    setupDocumentPreviewModal();

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
    document.getElementById("detail-specialty").textContent = doctor.specialty;
    document.getElementById("detail-institution").textContent = doctor.hospital;
    document.getElementById("detail-registration").textContent = formatDate(doctor.registrationDate);

    const documents = document.getElementById("detail-documents");
    if (!doctor.submittedDocuments?.length) {
      documents.innerHTML = `<div class="empty-state">No uploaded documents were found for this doctor.</div>`;
    } else {
      documents.innerHTML = doctor.submittedDocuments
        .map((document, index) => {
          const fileName = document.file || document.fileName || "Unknown file";
          const fileUrl = document.filePath ? `http://localhost:5000${document.filePath}` : "";
          const canCheck = Boolean(fileUrl);

          return `
            <article class="document-row">
              <div>
                <strong>${document.label}</strong>
                <small>${fileName}</small>
              </div>
              ${
                canCheck
                  ? `<a class="action-button secondary document-check-button" href="${fileUrl}" target="_blank" rel="noopener noreferrer" data-document-index="${index}">Check</a>`
                  : `<span class="badge neutral">Unavailable</span>`
              }
            </article>
          `;
        })
        .join("");
    }

    documents.onclick = (event) => {
      const trigger = event.target.closest("[data-document-index]");
      if (!trigger) return;
      event.preventDefault();
      openDocumentPreview(doctor, trigger.dataset.documentIndex);
    };

    const supportList = document.getElementById("detail-support-history");
    const supportCard = document.getElementById("detail-support-card");
    const canShowSupportHistory = doctor.approvalStatus === "Approved";
    if (supportCard) {
      supportCard.hidden = !canShowSupportHistory;
    }
    if (canShowSupportHistory && supportList) {
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
        : `<div class="empty-state">No support history recorded for this approved doctor.</div>`;
    }

    const actions = document.getElementById("detail-actions");
    const approveButton = actions.querySelector('[data-detail-action="approve"]');
    const rejectButton = actions.querySelector('[data-detail-action="reject"]');
    const deactivateButton = actions.querySelector('[data-detail-action="deactivate"]');
    const reactivateButton = actions.querySelector('[data-detail-action="reactivate"]');
    const deleteButton = actions.querySelector('[data-detail-action="delete"]');

    if (doctor.approvalStatus !== "Pending") {
      approveButton?.remove();
      rejectButton?.remove();
    }

    if (doctor.accountStatus === "Deleted") {
      approveButton?.remove();
      rejectButton?.remove();
      deactivateButton?.remove();
      reactivateButton?.remove();
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus !== "Active") {
      deactivateButton?.remove();
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus === "Active") {
      reactivateButton?.remove();
    } else if (reactivateButton) {
      reactivateButton.textContent = "Activate";
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus === "Deleted") {
      deleteButton?.remove();
    }

    actions.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-detail-action]");
      if (!button) return;
      const action = button.dataset.detailAction;
      if (action === "approve") {
        const didApprove = await approveDoctor(doctor.id);
        if (didApprove) window.location.reload();
        return;
      }
      if (action === "reactivate") {
        const didActivate = await reactivateDoctor(doctor.id);
        if (didActivate) window.location.reload();
        return;
      }
      if (action === "reject") {
        openConfirmation({
          title: "Reject doctor registration",
          message: "Add an optional rejection reason before saving this decision.",
          confirmLabel: "Reject doctor",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didReject = await rejectDoctor(doctor.id, reason);
            if (didReject) window.location.reload();
          }
        });
        return;
      }
        if (action === "deactivate") {
          openConfirmation({
            title: "Deactivate doctor account",
            message: "Add the reason for deactivation. The doctor will see it when trying to log in.",
            confirmLabel: "Deactivate account",
            reasonField: true,
            variant: "warning",
            onConfirm: async (reason) => {
              const didDeactivate = await deactivateDoctor(doctor.id, reason);
              if (didDeactivate) window.location.reload();
            }
        });
        return;
      }
      if (action === "delete") {
        openConfirmation({
          title: "Delete doctor account",
          message: "Add the reason for deleting this account. The doctor will receive it by email and see it when trying to log in.",
          confirmLabel: "Delete account",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didDelete = await deleteDoctor(doctor.id, reason);
            if (didDelete) window.location.reload();
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
    const selectAllToggle = document.getElementById("admin-ticket-select-all");
    const deleteSelectedButton = document.getElementById("admin-delete-selected");
    const deleteAllButton = document.getElementById("admin-delete-all");
    const replyForm = document.getElementById("reply-form");
    const replyInput = document.getElementById("reply-message");
    const replyFileInput = document.getElementById("reply-file");
    const replyFileBar = document.getElementById("reply-file-bar");
    const replyFileName = document.getElementById("reply-file-name");
    const replyFileClear = document.getElementById("reply-file-clear");
    const replyActionRow = document.getElementById("reply-action-row");
    const statusSelect = document.getElementById("ticket-status-select");
    const resolveButton = document.getElementById("resolve-toggle");
    const deleteTicketButton = document.getElementById("delete-ticket-button");
    const params = new URLSearchParams(window.location.search);
    let currentTicketId = params.get("ticket") || null;
    let selectedTicketIds = new Set();

    if (deleteTicketButton) {
      deleteTicketButton.hidden = true;
    }

    const syncReplyAction = () => {
      if (!replyActionRow) return;
      const hasFile = Boolean(replyFileInput?.files?.length);
      replyActionRow.hidden = !(replyInput.value.trim() || hasFile);
      if (replyFileBar) {
        replyFileBar.hidden = !hasFile;
      }
      if (replyFileName) {
        replyFileName.textContent = hasFile ? replyFileInput.files[0].name : "";
      }
    };

    const scrollConversationToBottom = () => {
      const conversation = document.getElementById("conversation-thread");
      if (!conversation) return;
      requestAnimationFrame(() => {
        conversation.scrollTop = conversation.scrollHeight;
      });
    };

    const queryStatus = params.get("status");
    if (queryStatus && statusFilter) {
      statusFilter.value = queryStatus;
    }

    const getFilteredTickets = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const status = statusFilter?.value || "all";
      const priority = priorityFilter?.value || "all";
      const dateRange = dateFilter?.value || "all";
      const now = new Date();

      return state.tickets.filter((ticket) => {
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
    };

    const syncBulkActions = (filteredTickets = getFilteredTickets()) => {
      const visibleIds = filteredTickets.map((ticket) => String(ticket.id));
      selectedTicketIds = new Set(
        [...selectedTicketIds].filter((id) => state.tickets.some((ticket) => String(ticket.id) === id))
      );

      const visibleSelectedCount = visibleIds.filter((id) => selectedTicketIds.has(id)).length;
      const hasVisibleTickets = visibleIds.length > 0;

      if (selectAllToggle) {
        selectAllToggle.checked = hasVisibleTickets && visibleSelectedCount === visibleIds.length;
        selectAllToggle.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;
      }

      if (deleteSelectedButton) {
        deleteSelectedButton.disabled = visibleSelectedCount === 0;
      }

      if (deleteAllButton) {
        deleteAllButton.disabled = state.tickets.length === 0;
      }
    };

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
              <strong>${escapeAdminHtml(message.author)}</strong>
              ${message.body ? `<p>${escapeAdminHtml(message.body)}</p>` : ""}
              ${buildSupportAttachmentMarkup(message.attachment, message.role === "admin" ? "admin" : "doctor")}
              <time>${formatDate(message.date, true)}</time>
            </article>
          `
        )
        .join("");
      scrollConversationToBottom();

      list.querySelectorAll(".ticket-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.ticketId === ticket.id);
      });
    };

    const renderTickets = () => {
      const filtered = getFilteredTickets();
      syncBulkActions(filtered);

      list.innerHTML = filtered.length
        ? filtered
            .map((ticket) => {
              const doctor = getDoctorById(ticket.doctorId);
              const ticketId = String(ticket.id);
              const isSelected = selectedTicketIds.has(ticketId);
              const latestMessage = ticket.messages?.[ticket.messages.length - 1];
              const previewText = getTicketMessagePreview(
                latestMessage,
                `${doctor ? doctor.name : "Unknown doctor"} needs support follow-up.`
              );
              return `
                <article class="ticket-item admin-inbox-thread${ticket.id === currentTicketId ? " active" : ""}" data-ticket-id="${ticketId}">
                  <div class="admin-inbox-thread-head">
                    <div class="admin-inbox-thread-head-main">
                      <label class="ticket-thread-select admin-inbox-thread-select" for="ticket-select-${ticketId}">
                        <input
                          id="ticket-select-${ticketId}"
                          class="ticket-thread-checkbox"
                          type="checkbox"
                          data-ticket-select-id="${ticketId}"
                          ${isSelected ? "checked" : ""}
                        />
                        <span>Select</span>
                      </label>
                      <div class="admin-inbox-thread-copy">
                        <strong>${ticket.subject}</strong>
                        <small>${doctor ? doctor.name : "Unknown doctor"} - ${ticket.category}</small>
                      </div>
                    </div>
                    <div class="admin-inbox-thread-head-meta">
                      <time class="ticket-thread-date">${formatDate(ticket.updatedAt, true)}</time>
                    </div>
                  </div>

                  <button class="ticket-item-main admin-inbox-thread-main" type="button" data-open-ticket="${ticketId}">
                    <div class="admin-inbox-thread-preview">${previewText}</div>
                  </button>

                  <div class="admin-inbox-thread-footer">
                    <div class="admin-inbox-thread-meta">
                      <span class="admin-inbox-thread-pill admin-inbox-thread-category">${ticket.category}</span>
                      <span class="admin-inbox-thread-pill admin-inbox-thread-priority admin-inbox-thread-priority-${String(ticket.priority).toLowerCase().replace(/\s+/g, "-")}">${ticket.priority}</span>
                      <span class="admin-inbox-thread-pill admin-inbox-thread-status admin-inbox-thread-status-${String(ticket.status).toLowerCase().replace(/\s+/g, "-")}">${ticket.status}</span>
                    </div>
                    <div class="admin-inbox-thread-card-actions">
                      <div class="ticket-item-actions admin-inbox-thread-actions">
                        <button class="ticket-icon-button ticket-delete admin-inbox-thread-icon" type="button" data-delete-ticket="${ticketId}" aria-label="Delete support thread" title="Delete">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 10v8"></path><path d="M12 10v8"></path><path d="M16 10v8"></path><path d="M6 7l1 13h10l1-13"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
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
        document.getElementById("ticket-priority-badge").innerHTML = createBadgeMarkup("Routine", true);
        document.getElementById("conversation-thread").innerHTML = `<div class="empty-state">No messages available.</div>`;
      }
    };

    [search, statusFilter, priorityFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", renderTickets);
      element.addEventListener("change", renderTickets);
    });

    replyInput.addEventListener("input", syncReplyAction);
    replyFileInput?.addEventListener("change", syncReplyAction);
    replyFileClear?.addEventListener("click", (event) => {
      event.preventDefault();
      if (replyFileInput) {
        replyFileInput.value = "";
      }
      syncReplyAction();
    });
    replyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!currentTicketId || (!replyInput.value.trim() && !(replyFileInput?.files?.length))) return;
        replyForm.requestSubmit();
      }
    });

    list.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-ticket-select-id]");
      if (!checkbox) return;
      const ticketId = checkbox.dataset.ticketSelectId;
      if (!ticketId) return;
      if (checkbox.checked) {
        selectedTicketIds.add(ticketId);
      } else {
        selectedTicketIds.delete(ticketId);
      }
      syncBulkActions();
    });

    list.addEventListener("click", (event) => {
      if (event.target.closest(".ticket-thread-select")) {
        return;
      }

      const deleteButton = event.target.closest("[data-delete-ticket]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        const ticketId = deleteButton.dataset.deleteTicket;
        if (!ticketId) return;
        openConfirmation({
          title: "Delete support thread",
          message: "This will delete the selected support thread only from the admin inbox.",
          confirmLabel: "Delete thread",
          variant: "danger",
          onConfirm: async () => {
            try {
              await deleteSupportThread(ticketId);
              selectedTicketIds.delete(ticketId);
              if (currentTicketId === ticketId) {
                currentTicketId = null;
              }
              renderTickets();
            } catch (error) {
              showToast(error.message || "Unable to delete this support thread.", "danger");
            }
          }
        });
        return;
      }

      const openButton = event.target.closest("[data-open-ticket]");
      const card = event.target.closest("[data-ticket-id]");
      const targetId = openButton?.dataset.openTicket || card?.dataset.ticketId;
      if (!targetId) return;
      const ticket = getTicketById(targetId);
      if (ticket) renderDetail(ticket);
    });

    selectAllToggle?.addEventListener("change", () => {
      const filtered = getFilteredTickets();
      const visibleIds = filtered.map((ticket) => String(ticket.id));
      if (selectAllToggle.checked) {
        visibleIds.forEach((id) => selectedTicketIds.add(id));
      } else {
        visibleIds.forEach((id) => selectedTicketIds.delete(id));
      }
      renderTickets();
    });

    deleteSelectedButton?.addEventListener("click", () => {
      const filtered = getFilteredTickets();
      const visibleIds = filtered.map((ticket) => String(ticket.id)).filter((id) => selectedTicketIds.has(id));
      if (!visibleIds.length) return;

      openConfirmation({
        title: "Delete selected support threads",
        message: `This will delete ${visibleIds.length} selected support ${visibleIds.length === 1 ? "thread" : "threads"} only from the admin inbox.`,
        confirmLabel: "Delete selected",
        variant: "danger",
        onConfirm: async () => {
          try {
            await deleteSupportThreadsBulk({ ticketIds: visibleIds });
            visibleIds.forEach((id) => selectedTicketIds.delete(id));
            if (currentTicketId && visibleIds.includes(String(currentTicketId))) {
              currentTicketId = null;
            }
            renderTickets();
          } catch (error) {
            showToast(error.message || "Unable to delete the selected support threads.", "danger");
          }
        }
      });
    });

    deleteAllButton?.addEventListener("click", () => {
      if (!state.tickets.length) return;
      openConfirmation({
        title: "Delete all support threads",
        message: "This will delete every support thread only from the admin inbox.",
        confirmLabel: "Delete all",
        variant: "danger",
        onConfirm: async () => {
          try {
            await deleteSupportThreadsBulk({ deleteAll: true });
            selectedTicketIds = new Set();
            currentTicketId = null;
            renderTickets();
          } catch (error) {
            showToast(error.message || "Unable to delete all support threads.", "danger");
          }
        }
      });
    });

    statusSelect.addEventListener("change", async () => {
      if (!currentTicketId) return;
      try {
        const updatedTicket = await updateTicketStatus(currentTicketId, statusSelect.value);
        showToast(`Ticket status updated to ${statusSelect.value}.`);
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to update the support ticket status.", "danger");
      }
    });

    resolveButton.addEventListener("click", async () => {
      if (!currentTicketId) return;
      const ticket = getTicketById(currentTicketId);
      const nextStatus = ticket.status === "Resolved" ? "In Progress" : "Resolved";
      try {
        const updatedTicket = await updateTicketStatus(currentTicketId, nextStatus);
        showToast(`Ticket marked ${nextStatus}.`);
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to update the support ticket status.", "danger");
      }
    });

    deleteTicketButton?.addEventListener("click", () => {
      if (!currentTicketId) return;
      openConfirmation({
        title: "Delete support conversation",
        message: "This will remove the entire support conversation from the admin inbox.",
        confirmLabel: "Delete conversation",
        variant: "danger",
        onConfirm: () => {
          deleteTicket(currentTicketId);
          currentTicketId = null;
          renderTickets();
        }
      });
    });

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const replyFile = replyFileInput?.files?.[0] || null;
      if (!currentTicketId || (!replyInput.value.trim() && !replyFile)) return;
      try {
        const updatedTicket = await replyToTicket(currentTicketId, replyInput.value.trim(), replyFile);
        replyInput.value = "";
        if (replyFileInput) {
          replyFileInput.value = "";
        }
        syncReplyAction();
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        const isUnavailableError =
          error?.status === 410 &&
          (error?.payload?.code === "THREAD_DELETED_BY_DOCTOR" ||
            error?.payload?.code === "THREAD_DELETED_BY_ADMIN");

        if (isUnavailableError) {
          state.tickets = state.tickets.filter((ticket) => String(ticket.id) !== String(currentTicketId));
          currentTicketId = null;
          persistState();
          renderTickets();
          showAdminThreadUnavailablePopup(
            error.message || "This thread is no longer available."
          );
          return;
        }

        showToast(error.message || "Unable to send the support reply right now.", "danger");
      }
    });

    syncReplyAction();
    syncSupportTicketsFromBackend()
      .then(() => markAdminSupportTicketsRead())
      .then(() => syncSupportTicketsFromBackend())
      .finally(() => {
        renderTickets();
      });

    window.NoufarAdminSupportCenterRefresh = () => {
      if (currentTicketId && !getTicketById(currentTicketId)) {
        currentTicketId = null;
      }
      renderTickets();
    };
  }

  function renderCurrentAdminPage() {
    const page = document.body.dataset.page;

    if (page === "overview") populateOverview();
    if (page === "doctors") populateDoctorsPage();
    if (page === "doctor-details") populateDoctorDetails();
    if (page === "support") {
      if (typeof window.NoufarAdminSupportCenterRefresh === "function") {
        window.NoufarAdminSupportCenterRefresh();
      } else {
        populateSupportCenter();
      }
    }
    if (page === "system") populateSystemPage();
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
            <button class="btn btn-secondary" type="button" id="confirmation-cancel" data-close-modal>Cancel</button>
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
    const submitButton = document.getElementById("confirmation-submit");
    const cancelButton = document.getElementById("confirmation-cancel");
    document.getElementById("confirmation-title").textContent = options.title;
    document.getElementById("confirmation-message").textContent = options.message;
    submitButton.textContent = options.confirmLabel || "Confirm";
    card.classList.toggle("danger", options.variant === "danger");
    card.classList.toggle("warning", options.variant === "warning");
    submitButton.classList.toggle("btn-danger", options.variant !== "warning");
    submitButton.classList.toggle("btn-warning", options.variant === "warning");
    reasonWrap.hidden = !options.reasonField;
    reasonInput.value = "";
    cancelButton.hidden = Boolean(options.hideCancel);
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

  function buildNotificationSections() {
    const feed = getNotificationFeed().filter((item) => !item.read);
    if (!feed.length) {
      return `
        <section class="topbar-popover-section">
          <div class="topbar-popover-empty">
            <strong>No new alerts</strong>
            <p>Doctor approvals and support message notifications will appear here.</p>
          </div>
        </section>
      `;
    }

    const groups = [
      { label: "Pending doctor approvals", type: "approval" },
      { label: "Support message notifications", type: "support" }
    ];

    return groups
      .map((group) => {
        const items = feed.filter((item) => item.type === group.type);
        if (!items.length) return "";

        return `
          <section class="topbar-popover-section">
            <div class="topbar-popover-section-head">
              <strong>${group.label}</strong>
              <span>${items.length}</span>
            </div>
            <div class="topbar-popover-section-list">
              ${items
                .map(
                  (item) => `
                    <article class="topbar-popover-item${item.read ? "" : " unread"}">
                      <a class="topbar-popover-link" href="${item.href}" data-notification-target="${item.key}">
                        <div>
                          <strong>${item.title}</strong>
                          <p>${item.description}</p>
                        </div>
                        <span>${formatDate(item.date, true)}</span>
                      </a>
                      <button class="topbar-popover-read-button" type="button" data-mark-read="${item.key}">
                        Mark as read
                      </button>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function setupTopbarMenus() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;

    const modelTrigger = actions.querySelector("#system-model-trigger");
    const modelSwitcher = actions.querySelector(".topbar-model-switcher");
    const notificationTrigger = actions.querySelector(".notification-trigger");
    const profileTrigger = actions.querySelector(".profile-trigger");
    const setProfileExpanded = (isExpanded) => {
      if (profileTrigger) profileTrigger.setAttribute("aria-expanded", String(isExpanded));
    };
    const setModelExpanded = (isExpanded) => {
      if (modelTrigger) modelTrigger.setAttribute("aria-expanded", String(isExpanded));
    };
    const closeModelMenu = () => {
      const modelPopover = document.getElementById("system-model-popover");
      if (modelPopover) modelPopover.hidden = true;
      setModelExpanded(false);
    };

    if (modelTrigger && modelSwitcher && !modelSwitcher.querySelector("#system-model-popover")) {
      const modelPopover = document.createElement("div");
      modelPopover.className = "topbar-popover topbar-model-popover";
      modelPopover.id = "system-model-popover";
      modelPopover.hidden = true;
      modelPopover.innerHTML = `
        <div class="topbar-popover-head">
          <div>
            <strong>Change model</strong>
            <p>Select the prediction model used in the system review workspace.</p>
          </div>
        </div>
        <div class="system-model-options">${buildSystemModelOptions()}</div>
      `;
      modelSwitcher.appendChild(modelPopover);
      syncSystemModelUi();

      modelTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpening = modelPopover.hidden;
        modelPopover.hidden = !isOpening;
        setModelExpanded(isOpening);
        const notificationPopover = document.getElementById("admin-notification-popover");
        const profilePopover = document.getElementById("admin-profile-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        if (profilePopover) profilePopover.hidden = true;
      });

      modelPopover.addEventListener("click", (event) => {
        const option = event.target.closest("[data-system-model]");
        if (!option) return;
        const nextModel = option.dataset.systemModel;
        const nextModelKey = option.dataset.systemModelKey;
        if (!nextModel || !nextModelKey) return;
        if (nextModel === getSelectedSystemModel()) {
          closeModelMenu();
          return;
        }

        option.disabled = true;
        requestAdminJson("/predictions/models/active", {
          method: "PUT",
          body: JSON.stringify({ modelKey: nextModelKey }),
        })
          .then((payload) => {
            systemModelOptionsCache = Array.isArray(payload?.options) && payload.options.length
              ? payload.options.map((model) => ({
                  key: model.key || "",
                  label: model.label || DEFAULT_SYSTEM_MODEL,
                  description: model.description || "",
                  deployed: model.deployed !== false,
                }))
              : systemModelOptionsCache;

            adminUi.systemModel = payload?.activeModelLabel || nextModel;
            persistUiState();
            syncSystemModelUi();
            renderCurrentAdminPage();
            closeModelMenu();
            showToast(payload?.message || `${nextModel} is now the active system model.`);
          })
          .catch((error) => {
            showToast(error?.message || "Unable to change the active prediction model.", "danger");
          })
          .finally(() => {
            option.disabled = false;
          });
      });
    }

    if (notificationTrigger && !actions.querySelector("#admin-notification-popover")) {
      const notificationDot = notificationTrigger.querySelector(".notification-dot");

      const notificationPopover = document.createElement("div");
      notificationPopover.className = "topbar-popover";
      notificationPopover.id = "admin-notification-popover";
      notificationPopover.hidden = true;
      notificationPopover.innerHTML = `
        <div class="topbar-popover-head">
          <div>
            <strong>Notifications</strong>
            <p>Unread doctor approval and support message updates.</p>
          </div>
          <button class="topbar-inline-action" type="button" id="mark-all-notifications">
            Mark all as read
          </button>
        </div>
        <div class="topbar-popover-scroll">
          <div class="topbar-popover-list" id="admin-notification-list">${buildNotificationSections()}</div>
        </div>
      `;
      actions.appendChild(notificationPopover);

      const refreshNotifications = async () => {
        await fetchAdminNotifications().catch(() => {});
        const notificationCount = getUnreadNotificationCount();
        if (
          previousUnreadNotificationCount !== null &&
          notificationCount > previousUnreadNotificationCount
        ) {
          playAdminNotificationSound().catch(() => {});
        }
        previousUnreadNotificationCount = notificationCount;
        if (notificationDot) {
          notificationDot.textContent = String(notificationCount);
          notificationDot.hidden = notificationCount === 0;
        }
        const list = notificationPopover.querySelector("#admin-notification-list");
        if (list) list.innerHTML = buildNotificationSections();
        const markAllButton = notificationPopover.querySelector("#mark-all-notifications");
        if (markAllButton) {
          markAllButton.disabled = notificationCount === 0;
          markAllButton.setAttribute("aria-disabled", String(notificationCount === 0));
        }
      };

      refreshNotifications();
      document.addEventListener("noufar-admin-state-updated", () => {
        refreshNotifications();
      });

      if (!adminNotificationPollingStarted) {
        adminNotificationPollingStarted = true;
        window.setInterval(() => {
          if (!isAuthenticated() || document.hidden || adminRealtimeConnected) return;
          refreshNotifications();
        }, ADMIN_FALLBACK_POLL_INTERVAL);
      }

      const toggleNotifications = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await refreshNotifications();
        const isOpening = notificationPopover.hidden;
        notificationPopover.hidden = !isOpening;
        const profilePopover = document.getElementById("admin-profile-popover");
        if (profilePopover) profilePopover.hidden = true;
        setProfileExpanded(false);
        closeModelMenu();
      };

      notificationTrigger.addEventListener("click", toggleNotifications);

      notificationPopover.addEventListener("click", async (event) => {
        const markReadButton = event.target.closest("[data-mark-read]");
        const markAllButton = event.target.closest("#mark-all-notifications");

        if (markReadButton) {
          event.preventDefault();
          event.stopPropagation();
          await markAdminNotificationAsRead(markReadButton.dataset.markRead).catch(() => {});
          await refreshNotifications();
          return;
        }

        if (markAllButton) {
          event.preventDefault();
          await markAllAdminNotificationsAsRead().catch(() => {});
          await refreshNotifications();
          return;
        }

        const notificationLink = event.target.closest(".topbar-popover-link");
        if (notificationLink) {
          event.preventDefault();
          const notificationId = notificationLink.dataset.notificationTarget;
          if (!notificationId) return;
          const target = await openAdminNotificationTarget(notificationId).catch(() => null);
          await refreshNotifications();
          if (target?.url) {
            window.location.href = target.url;
          }
        }
      });
    }

    if (profileTrigger && !actions.querySelector("#admin-profile-popover")) {
      const session = getAuthSession();
      const profileName = session?.user?.name || "Admin";
      const profileEmail = session?.user?.email || "Admin account";
      setProfileExpanded(false);

      const profilePopover = document.createElement("div");
      profilePopover.className = "topbar-popover topbar-popover-profile";
      profilePopover.id = "admin-profile-popover";
      profilePopover.hidden = true;
      profilePopover.innerHTML = `
        <div class="topbar-popover-head">
          <div class="topbar-popover-profile-copy">
            <strong>${profileName}</strong>
            <p>${profileEmail}</p>
          </div>
        </div>
        <div class="topbar-popover-actions">
          <button class="btn btn-secondary topbar-logout-button" type="button">Logout</button>
        </div>
      `;
      actions.appendChild(profilePopover);

      const toggleProfileMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpening = profilePopover.hidden;
        profilePopover.hidden = !isOpening;
        setProfileExpanded(isOpening);
        const notificationPopover = document.getElementById("admin-notification-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        closeModelMenu();
      };

      profileTrigger.addEventListener("click", toggleProfileMenu);

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
        setProfileExpanded(false);
        closeModelMenu();
      }
    });
  }

  function setupSidebar() {
    const shell = document.querySelector(".admin-shell");
    const sidebar = document.querySelector(".admin-sidebar");
    const toggle = document.querySelector(".topbar-toggle");
    if (!shell || !sidebar || !toggle) return;
    let overlay = document.querySelector(".admin-sidebar-overlay");

    if (!overlay) {
      overlay = document.createElement("button");
      overlay.className = "admin-sidebar-overlay";
      overlay.type = "button";
      overlay.hidden = true;
      overlay.setAttribute("aria-label", "Close sidebar");
      shell.appendChild(overlay);
    }

    const syncSidebarState = () => {
      const isMobile = window.innerWidth <= 1040;
      shell.classList.toggle("is-collapsed", !isMobile && Boolean(adminUi.sidebarCollapsed));
      shell.classList.toggle("sidebar-open", isMobile && sidebar.classList.contains("is-open"));
      overlay.hidden = !(isMobile && sidebar.classList.contains("is-open"));
      toggle.setAttribute("aria-pressed", String((!isMobile && adminUi.sidebarCollapsed) || (isMobile && sidebar.classList.contains("is-open"))));
    };

    toggle.addEventListener("click", () => {
      const isMobile = window.innerWidth <= 1040;
      if (isMobile) {
        sidebar.classList.toggle("is-open");
      } else {
        adminUi.sidebarCollapsed = !adminUi.sidebarCollapsed;
        persistUiState();
      }
      syncSidebarState();
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("is-open");
      syncSidebarState();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1040) {
        sidebar.classList.remove("is-open");
      }
      syncSidebarState();
    });

    syncSidebarState();
  }

  async function init() {
    if (!requireAuth()) return;
    document.addEventListener("pointerdown", armAdminNotificationAudio, { once: true });
    document.addEventListener("keydown", armAdminNotificationAudio, { once: true });
    await syncDoctorsFromBackend();
    if (adminPageNeedsPredictions()) {
      await syncSystemModelFromBackend().catch(() => {});
    }
    if (adminPageNeedsPredictions()) {
      await syncPredictionsFromBackend();
    }
    if (adminPageNeedsSupportTickets()) {
      await syncSupportTicketsFromBackend();
    }
    setupSidebar();
    setupTopbarMenus();
    startAdminRealtimeStream();
    createModal();
    renderCurrentAdminPage();
  }

  window.NoufarAdminApp = {
    openConfirmation,
    showToast
  };

  document.addEventListener("DOMContentLoaded", init);
})();
