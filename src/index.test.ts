import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateTagHelpers, generateBlazorComponents, scaffoldCombinedProject, packNuGetPackage } =
  vi.hoisted(() => ({
    generateTagHelpers: vi.fn(),
    generateBlazorComponents: vi.fn(),
    scaffoldCombinedProject: vi.fn(),
    packNuGetPackage: vi.fn(),
  }));

vi.mock("./tag-helpers/generate.js", () => ({ generateTagHelpers }));
vi.mock("./blazor/generate.js", () => ({ generateBlazorComponents }));
vi.mock("./dotnet/scaffold.js", () => ({ scaffoldCombinedProject }));
vi.mock("./dotnet/pack.js", () => ({ packNuGetPackage }));

import { packDotNetTypes } from "./index.js";
import type { PackDotNetOptions } from "./index.js";
import type { CemPackage } from "./shared/cem-types.js";

const manifest: CemPackage = {
  schemaVersion: "1.0.0",
  modules: [],
};

const outputDirectories: string[] = [];

function createOutputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dotnet-tools-index-test-"));
  outputDirectories.push(directory);
  return directory;
}

function createOptions(overrides: Partial<PackDotNetOptions> = {}): PackDotNetOptions {
  return {
    manifest,
    packageId: "Acme.Components",
    namespace: "Acme.Components",
    version: "1.0.0",
    outdir: createOutputDirectory(),
    ...overrides,
  };
}

beforeEach(() => {
  generateTagHelpers.mockReset().mockReturnValue([{ fileName: "A.cs", filePath: "/tmp/A.cs" }]);
  generateBlazorComponents.mockReset().mockReturnValue([
    { fileName: "A.razor", filePath: "/tmp/A.razor" },
    { fileName: "A.razor.cs", filePath: "/tmp/A.razor.cs" },
  ]);
  scaffoldCombinedProject.mockReset();
  packNuGetPackage.mockReset().mockReturnValue({ nupkgPath: "/tmp/Acme.Components.nupkg" });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of outputDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("packDotNetTypes", () => {
  it("skips generation and packing when skip is true", async () => {
    await expect(packDotNetTypes(createOptions({ skip: true }))).resolves.toBeUndefined();

    expect(scaffoldCombinedProject).not.toHaveBeenCalled();
    expect(packNuGetPackage).not.toHaveBeenCalled();
  });

  it("generates Tag Helpers and Blazor components by default", async () => {
    const result = await packDotNetTypes(createOptions());

    expect(generateTagHelpers).toHaveBeenCalledOnce();
    expect(generateBlazorComponents).toHaveBeenCalledOnce();
    expect(packNuGetPackage).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ tagHelperFileCount: 1, blazorFileCount: 2 });
  });

  it("can generate the project without creating a NuGet package", async () => {
    const result = await packDotNetTypes(createOptions({ pack: false }));

    expect(packNuGetPackage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      projectDir: expect.any(String),
      tagHelperFileCount: 1,
      blazorFileCount: 2,
    });
    expect(result).not.toHaveProperty("nupkgPath");
  });

  it("can generate only Tag Helpers", async () => {
    const result = await packDotNetTypes(createOptions({ blazor: false }));

    expect(generateTagHelpers).toHaveBeenCalledOnce();
    expect(generateBlazorComponents).not.toHaveBeenCalled();
    expect(result).toMatchObject({ tagHelperFileCount: 1, blazorFileCount: 0 });
  });

  it("can generate only Blazor components", async () => {
    const result = await packDotNetTypes(createOptions({ tagHelpers: false }));

    expect(generateTagHelpers).not.toHaveBeenCalled();
    expect(generateBlazorComponents).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ tagHelperFileCount: 0, blazorFileCount: 2 });
  });

  it("copies configured static assets into the package wwwroot", async () => {
    const sourceDirectory = mkdtempSync(join(tmpdir(), "dotnet-tools-assets-test-"));
    outputDirectories.push(sourceDirectory);
    mkdirSync(join(sourceDirectory, "nested"));
    writeFileSync(join(sourceDirectory, "nested", "elements.js"), "customElements.define(...);");

    const result = await packDotNetTypes(
      createOptions({
        staticAssets: [{ source: sourceDirectory, destination: "vendor/elements" }],
      }),
    );

    expect(
      readFileSync(
        join(result!.projectDir, "wwwroot", "vendor", "elements", "nested", "elements.js"),
        "utf8",
      ),
    ).toBe("customElements.define(...);");
  });

  it("rejects static asset destinations outside wwwroot", async () => {
    await expect(
      packDotNetTypes(
        createOptions({
          staticAssets: [{ source: "/tmp/elements.js", destination: "../elements.js" }],
        }),
      ),
    ).rejects.toThrow("Static asset destination must stay inside wwwroot");
  });

  it("rejects when both output kinds are disabled", async () => {
    await expect(
      packDotNetTypes(createOptions({ tagHelpers: false, blazor: false })),
    ).rejects.toThrow("At least one of `tagHelpers` or `blazor` must be enabled.");

    expect(scaffoldCombinedProject).not.toHaveBeenCalled();
    expect(packNuGetPackage).not.toHaveBeenCalled();
  });
});
