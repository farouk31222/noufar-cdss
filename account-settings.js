const accountSidebar = document.querySelector(".sidebar");
const accountMobileButton = document.querySelector(".mobile-nav-button");
const saveAccountButton = document.querySelector("#save-account-settings");
const accountSaveBanner = document.querySelector("#account-save-banner");
const accountLastUpdated = document.querySelector("#account-last-updated");
const photoInput = document.querySelector("#profile-photo-input");
const photoPickerButton = document.querySelector("#open-photo-picker");
const removePhotoButton = document.querySelector("#remove-photo-button");
const photoPreview = document.querySelector("#account-photo-preview");
const photoNote = document.querySelector("#account-photo-note");
const changeEmailModal = document.querySelector("#change-email-modal");
const changePasswordModal = document.querySelector("#change-password-modal");
const forgotPasswordModal = document.querySelector("#forgot-password-modal");
const accountModalCloseButtons = document.querySelectorAll("[data-close-account-modal]");
const removePhotoModal = document.querySelector("#remove-photo-modal");
const removePhotoCloseButtons = document.querySelectorAll("[data-close-photo-modal]");
const confirmRemovePhotoButton = document.querySelector("#confirm-remove-photo");
const changeEmailButton = document.querySelector("#change-email-button");
const togglePasswordPanelButton = document.querySelector("#toggle-password-panel");
const changeEmailForm = document.querySelector("#change-email-form");
const changePasswordForm = document.querySelector("#change-password-form");
const forgotPasswordForm = document.querySelector("#forgot-password-form");
const forgotPasswordButton = document.querySelector("#forgot-password-button");
const currentEmailDisplay = document.querySelector("#current-email-display");
const newEmailInput = document.querySelector("#new-email-input");
const confirmEmailInput = document.querySelector("#confirm-email-input");
const confirmEmailPasswordInput = document.querySelector("#confirm-email-password");
const forgotPasswordEmailInput = document.querySelector("#forgot-password-email");
const supportAccessToggle = document.querySelector("#support-access-toggle");
const twoStepToggle = document.querySelector("#two-step-toggle");
const privacyModeToggle = document.querySelector("#privacy-mode-toggle");
const logoutDevicesButton = document.querySelector("#logout-devices-button");
const deleteAccountButton = document.querySelector("#delete-account-button");
const updatePasswordButton = document.querySelector("#update-password-button");
const currentPasswordInput = document.querySelector("#current-password");
const newPasswordInput = document.querySelector("#new-password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const profileAvatars = document.querySelectorAll(
  ".sidebar-profile .profile-avatar, .profile-trigger-avatar, .profile-menu-avatar"
);
const profilePhotoStorageKey = "noufarCdssProfilePhoto";
const maxProfilePhotoSize = 2 * 1024 * 1024;

function stampLastUpdated() {
  if (!accountLastUpdated) {
    return;
  }

  const savedAt = new Date();
  const formatted = savedAt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  accountLastUpdated.textContent = formatted;
}

function showBanner(message, isSuccess = true) {
  if (!accountSaveBanner) {
    return;
  }

  accountSaveBanner.textContent = message;
  accountSaveBanner.classList.toggle("success", isSuccess);
  stampLastUpdated();
}

function applyPhotoToShell(photoData) {
  profileAvatars.forEach((avatar) => {
    avatar.style.backgroundImage = photoData ? `url("${photoData}")` : "";
    avatar.style.backgroundSize = photoData ? "cover" : "";
    avatar.style.backgroundPosition = photoData ? "center" : "";
    avatar.textContent = photoData ? "" : "DC";
  });
}

function renderPhotoState() {
  if (!photoPreview || !photoPickerButton || !removePhotoButton) {
    return;
  }

  const storedPhoto = window.localStorage.getItem(profilePhotoStorageKey);
  const hasPhoto = Boolean(storedPhoto);

  photoPreview.style.backgroundImage = hasPhoto ? `url("${storedPhoto}")` : "";
  photoPreview.classList.toggle("has-image", hasPhoto);
  photoPreview.textContent = hasPhoto ? "" : "DC";

  photoPickerButton.textContent = hasPhoto ? "Change Image" : "Upload Profile Photo";
  removePhotoButton.hidden = !hasPhoto;

  if (photoNote) {
    photoNote.textContent = hasPhoto
      ? "Current physician profile photo is active for this account."
      : "We support PNG, JPG, JPEG, GIF and WEBP files under 2 MB.";
  }

  applyPhotoToShell(storedPhoto);
}

function closeRemovePhotoModal() {
  if (!removePhotoModal) {
    return;
  }

  removePhotoModal.hidden = true;
}

function openRemovePhotoModal() {
  if (!removePhotoModal) {
    return;
  }

  removePhotoModal.hidden = false;
}

function closeAccountModal(modal) {
  if (!modal) {
    return;
  }

  modal.hidden = true;
}

function openAccountModal(modal) {
  if (!modal) {
    return;
  }

  modal.hidden = false;
}

if (accountMobileButton && accountSidebar) {
  accountMobileButton.addEventListener("click", () => {
    const isOpen = accountSidebar.classList.toggle("is-open");
    accountMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

if (saveAccountButton && accountSaveBanner) {
  saveAccountButton.addEventListener("click", () => {
    showBanner(
      "Account settings updated successfully. Your clinical workflow preferences have been saved."
    );
  });
}

if (photoPickerButton && photoInput) {
  photoPickerButton.addEventListener("click", () => {
    photoInput.click();
  });
}

if (photoInput && photoPreview) {
  photoInput.addEventListener("change", () => {
    const [file] = photoInput.files || [];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      if (photoNote) {
        photoNote.textContent = "Please select a valid image file for the profile picture.";
      }
      showBanner("Profile photo was not updated because the selected file is not an image.", false);
      return;
    }

    if (file.size > maxProfilePhotoSize) {
      if (photoNote) {
        photoNote.textContent = "Please choose an image smaller than 2 MB.";
      }
      showBanner("Profile photo was not updated because the file exceeds the 2 MB limit.", false);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      window.localStorage.setItem(profilePhotoStorageKey, String(reader.result));
      renderPhotoState();

      if (photoNote) {
        photoNote.textContent = `${file.name} is now set as the active profile photo.`;
      }

      showBanner("Profile photo updated successfully for your clinical account.");
    });

    reader.readAsDataURL(file);
  });
}

if (removePhotoButton && photoPreview) {
  removePhotoButton.addEventListener("click", () => {
    openRemovePhotoModal();
  });
}

removePhotoCloseButtons.forEach((button) => {
  button.addEventListener("click", closeRemovePhotoModal);
});

if (confirmRemovePhotoButton) {
  confirmRemovePhotoButton.addEventListener("click", () => {
    window.localStorage.removeItem(profilePhotoStorageKey);

    if (photoInput) {
      photoInput.value = "";
    }

    renderPhotoState();
    closeRemovePhotoModal();
    showBanner("Profile photo removed. Initials avatar restored for your account.");
  });
}

if (changeEmailButton) {
  changeEmailButton.addEventListener("click", () => {
    openAccountModal(changeEmailModal);
  });
}

if (togglePasswordPanelButton) {
  togglePasswordPanelButton.addEventListener("click", () => {
    openAccountModal(changePasswordModal);
  });
}

accountModalCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeAccountModal(changeEmailModal);
    closeAccountModal(changePasswordModal);
    closeAccountModal(forgotPasswordModal);
  });
});

if (changeEmailForm) {
  changeEmailForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nextEmail = newEmailInput?.value.trim() || "";
    const confirmEmail = confirmEmailInput?.value.trim() || "";
    const confirmPassword = confirmEmailPasswordInput?.value.trim() || "";

    if (!nextEmail || !confirmEmail || !confirmPassword) {
      showBanner("Please complete the email fields and your current password before saving.", false);
      return;
    }

    if (nextEmail !== confirmEmail) {
      showBanner("The new email and confirmation email do not match.", false);
      return;
    }

    closeAccountModal(changeEmailModal);
    if (currentEmailDisplay) {
      currentEmailDisplay.value = nextEmail;
    }
    if (forgotPasswordEmailInput) {
      forgotPasswordEmailInput.value = nextEmail;
    }
    changeEmailForm.reset();
    showBanner("Professional email updated successfully for your NOUFAR CDSS account.");
  });
}

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", () => {
    closeAccountModal(changePasswordModal);
    openAccountModal(forgotPasswordModal);
  });
}

if (changePasswordForm && updatePasswordButton) {
  changePasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const currentPassword = currentPasswordInput?.value.trim() || "";
    const newPassword = newPasswordInput?.value.trim() || "";
    const confirmPassword = confirmPasswordInput?.value.trim() || "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      showBanner("Please complete all password fields before updating your password.", false);
      return;
    }

    if (newPassword.length < 12) {
      showBanner("The new password must contain at least 12 characters.", false);
      return;
    }

    if (newPassword !== confirmPassword) {
      showBanner("The new password and confirmation do not match.", false);
      return;
    }

    closeAccountModal(changePasswordModal);
    showBanner("Password updated successfully. Your clinical account credentials have been refreshed.");

    if (currentPasswordInput) {
      currentPasswordInput.value = "";
    }

    if (newPasswordInput) {
      newPasswordInput.value = "";
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.value = "";
    }
  });
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const resetEmail = forgotPasswordEmailInput?.value.trim() || "";

    if (!resetEmail) {
      showBanner("Please enter your email to receive the password reset link.", false);
      return;
    }

    closeAccountModal(forgotPasswordModal);
    showBanner("Password reset instructions have been sent to the selected email address.");
  });
}

if (supportAccessToggle) {
  supportAccessToggle.addEventListener("change", () => {
    showBanner(
      supportAccessToggle.checked
        ? "Support access enabled. Technical assistance can now be granted when needed."
        : "Support access disabled. Only your physician account can access this workspace."
    );
  });
}

if (twoStepToggle) {
  twoStepToggle.addEventListener("change", () => {
    showBanner(
      twoStepToggle.checked
        ? "2-step verification enabled for future NOUFAR CDSS logins."
        : "2-step verification disabled. Your account now uses password-only login.",
      twoStepToggle.checked
    );
  });
}

if (privacyModeToggle) {
  privacyModeToggle.addEventListener("change", () => {
    showBanner(
      privacyModeToggle.checked
        ? "Privacy mode enabled. Patient identifiers will stay masked by default."
        : "Privacy mode disabled. Full patient identifiers may now appear in reviews."
    );
  });
}

if (logoutDevicesButton) {
  logoutDevicesButton.addEventListener("click", () => {
    showBanner("All other active sessions have been signed out successfully.");
  });
}

if (deleteAccountButton) {
  deleteAccountButton.addEventListener("click", () => {
    showBanner("Account deletion requires administrator confirmation before it can proceed.", false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && removePhotoModal && !removePhotoModal.hidden) {
    closeRemovePhotoModal();
  }

  if (event.key === "Escape") {
    closeAccountModal(changeEmailModal);
    closeAccountModal(changePasswordModal);
    closeAccountModal(forgotPasswordModal);
  }
});

renderPhotoState();
