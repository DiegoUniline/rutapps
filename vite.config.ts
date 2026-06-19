import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// === Auto-bump de versión en cada build/dev ===
// Lee src/version.ts, incrementa el patch diario (YYYY.MM.DD.N) y reescribe el archivo.
// Se ejecuta una sola vez al arrancar Vite (evita loops de HMR).
function bumpAppVersion(): string {
  const versionPath = path.resolve(__dirname, "src/version.ts");
  try {
    const content = fs.readFileSync(versionPath, "utf-8");
    const today = new Date().toISOString().slice(0, 10);
    const todayVersionPrefix = today.replace(/-/g, ".");
    const match = content.match(/APP_VERSION\s*=\s*['"](\d{4})\.(\d{2})\.(\d{2})\.(\d+)['"]/);
    const currentPrefix = match ? `${match[1]}.${match[2]}.${match[3]}` : "";
    const nextPatch = currentPrefix === todayVersionPrefix ? Number(match?.[4] ?? 0) + 1 : 1;
    const next = `${todayVersionPrefix}.${nextPatch}`;
    const buildDate = today;
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
      // El SW se registra manualmente desde src/pwa/registerSW.ts SOLO dentro
      // de la app autenticada. La landing pública (/, /partners, etc.) nunca
      // instala SW para que las publicaciones nuevas se vean al instante.
      injectRegister: null,
      devOptions: { enabled: false },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        // Excluir páginas públicas para que NUNCA pasen por el SW.
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/api/,
          /^\/$/,
          /^\/partners/,
          /^\/login/,
          /^\/signup/,
          /^\/reset-password/,
          /^\/terminos/,
          /^\/privacidad/,
          /^\/catalogo\//,
          /^\/pagar\//,
          /^\/cliente\//,
          /^\/unsubscribe/,
          /^\/tutoriales/,
          /^\/soporte/,
        ],
        // La nueva versión queda esperando hasta que el usuario toque Actualizar.
        // Esto evita recargas/bloqueos mientras capturan ventas, cobros o formularios.
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // HTML: SIEMPRE red primero, así una publicación nueva se ve al instante
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // JS/CSS: NetworkFirst para que al publicar una versión nueva los
            // chunks frescos se descarguen de inmediato (los nombres ya llevan
            // hash, así que el cache local sigue siendo útil como fallback).
            urlPattern: /\.(?:js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'static-assets',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Imágenes/archivos en Supabase Storage (productos, ruta-fotos, avatars).
            // CacheFirst evita re-descargar en cada navegación → gran ahorro de egress.
            // Debe ir ANTES del catch-all de supabase.co (NetworkOnly).
            urlPattern: ({ url }) =>
              url.hostname.endsWith('supabase.co') &&
              url.pathname.startsWith('/storage/v1/object/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
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
