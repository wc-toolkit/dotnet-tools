import { describe, expect, it, vi } from "vitest";

const { execSync } = vi.hoisted(() => ({ execSync: vi.fn() }));

vi.mock("node:child_process", () => ({ execSync }));

import { packNuGetPackage } from "./pack.js";

describe("packNuGetPackage", () => {
  it("restores, builds, and packs without publishing", () => {
    const result = packNuGetPackage({
      projectDir: "/tmp/Acme.Components",
      packageId: "Acme.Components",
      version: "1.0.0",
    });

    expect(result).toEqual({
      nupkgPath: "/tmp/Acme.Components/out/Acme.Components.1.0.0.nupkg",
    });
    expect(execSync.mock.calls.map(([command]) => command)).toEqual([
      'dotnet restore "/tmp/Acme.Components"',
      'dotnet build "/tmp/Acme.Components" -c Release',
      'dotnet pack "/tmp/Acme.Components" -c Release -o "/tmp/Acme.Components/out" --no-build',
    ]);
  });
});
