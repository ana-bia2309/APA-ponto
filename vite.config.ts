import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
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
      registerType: "autoUpdate",
      includeAssets: ["logo.jpg", "favicon.jpg"],
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}"],
        // Force new SW to take over immediately
        skipWaiting: true,
        clientsClaim: true,
        // Clean old caches on update
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase.*\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 30, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
        navigateFallbackDenylist: [/^\/~oauth/],
      },
      manifest: {
        name: "APA Ponto - Refrigeração e Climatização",
        short_name: "APA Ponto",
        description: "APA Ponto - Sistema de registro de ponto",
        theme_color: "#1e3a5f",
        background_color: "#f5f6f8",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
