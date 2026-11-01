import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { stashOAuthReturnError } from "./lib/oauthReturn";

// Before React renders: a failed Google sign-in returns to /app with the reason
// in the URL, and ProtectedRoute's redirect to /auth would otherwise drop it.
stashOAuthReturnError();

createRoot(document.getElementById("root")!).render(<App />);

// Register the PWA service worker in production builds only (keeps dev HMR clean).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
