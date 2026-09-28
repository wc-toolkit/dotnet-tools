import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CemPackage } from "../shared/cem-types.js";
import { generateBlazorComponents } from "./generate.js";

const outputDirectories: string[] = [];

afterEach(() => {
  for (const directory of outputDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createOutputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dotnet-tools-test-"));
  outputDirectories.push(directory);
  return directory;
}

const manifest: CemPackage = {
  schemaVersion: "1.0.0",
  modules: [
    {
      path: "components.ts",
      declarations: [
        {
          kind: "class",
          name: "DatePicker",
          customElement: true,
          tagName: "acme-date-picker",
          description: "Select a date.",
          attributes: [
            { name: "disabled", type: { text: "boolean" } },
            { name: "size", type: { text: '"small" | "large"' } },
          ],
          events: [{ name: "date-changed", description: "Emitted when the date changes." }],
          slots: [{ name: "default" }],
        },
      ],
    },
  ],
};

describe("generateBlazorComponents", () => {
  it("generates markup, parameters, slots, and event interop", () => {
    const outputDir = createOutputDirectory();
    const generated = generateBlazorComponents(manifest, {
      outputDir,
      namespace: "Acme.Components",
    });
    const markup = readFileSync(join(outputDir, "AcmeDatePicker.razor"), "utf8");
    const codeBehind = readFileSync(join(outputDir, "AcmeDatePicker.razor.cs"), "utf8");

    expect(generated.map((file) => file.fileName)).toEqual([
      "AcmeDatePicker.razor",
      "AcmeDatePicker.razor.cs",
    ]);
    expect(markup).toContain('<acme-date-picker @ref="_elementRef"');
    expect(markup).toContain('disabled="@Disabled" size="@Size"');
    expect(markup).toContain("@ChildContent");
    expect(codeBehind).toContain("public bool Disabled { get; set; }");
    expect(codeBehind).toContain("public string? Size { get; set; } = default;");
    expect(codeBehind).toContain("public EventCallback<CustomEventArgs> OnDateChanged");
    expect(codeBehind).toContain("<summary>Emitted when the date changes.</summary>");
    expect(codeBehind).toContain('"customElementInterop.bindEvents"');
    expect(codeBehind).toContain("IAsyncDisposable");
  });

  it("does not add parameters that are absent from the manifest", () => {
    const outputDir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Spinner",
                customElement: true,
                tagName: "acme-spinner",
                attributes: [{ name: "dir", type: { text: "string" } }],
              },
            ],
          },
        ],
      },
      { outputDir, namespace: "Acme.Components" },
    );

    const codeBehind = readFileSync(join(outputDir, "AcmeSpinner.razor.cs"), "utf8");

    expect(codeBehind).toContain("public string? Dir { get; set; } = default;");
    expect(codeBehind).not.toContain("public string? Label");
  });
});
