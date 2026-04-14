import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: never register SW in iframe or preview hosts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else if ("serviceWorker" in navigator) {
  const updatePublishedServiceWorkers = () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => {
        reg.update().catch(() => {});
      });
    });
  };

  const schedulePublishedUpdateCheck = () => {
    updatePublishedServiceWorkers();
    window.setTimeout(() => {
      updatePublishedServiceWorkers();
    }, 1200);
  };

  // Force update check on every app open/resume for published PWA
  schedulePublishedUpdateCheck();
  window.addEventListener("focus", schedulePublishedUpdateCheck);
  window.addEventListener("pageshow", schedulePublishedUpdateCheck);
  window.addEventListener("online", schedulePublishedUpdateCheck);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      schedulePublishedUpdateCheck();
    }
  });

  // Listen for new SW activation and reload to get latest version
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
