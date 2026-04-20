const profileToggle = document.querySelector("[data-profile-toggle]");
const profileMenu = document.querySelector("[data-profile-menu]");
const appLayout = document.querySelector(".app-layout");
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.querySelector(".mobile-nav-button");
const sidebarLinks = document.querySelectorAll(".sidebar-link");
const comingSoonModal = document.querySelector("#coming-soon-modal");
const comingSoonTitle = document.querySelector("#coming-soon-title");
const comingSoonCopy = document.querySelector("#coming-soon-copy");
const comingSoonTriggers = document.querySelectorAll("[data-coming-soon-trigger]");
const comingSoonClosers = document.querySelectorAll("[data-coming-soon-close]");
const supportTriggers = document.querySelectorAll('.profile-menu-link[href="index.html#support"]');
const desktopSidebarStorageKey = "noufar-sidebar-collapsed";

sidebarLinks.forEach((link) => {
  if (link.dataset.label) return;
  const label = link.querySelector("span")?.textContent?.trim();
  if (label) {
    link.dataset.label = label;
  }
});

if (appLayout && sidebar && sidebarToggle) {
  const desktopMediaQuery = window.matchMedia("(max-width: 900px)");

  const applyDesktopSidebarState = () => {
    if (desktopMediaQuery.matches) {
      appLayout.classList.remove("sidebar-collapsed");
      sidebar.classList.remove("is-open");
      sidebarToggle.setAttribute("aria-expanded", "false");
      return;
    }

    const isCollapsed = window.localStorage.getItem(desktopSidebarStorageKey) === "true";
    appLayout.classList.toggle("sidebar-collapsed", isCollapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  };

  applyDesktopSidebarState();

  sidebarToggle.addEventListener("click", () => {
    if (desktopMediaQuery.matches) {
      const isOpen = sidebar.classList.toggle("is-open");
      sidebarToggle.setAttribute("aria-expanded", String(isOpen));
      return;
    }

    const shouldCollapse = !appLayout.classList.contains("sidebar-collapsed");
    appLayout.classList.toggle("sidebar-collapsed", shouldCollapse);
    window.localStorage.setItem(desktopSidebarStorageKey, String(shouldCollapse));
    sidebarToggle.setAttribute("aria-expanded", String(!shouldCollapse));
  });

  desktopMediaQuery.addEventListener("change", applyDesktopSidebarState);
}

if (supportTriggers.length) {
  const supportModal = document.createElement("section");
  supportModal.className = "modal-shell";
  supportModal.id = "support-request-modal";
  supportModal.hidden = true;
  supportModal.setAttribute("aria-labelledby", "support-request-title");
  supportModal.setAttribute("aria-modal", "true");
  supportModal.setAttribute("role", "dialog");
  supportModal.innerHTML = `
    <div class="modal-backdrop" data-support-close></div>
    <div class="modal-card modal-card-support">
      <div class="modal-card-head">
        <div>
          <h2 id="support-request-title">Contact Support Center</h2>
          <p>Share your workflow question and the NOUFAR CDSS support team will follow up securely.</p>
        </div>
        <button class="modal-close-button" type="button" aria-label="Close support form" data-support-close>
          <span></span>
          <span></span>
        </button>
      </div>
      <form class="account-modal-form support-request-form" id="support-request-form">
        <div class="support-request-grid">
          <label class="field">
            <span>Clinical contact</span>
            <input type="text" value="Dr. Clinical Lead" readonly />
          </label>
          <label class="field">
            <span>Email address</span>
            <input type="email" value="clinical.lead@noufar.med" readonly />
          </label>
        </div>
        <div class="support-request-grid">
          <label class="field">
            <span>Support category</span>
            <select required>
              <option value="">Select a category</option>
              <option value="Prediction workflow">Prediction workflow</option>
              <option value="Dataset import">Dataset import</option>
              <option value="Account settings">Account settings</option>
              <option value="Clinical dashboard">Clinical dashboard</option>
              <option value="Technical issue">Technical issue</option>
            </select>
          </label>
          <label class="field">
            <span>Priority level</span>
            <select required>
              <option value="">Select priority</option>
              <option value="Routine">Routine</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Subject</span>
          <input type="text" placeholder="Briefly describe your request" required />
        </label>
        <label class="field">
          <span>Message</span>
          <textarea class="support-textarea" placeholder="Describe the issue, the page involved, and the support you need." required></textarea>
        </label>
        <p class="support-request-status" id="support-request-status" aria-live="polite"></p>
        <div class="account-modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-support-close>Cancel</button>
          <button class="btn btn-primary btn-sm" type="submit" id="support-submit-button">Send Request</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(supportModal);

  const supportForm = supportModal.querySelector("#support-request-form");
  const supportStatus = supportModal.querySelector("#support-request-status");
  const supportSubmitButton = supportModal.querySelector("#support-submit-button");
  const supportClosers = supportModal.querySelectorAll("[data-support-close]");

  const closeSupportModal = () => {
    supportModal.hidden = true;
  };

  const openSupportModal = () => {
    supportModal.hidden = false;
    if (supportStatus) {
      supportStatus.textContent = "";
      supportStatus.className = "support-request-status";
    }
  };

  supportTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (profileMenu && !profileMenu.hidden) {
        profileMenu.hidden = true;
        if (profileToggle) profileToggle.setAttribute("aria-expanded", "false");
      }
      openSupportModal();
    });
  });

  supportClosers.forEach((closer) => {
    closer.addEventListener("click", closeSupportModal);
  });

  if (supportForm) {
    supportForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!supportForm.reportValidity()) return;

      if (supportStatus) {
        supportStatus.textContent = "Support request sent successfully. Our team will contact you shortly.";
        supportStatus.className = "support-request-status is-success";
      }

      if (supportSubmitButton) {
        supportSubmitButton.textContent = "Request Sent";
        supportSubmitButton.disabled = true;
      }

      window.setTimeout(() => {
        supportForm.reset();
        if (supportSubmitButton) {
          supportSubmitButton.textContent = "Send Request";
          supportSubmitButton.disabled = false;
        }
        closeSupportModal();
      }, 1200);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || supportModal.hidden) return;
    closeSupportModal();
  });
}

if (comingSoonModal && comingSoonTriggers.length) {
  const closeComingSoonModal = () => {
    comingSoonModal.hidden = true;
  };

  const openComingSoonModal = (moduleName) => {
    if (comingSoonTitle) {
      comingSoonTitle.textContent = `${moduleName} Module`;
    }

    if (comingSoonCopy) {
      comingSoonCopy.textContent = `${moduleName} is coming soon in NOUFAR CDSS. Stay tuned for the next workspace update.`;
    }

    comingSoonModal.hidden = false;
  };

  comingSoonTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openComingSoonModal(trigger.dataset.comingSoonTrigger || trigger.textContent.trim() || "Module");
    });
  });

  comingSoonClosers.forEach((closer) => {
    closer.addEventListener("click", closeComingSoonModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || comingSoonModal.hidden) return;
    closeComingSoonModal();
  });
}

if (profileToggle && profileMenu) {
  const closeProfileMenu = () => {
    profileMenu.hidden = true;
    profileToggle.setAttribute("aria-expanded", "false");
  };

  const openProfileMenu = () => {
    profileMenu.hidden = false;
    profileToggle.setAttribute("aria-expanded", "true");
  };

  profileToggle.addEventListener("click", () => {
    if (profileMenu.hidden) {
      openProfileMenu();
      return;
    }

    closeProfileMenu();
  });

  document.addEventListener("click", (event) => {
    if (profileMenu.hidden) return;
    if (profileMenu.contains(event.target) || profileToggle.contains(event.target)) return;
    closeProfileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProfileMenu();
  });
}
