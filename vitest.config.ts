import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Component tests that render a whole list with its dialogs take 2–4 s
    // alone and pass 5 s when the full suite runs in parallel on a busy
    // machine — a big tree, not slow code. 15 s, as three files already set.
    testTimeout: 15_000,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // Edge functions live outside src/ (Deno, not the Vite app) but their
      // pure/no-op logic is still plain TS worth running for real — see
      // supabase/functions/send-email/index.test.ts (OPS-010).
      "supabase/functions/**/*.{test,spec}.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
