const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const contactForm = document.querySelector("#contact-form");
const formNote = document.querySelector("#form-note");
const modalLayer = document.querySelector("#modal-layer");
const modalTriggers = document.querySelectorAll("[data-modal-open]");
const modalCloses = document.querySelectorAll("[data-modal-close]");
const modals = {
  demo: document.querySelector("#demo-modal"),
  login: document.querySelector("#login-modal"),
  reset: document.querySelector("#reset-modal"),
  register: document.querySelector("#register-modal"),
};
const demoVideo = document.querySelector("#demo-video");
const loginForm = document.querySelector("#login-form");
const resetForm = document.querySelector("#reset-form");
const registerForm = document.querySelector("#register-form");
const loginNote = document.querySelector("#login-note");
const resetNote = document.querySelector("#reset-note");
const registerNote = document.querySelector("#register-note");
let lastTrigger = null;

const updateHeaderState = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 14);
};

updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const closeModals = () => {
  if (!modalLayer) return;

  modalLayer.classList.remove("is-open");
  modalLayer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  Object.values(modals).forEach((modal) => {
    if (modal) {
      modal.hidden = true;
    }
  });

  if (demoVideo) {
    demoVideo.pause();
    demoVideo.currentTime = 0;
  }

  if (lastTrigger) {
    lastTrigger.focus();
  }
};

const openModal = (name, trigger) => {
  const modal = modals[name];
  if (!modal || !modalLayer) return;

  lastTrigger = trigger ?? null;
  Object.values(modals).forEach((item) => {
    if (item) {
      item.hidden = item !== modal;
    }
  });

  modalLayer.classList.add("is-open");
  modalLayer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const firstField = modal.querySelector("input");
  if (name === "demo" && demoVideo) {
    demoVideo.currentTime = 0;
    demoVideo.play().catch(() => {});
    demoVideo.focus?.();
  } else if (firstField) {
    firstField.focus();
  }
};

modalTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    openModal(trigger.dataset.modalOpen, trigger);
  });
});

modalCloses.forEach((control) => {
  control.addEventListener("click", closeModals);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalLayer?.classList.contains("is-open")) {
    closeModals();
  }
});

if (contactForm && formNote) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!contactForm.reportValidity()) {
      formNote.textContent = "Please complete the required fields before sending your request.";
      return;
    }

    formNote.textContent = "Thank you. Your support request has been prepared for the NOUFAR CDSS team.";
    contactForm.reset();
  });
}

if (loginForm && loginNote) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!loginForm.reportValidity()) {
      loginNote.textContent = "Please enter your professional email and password.";
      return;
    }

    loginNote.textContent = "Login successful. Redirecting to the dashboard...";
    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);
  });
}

if (resetForm && resetNote) {
  resetForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!resetForm.reportValidity()) {
      resetNote.textContent = "Please enter the professional email associated with your account.";
      return;
    }

    resetNote.textContent =
      "Password reset request captured. Connect this form to your email reset flow next.";
    resetForm.reset();
  });
}

if (registerForm && registerNote) {
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!registerForm.reportValidity()) {
      registerNote.textContent = "Please complete the required registration fields.";
      return;
    }

    const password = registerForm.elements.password?.value;
    const confirmPassword = registerForm.elements.confirmPassword?.value;

    if (password !== confirmPassword) {
      registerNote.textContent = "Passwords do not match. Please confirm them again.";
      return;
    }

    registerNote.textContent = "Registration successful. Redirecting to the dashboard...";
    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 500);
  });
}
