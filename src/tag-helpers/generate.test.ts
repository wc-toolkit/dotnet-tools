import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CemPackage } from "../shared/cem-types.js";
import { generateTagHelpers } from "./generate.js";

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
          description: "Select a date <today> & tomorrow.",
          attributes: [
            { name: "disabled", type: { text: "boolean" } },
            { name: "size", type: { text: '"small" | "large"' }, description: "Picker size" },
            { name: "spellcheck", type: { text: "boolean" }, default: "true" },
            { name: "rotate", type: { text: "number" } },
            { name: "labels", type: { text: "string[]" } },
          ],
        },
        { kind: "class", name: "Internal", customElement: false, tagName: "internal-element" },
      ],
    },
  ],
};

describe("generateTagHelpers", () => {
  it("generates a typed helper and enum for custom elements", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, { outputDir, namespace: "Acme.Components" });
    const source = readFileSync(generated[0].filePath, "utf8");

    expect(generated.map((file) => file.fileName)).toEqual(["AcmeDatePickerTagHelper.cs"]);
    expect(source).toContain('[HtmlTargetElement("acme-date-picker")]');
    expect(source).toContain("public bool Disabled { get; set; }");
    expect(source).toContain("public enum SizeValue");
    expect(source).toContain('SizeValue.Small => "small"');
    expect(source).toContain("Select a date &lt;today&gt; &amp; tomorrow.");
    expect(source).not.toContain("InternalTagHelper");
  });

  it("keeps unions as strings when enum generation is disabled", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, {
      outputDir,
      namespace: "Acme.Components",
      emitEnumsForUnions: false,
    });
    const source = readFileSync(generated[0].filePath, "utf8");

    expect(source).toContain("public string? Size { get; set; }");
    expect(source).not.toContain("enum SizeValue");
  });

  it("makes a boolean that defaults to true tri-state so false can be written", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, { outputDir, namespace: "Acme.Components" });
    const source = readFileSync(generated[0].filePath, "utf8");

    expect(source).toContain("public bool? Spellcheck { get; set; }");
    expect(source).toContain(
      'output.Attributes.SetAttribute("spellcheck", Spellcheck.Value ? "" : "false");',
    );
    // A boolean that defaults to off is still plain presence-based.
    expect(source).toContain("public bool Disabled { get; set; }");
    expect(source).toContain('output.Attributes.SetAttribute("disabled", "");');
  });

  it("honours a configured boolean off value", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, {
      outputDir,
      namespace: "Acme.Components",
      booleanOffValue: "off",
    });
    const source = readFileSync(generated[0].filePath, "utf8");

    expect(source).toContain(
      'output.Attributes.SetAttribute("spellcheck", Spellcheck.Value ? "" : "off");',
    );
  });

  it("formats numeric attribute values with the invariant culture", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, { outputDir, namespace: "Acme.Components" });
    const source = readFileSync(generated[0].filePath, "utf8");

    // Without this, a comma-decimal locale renders rotate="2,5", which the element cannot parse.
    expect(source).toContain("using System.Globalization;");
    expect(source).toContain(
      'output.Attributes.SetAttribute("rotate", Rotate.Value.ToString(CultureInfo.InvariantCulture));',
    );
  });

  it("serializes collection attributes as JSON rather than the CLR type name", () => {
    const outputDir = createOutputDirectory();
    const generated = generateTagHelpers(manifest, { outputDir, namespace: "Acme.Components" });
    const source = readFileSync(generated[0].filePath, "utf8");

    // List<T>.ToString() yields "IReadOnlyList`1[System.String]", which is not a usable value.
    expect(source).toContain("public IReadOnlyList<string?>? Labels { get; set; }");
    expect(source).toContain(
      'output.Attributes.SetAttribute("labels", JsonSerializer.Serialize(Labels));',
    );
    expect(source).not.toContain("Labels.ToString()");
  });
});
