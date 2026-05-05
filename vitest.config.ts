import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["**/*.ts"],
      exclude: ["node_modules", "**/*.d.ts", "vitest.config.ts"],
    },
  },
});
