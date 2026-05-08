(function () {
  const AUTH_KEY = "noufar-admin-auth-v1";
  const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function persistSession(payload) {
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        authenticated: true,
        token: payload.token,
        user: {
          _id: payload._id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
          specialty: payload.specialty,
          hospital: payload.hospital,
          approvalStatus: payload.approvalStatus
        },
        loggedAt: new Date().toISOString()
      })
    );
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data;
  }

  function init() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("logout") === "1") {
      localStorage.removeItem(AUTH_KEY);
      window.history.replaceState({}, document.title, "login.html");
    }

    if (getSession()?.authenticated) {
      window.location.href = "index.html";
      return;
    }

    const loginForm = document.getElementById("admin-login-form");
    const registerForm = document.getElementById("admin-register-form");
    const loginTab = document.getElementById("admin-login-tab");
    const registerTab = document.getElementById("admin-register-tab");
    const username = document.getElementById("admin-username");
    const password = document.getElementById("admin-password");
    const loginError = document.getElementById("admin-login-error");
    const registerError = document.getElementById("admin-register-error");
    const registerName = document.getElementById("admin-register-name");
    const registerEmail = document.getElementById("admin-register-email");
    const registerPassword = document.getElementById("admin-register-password");
    const registerKey = document.getElementById("admin-register-key");

    if (
      !loginForm ||
      !registerForm ||
      !loginTab ||
      !registerTab ||
      !username ||
      !password ||
      !loginError ||
      !registerError ||
      !registerName ||
      !registerEmail ||
      !registerPassword ||
      !registerKey
    ) {
      return;
    }

    const showPanel = (mode) => {
      const isLogin = mode === "login";
      loginForm.hidden = !isLogin;
      registerForm.hidden = isLogin;
      loginTab.classList.toggle("is-active", isLogin);
      registerTab.classList.toggle("is-active", !isLogin);
      loginTab.setAttribute("aria-selected", String(isLogin));
      registerTab.setAttribute("aria-selected", String(!isLogin));
      loginError.textContent = "";
      registerError.textContent = "";
    };

    loginTab.addEventListener("click", () => showPanel("login"));
    registerTab.addEventListener("click", () => showPanel("register"));

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginError.textContent = "";

      const emailValue = username.value.trim();
      const passwordValue = password.value.trim();

      if (!emailValue || !passwordValue) {
        loginError.textContent = "Enter your admin email and password.";
        return;
      }

      try {
        const payload = await requestJson("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: emailValue,
            password: passwordValue
          })
        });

        if (payload.role !== "admin") {
          loginError.textContent = "This account does not have admin access.";
          return;
        }

        persistSession(payload);
        window.location.href = "index.html";
      } catch (requestError) {
        loginError.textContent = requestError.message || "Incorrect admin email or password.";
      }
    });

    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      registerError.textContent = "";

      const payload = {
        name: registerName.value.trim(),
        email: registerEmail.value.trim(),
        password: registerPassword.value.trim(),
        role: "admin",
        adminKey: registerKey.value.trim()
      };

      if (!payload.name || !payload.email || !payload.password || !payload.adminKey) {
        registerError.textContent = "Complete all fields to create an admin account.";
        return;
      }

      try {
        const response = await requestJson("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        if (response.role !== "admin") {
          registerError.textContent = "The created account is not an admin account.";
          return;
        }

        persistSession(response);
        window.location.href = "index.html";
      } catch (requestError) {
        registerError.textContent = requestError.message || "Unable to create the admin account.";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
