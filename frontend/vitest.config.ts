/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // CSS modules are auto-stubbed by Vitest in jsdom mode, but
    // we explicitly enable the built-in CSS handling so imports
    // like `import styles from "./Foo.module.css"` resolve to an
    // empty-ish object rather than throwing.
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
    // Coverage configuration (opt-in via `vitest run --coverage`)
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/__tests__/**", "src/vite-env.d.ts"],
    },
  },
});
