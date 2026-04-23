import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// === Auto-bump de versión en cada build/dev ===
// Lee src/version.ts, incrementa el patch (1.0.0 → 1.0.1) y reescribe el archivo.
// Se ejecuta una sola vez al arrancar Vite (evita loops de HMR).
function bumpAppVersion(): string {
  const versionPath = path.resolve(__dirname, "src/version.ts");
  try {
    const content = fs.readFileSync(versionPath, "utf-8");
    const match = content.match(/APP_VERSION\s*=\s*['"](\d+)\.(\d+)\.(\d+)['"]/);
    if (!match) return "0.0.0";
    const [, maj, min, patch] = match;
    const next = `${maj}.${min}.${Number(patch) + 1}`;
    const buildDate = new Date().toISOString().slice(0, 16).replace("T", " ");
    const newContent =
      `// App version – auto-bumped on every build by vite.config.ts\n` +
      `export const APP_VERSION = '${next}';\n` +
      `export const APP_BUILD_DATE = '${buildDate}';\n`;
    if (newContent !== content) fs.writeFileSync(versionPath, newContent, "utf-8");
    return next;
  } catch {
    return "0.0.0";
  }
}

const APP_VERSION = bumpAppVersion();

export default defineConfig(({ mode }) => ({
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    '__APP_VERSION__': JSON.stringify(APP_VERSION),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Precache all built assets + index.html
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Serve cached app shell when offline
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/],
        runtimeCaching: [
          {
            // JS/CSS assets: cache first (they have hashes in filenames)
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Images: cache first
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Fonts
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Supabase API calls: network only (handled by offline queue)
            urlPattern: /supabase\.co/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: "Rutapp – Venta en Ruta",
        short_name: "Rutapp",
        description: "Sistema de venta en ruta para vendedores móviles",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/ruta",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
