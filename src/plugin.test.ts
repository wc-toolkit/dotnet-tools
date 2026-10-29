import { beforeEach, describe, expect, it, vi } from "vitest";

const { packDotNetTypes } = vi.hoisted(() => ({
  packDotNetTypes: vi.fn(),
}));

vi.mock("./index.js", () => ({ packDotNetTypes }));

import { dotnetTypesAnalyzerPlugin, dotnetTypesGeneratorPlugin } from "./plugin.js";
import type { PackDotNetResult } from "./index.js";
import type { CemPackage } from "./shared/cem-types.js";

const options = {
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
};

const manifest: CemPackage = {
  schemaVersion: "2.1.0",
  modules: [],
};

function createResult(packageId = options.packageId): PackDotNetResult {
  return {
    projectDir: `.cem-dotnet-publish/${packageId}`,
    nupkgPath: `.cem-dotnet-publish/${packageId}/out/${packageId}.nupkg`,
    tagHelperFileCount: 1,
    blazorFileCount: 2,
  };
}

beforeEach(() => {
  packDotNetTypes.mockReset();
  packDotNetTypes.mockResolvedValue(createResult());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("dotnetTypesGeneratorPlugin", () => {
  it("packs from the manifest passed to afterGenerate", async () => {
    const plugin = dotnetTypesGeneratorPlugin(options);

    plugin.afterGenerate(manifest);

    const results = await plugin.flush();

    expect(packDotNetTypes).toHaveBeenCalledWith({ ...options, manifest });
    expect(results).toEqual([createResult()]);
  });

  it("forwards pack: false to the generation workflow", async () => {
    const plugin = dotnetTypesGeneratorPlugin({ ...options, pack: false });

    plugin.afterGenerate(manifest);
    await plugin.flush();

    expect(packDotNetTypes).toHaveBeenCalledWith({ ...options, pack: false, manifest });
  });

  it("queues packages instead of generating them concurrently", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    packDotNetTypes
      .mockImplementationOnce(async () => {
        await firstRun;
        return createResult("First");
      })
      .mockResolvedValueOnce(createResult("Second"));

    const plugin = dotnetTypesGeneratorPlugin(options);
    plugin.afterGenerate(manifest);
    plugin.afterGenerate(manifest);

    await vi.waitFor(() => expect(packDotNetTypes).toHaveBeenCalledTimes(1));

    releaseFirst?.();
    await plugin.flush();

    expect(packDotNetTypes).toHaveBeenCalledTimes(2);
  });

  it("rejects flush when package generation fails", async () => {
    packDotNetTypes.mockRejectedValueOnce(new Error("dotnet failed"));

    const plugin = dotnetTypesGeneratorPlugin(options);
    plugin.afterGenerate(manifest);

    await expect(plugin.flush()).rejects.toThrow("dotnet failed");
  });
});

describe("dotnetTypesAnalyzerPlugin", () => {
  it("packs from the manifest passed to packageLinkPhase", async () => {
    const plugin = dotnetTypesAnalyzerPlugin(options);

    plugin.packageLinkPhase({ customElementsManifest: manifest });

    await expect(plugin.flush()).resolves.toEqual([createResult()]);
    expect(packDotNetTypes).toHaveBeenCalledWith({ ...options, manifest });
  });
});
