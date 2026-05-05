import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs before any dynamic imports
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  getAgentDir: () => "/tmp/pi-agent",
}));

import { existsSync, readFileSync } from "node:fs";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConfigPath", () => {
    it("returns path inside agent dir", async () => {
      const { getConfigPath } = await import("../config.js");
      expect(getConfigPath()).toBe(join("/tmp/pi-agent", "settings", "pi-vertex.json"));
    });
  });

  describe("loadConfig", () => {
    it("returns empty object when config file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadConfig } = await import("../config.js");
      const config = loadConfig();
      expect(config).toEqual({});
      expect(existsSync).toHaveBeenCalled();
    });

    it("returns parsed config when file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          googleCloudProject: "my-project",
          googleCloudLocation: "us-east1",
        }),
      );

      const { loadConfig } = await import("../config.js");
      const config = loadConfig();
      expect(config).toEqual({
        googleCloudProject: "my-project",
        googleCloudLocation: "us-east1",
      });
    });

    it("returns empty object and warns on invalid JSON", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("not json");

      const { loadConfig } = await import("../config.js");
      const config = loadConfig();
      expect(config).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });
  });
});
