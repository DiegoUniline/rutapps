import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, registration) => {
    if (!registration) return;
    setInterval(() => {
      registration.update();
    }, 60_000);
  },
  onNeedRefresh: () => {
    updateSW(true);
  },
});

createRoot(document.getElementById("root")!).render(<App />);
