import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Mock config module — provide a factory with no external references
vi.mock("../config.js", () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(() => "/tmp/pi-agent/settings/pi-vertex.json"),
}));

import { existsSync } from "node:fs";
import {
  buildBaseUrl,
  getAuthConfig,
  hasAdcCredentials,
  resolveLocation,
  resolveProjectId,
} from "../auth.js";
import { loadConfig } from "../config.js";

describe("auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
    vi.mocked(loadConfig).mockReturnValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("resolveProjectId", () => {
    it("prefers config over env var", () => {
      vi.mocked(loadConfig).mockReturnValue({ googleCloudProject: "config-project" });
      process.env.GOOGLE_CLOUD_PROJECT = "env-project";

      expect(resolveProjectId()).toBe("config-project");
    });

    it("falls back to GOOGLE_CLOUD_PROJECT env var", () => {
      process.env.GOOGLE_CLOUD_PROJECT = "env-project";
      expect(resolveProjectId()).toBe("env-project");
    });

    it("falls back to GCLOUD_PROJECT env var", () => {
      process.env.GCLOUD_PROJECT = "gcloud-project";
      expect(resolveProjectId()).toBe("gcloud-project");
    });

    it("returns undefined when nothing is set", () => {
      process.env.GOOGLE_CLOUD_PROJECT = undefined;
      process.env.GCLOUD_PROJECT = undefined;
      expect(resolveProjectId()).toBeUndefined();
    });
  });

  describe("resolveLocation", () => {
    it("prefers config over env var", () => {
      vi.mocked(loadConfig).mockReturnValue({ googleCloudLocation: "europe-west1" });
      process.env.GOOGLE_CLOUD_LOCATION = "us-west1";

      expect(resolveLocation()).toBe("europe-west1");
    });

    it("falls back to GOOGLE_CLOUD_LOCATION env var", () => {
      process.env.GOOGLE_CLOUD_LOCATION = "us-west1";
      expect(resolveLocation()).toBe("us-west1");
    });

    it("falls back to CLOUD_ML_REGION env var", () => {
      process.env.CLOUD_ML_REGION = "us";
      expect(resolveLocation()).toBe("us");
    });

    it("uses default when nothing is set", () => {
      process.env.GOOGLE_CLOUD_LOCATION = undefined;
      process.env.CLOUD_ML_REGION = undefined;
      expect(resolveLocation()).toBe("us-central1");
    });

    it("uses explicit default parameter", () => {
      process.env.GOOGLE_CLOUD_LOCATION = undefined;
      process.env.CLOUD_ML_REGION = undefined;
      expect(resolveLocation("europe-west4")).toBe("europe-west4");
    });
  });

  describe("hasAdcCredentials", () => {
    it("returns true when credentials file exists (config)", () => {
      vi.mocked(loadConfig).mockReturnValue({
        googleApplicationCredentials: "/path/to/key.json",
      });
      vi.mocked(existsSync).mockImplementation((p: any) => p === "/path/to/key.json");

      expect(hasAdcCredentials()).toBe(true);
    });

    it("returns true when credentials file exists (env)", () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = "/env/key.json";
      vi.mocked(existsSync).mockImplementation((p: any) => p === "/env/key.json");

      expect(hasAdcCredentials()).toBe(true);
    });

    it("returns false when no credentials are found", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(hasAdcCredentials()).toBe(false);
    });
  });

  describe("getAuthConfig", () => {
    it("returns projectId and location when configured", () => {
      vi.mocked(loadConfig).mockReturnValue({ googleCloudProject: "my-project" });
      vi.mocked(existsSync).mockReturnValue(true);

      const config = getAuthConfig("asia-east1");
      expect(config.projectId).toBe("my-project");
      expect(config.location).toBe("asia-east1");
    });

    it("throws when project ID is missing", () => {
      vi.mocked(loadConfig).mockReturnValue({});
      process.env.GOOGLE_CLOUD_PROJECT = undefined;
      process.env.GCLOUD_PROJECT = undefined;

      expect(() => getAuthConfig()).toThrow("Vertex AI requires a project ID");
    });

    it("throws when ADC credentials are missing", () => {
      vi.mocked(loadConfig).mockReturnValue({ googleCloudProject: "my-project" });
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => getAuthConfig()).toThrow("Vertex AI requires Application Default Credentials");
    });
  });

  describe("buildBaseUrl", () => {
    it("builds global endpoint URL", () => {
      expect(buildBaseUrl("my-project", "global")).toBe(
        "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global",
      );
    });

    it("builds regional endpoint URL", () => {
      expect(buildBaseUrl("my-project", "us-east5")).toBe(
        "https://us-east5-aiplatform.googleapis.com/v1/projects/my-project/locations/us-east5",
      );
    });
  });
});
