import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
  applyActionCode,
  confirmPasswordReset,
  initializeAuth,
  inMemoryPersistence,
  verifyPasswordResetCode,
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD3dgMCvqUtd70zLSpy_0zvL46RsSMKbk4",
  authDomain: "brushforge-82a81.firebaseapp.com",
  projectId: "brushforge-82a81",
  storageBucket: "brushforge-82a81.firebasestorage.app",
  messagingSenderId: "138727125754",
  appId: "1:138727125754:web:22961126a373a9c8930f43",
  measurementId: "G-Y9S5DMZQ38",
};

// Email-link actions do not need redirect/popup state. Keeping auth in memory
// avoids persistent browser storage and loading the popup resolver runtime.
const auth = initializeAuth(initializeApp(firebaseConfig), {
  persistence: inMemoryPersistence,
});
const states = Object.fromEntries(
  ["loading", "success", "error", "reset"].map((name) => [
    name,
    document.getElementById(`state-${name}`),
  ]),
);

/**
 * Firebase action links can carry a continueUrl. Only this website is a valid
 * destination here; custom schemes and third-party hosts deliberately fall back
 * to the homepage. Native deep-link routing is not advertised until both apps
 * have verified production routing.
 */
function safeContinueUrl(value) {
  if (!value) return "/";

  try {
    const candidate = new URL(value, window.location.origin);
    const allowedOrigins = new Set([
      window.location.origin,
      "https://brushforgeapp.com",
    ]);

    if (candidate.protocol !== "https:" || !allowedOrigins.has(candidate.origin)) {
      return "/";
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return "/";
  }
}

function showState(stateName) {
  Object.values(states).forEach((element) => {
    if (element) element.classList.remove("active");
  });

  const state = states[stateName];
  if (!state) return;

  state.classList.add("active");
  document.querySelector(".card")?.setAttribute("aria-busy", stateName === "loading" ? "true" : "false");
  const heading = state.querySelector("h1");
  heading?.focus();
}

function showError(title, message) {
  document.getElementById("error-title").textContent = title;
  document.getElementById("error-text").textContent = message;
  showState("error");
}

async function handleAction() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");
  const destination = safeContinueUrl(params.get("continueUrl"));

  if (!mode || !oobCode) {
    showError("Invalid link", "The link is missing information required to complete this request.");
    return;
  }

  if (mode === "verifyEmail") {
    try {
      await applyActionCode(auth, oobCode);
      document.getElementById("btn-success").addEventListener("click", () => {
        window.location.assign(destination);
      }, { once: true });
      showState("success");
    } catch (error) {
      console.error("Email verification error", error);
      showError("Invalid or expired link", "This verification link is invalid or has expired.");
    }
    return;
  }

  if (mode !== "resetPassword") {
    showError("Unsupported request", "This account action is not supported on the website.");
    return;
  }

  try {
    const email = await verifyPasswordResetCode(auth, oobCode);
    document.getElementById("reset-email-hint").textContent = `Resetting the password for ${email}`;
    showState("reset");

    document.getElementById("reset-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("new-password").value;
      const confirmation = document.getElementById("confirm-password").value;
      const submitButton = document.getElementById("btn-reset-password");
      const resetError = document.getElementById("reset-error");

      resetError.textContent = "";
      if (password !== confirmation) {
        resetError.textContent = "The passwords do not match.";
        document.getElementById("confirm-password").focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Saving…";

      try {
        await confirmPasswordReset(auth, oobCode, password);
        document.getElementById("success-title").textContent = "Password reset";
        document.getElementById("success-text").textContent = "Your password has been updated securely.";
        const successButton = document.getElementById("btn-success");
        successButton.textContent = "Continue to BrushForge";
        successButton.addEventListener("click", () => {
          window.location.assign(destination);
        }, { once: true });
        showState("success");
      } catch (error) {
        console.error("Password reset error", error);
        resetError.textContent = "The password could not be reset. The link may have expired; request a new one in the app.";
        submitButton.disabled = false;
        submitButton.textContent = "Save password";
      }
    }, { once: true });
  } catch (error) {
    console.error("Reset-code verification error", error);
    showError("Invalid or expired link", "This password reset link is invalid or has expired.");
  }
}

document.getElementById("btn-home")?.addEventListener("click", () => {
  window.location.assign("/");
});

handleAction().catch((error) => {
  console.error("Unexpected account-action error", error);
  showError("Unexpected error", "Something went wrong. Please request a new link or contact support.");
});
