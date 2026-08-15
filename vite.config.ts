import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Stage 5.7: a build stamp the support page can show. "Which version are you
  // on?" is the first question of most support threads, and without this the
  // honest answer is "no idea".
  define: {
    __BUILD_STAMP__: JSON.stringify(
      mode === "development" ? "dev" : new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    ),
  },
  server: {
    host: "::",
    // 8080 by default; PORT lets a second dev server (another agent session,
    // a parallel branch) run without editing this file.
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Stage 4.1 / BUG-046 — split the heavy vendors out of the entry chunk.
         *
         * Route-level `lazy()` alone is not enough: a library imported by two
         * lazily-loaded pages gets hoisted into the shared parent, which is the
         * entry chunk. recharts is imported by 9 files and framer-motion by 24,
         * so both were landing back in main however the routes were split.
         *
         * Naming them here gives each its own long-lived chunk that is fetched
         * only when a page that needs it loads, and — because the filename hash
         * only changes when that library changes — stays cached across our own
         * deploys.
         *
         * `xlsx` and `pdfjs-dist` are each used by exactly ONE page (Import and
         * Bill Scan), so route splitting already isolates them; they are listed
         * anyway so the intent is explicit and a second importer cannot quietly
         * drag them back into main.
         */
        /**
         * ONLY name the vendors the entry itself genuinely needs.
         *
         * The instinct is to also name the heavy on-demand libraries
         * (recharts, xlsx, pdfjs) — that was tried and it backfired. A manual
         * chunk is a *destination*, and Rollup parks widely-shared unassigned
         * modules in one: `lucide-react`, `clsx`, `src/lib/utils.ts` and
         * `ThemeContext` all landed inside `charts`. Since the entry needs
         * those, the entry then statically imported the charts chunk, and
         * index.html preloaded 113 kB gz of recharts on a landing page that
         * renders no charts. Naming more chunks just moved the fold around.
         *
         * Route-level `lazy()` already isolates recharts, xlsx and pdfjs —
         * every one of their importers is a lazy page (verified by walking the
         * import graph). Leaving them unassigned lets Rollup put them in
         * chunks reachable only from those routes, which is exactly right.
         *
         * So: name only what the entry needs anyway, and let Rollup do the rest.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("lucide-react") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority")
          ) {
            return "ui-vendor";
          }
          // Needed to render anything at all, so a single stable chunk rather
          // than a copy per route.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "query";
        },
      },
    },
  },
}));
