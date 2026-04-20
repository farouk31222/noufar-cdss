(function () {
  const AUTH_KEY = "noufar-admin-auth-v1";

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function persistSession() {
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        authenticated: true,
        username: "admin",
        displayName: "Sarah M.",
        role: "Lead platform admin",
        loggedAt: new Date().toISOString()
      })
    );
  }

  function init() {
    if (getSession()?.authenticated) {
      window.location.href = "index.html";
      return;
    }

    const form = document.getElementById("admin-login-form");
    const username = document.getElementById("admin-username");
    const password = document.getElementById("admin-password");
    const error = document.getElementById("admin-login-error");
    if (!form || !username || !password || !error) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const userValue = username.value.trim();
      const passwordValue = password.value.trim();

      if (userValue === "admin" && passwordValue === "admin") {
        persistSession();
        window.location.href = "index.html";
        return;
      }

      error.textContent = "Incorrect admin username or password.";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
