import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// === Auto-bump de versión en cada build/dev ===
// Contador secuencial de 6 dígitos (000001, 000002, ...). Se incrementa en 1
// cada vez que arranca un build/dev (evita loops de HMR: corre una sola vez).
function bumpAppVersion(): string {
  const versionPath = path.resolve(__dirname, "src/version.ts");
  try {
    const content = fs.readFileSync(versionPath, "utf-8");
    // Fecha + hora del build en horario de México (formato ISO-like "YYYY-MM-DD HH:mm").
    // Es FRESCO en cada build y va horneado en el bundle, así que la versión visible
    // cambia en cada deploy aunque el contador no se commitee de vuelta.
    const today = new Date().toLocaleString("sv-SE", { timeZone: "America/Mexico_City" }).slice(0, 16);
    const match = content.match(/APP_VERSION\s*=\s*['"](\d+)['"]/);
    const current = match ? Number(match[1]) : 0;
    const next = String(current + 1).padStart(6, "0");
    const newContent =
      `// App version – auto-bumped on every build by vite.config.ts\n` +
      `export const APP_VERSION = '${next}';\n` +
      `export const APP_BUILD_DATE = '${today}';\n`;
    if (newContent !== content) fs.writeFileSync(versionPath, newContent, "utf-8");
    return next;
  } catch {
    return "000000";
  }
}

const APP_VERSION = bumpAppVersion();

export default defineConfig(({ mode }) => ({
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    '__APP_VERSION__': JSON.stringify(APP_VERSION),
  },
  // En producción elimina console.log/debug/info y `debugger` (ruido que
  // gasta CPU en móviles). Conserva console.error/warn para soporte. En
  // builds de desarrollo (build:dev) no se toca nada.
  esbuild: mode === "production"
    ? { pure: ["console.log", "console.debug", "console.info"], drop: ["debugger"] }
    : {},
  build: {
    rollupOptions: {
      output: {
        // Separa librerías estables (vendor) en chunks propios y cacheables.
        // No cambia el código que corre: solo agrupa el empaquetado para que
        // el navegador no re-descargue React/Supabase/etc. en cada deploy.
        // Las libs pesadas que ya cargan bajo demanda (xlsx, jspdf, maps,
        // recharts) NO se agrupan aquí para conservar su carga diferida.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react-dom/') || id.includes('/react/') ||
              id.includes('/react-router') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('/@radix-ui/')) return 'radix-vendor';
          if (id.includes('/@supabase/')) return 'supabase-vendor';
          if (id.includes('/@tanstack/')) return 'query-vendor';
          if (id.includes('/date-fns/')) return 'date-fns-vendor';
          if (id.includes('/lucide-react/')) return 'icons-vendor';
        },
      },
    },
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
            // JS/CSS: CacheFirst. Los nombres llevan hash inmutable, así que el
            // mismo nombre = mismo contenido. Una versión nueva genera nombres
            // nuevos que el HTML (NetworkFirst) referencia y se bajan frescos.
            // Esto evita re-descargar 2-5 MB de bundle en cada apertura.
            urlPattern: /\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
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
