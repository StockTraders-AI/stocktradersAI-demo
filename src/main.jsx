import { StrictMode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import { GLOBAL_CSS } from "./styles/tokens";

// Inject global CSS once (fonts, reset, scrollbar, keyframes)
if (!document.getElementById("st-global")) {
  const s = document.createElement("style");
  s.id = "st-global";
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>
);
