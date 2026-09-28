import { describe, expect, it } from "vitest";
import { getCustomElementDeclarations } from "./cem-types.js";
import { toCamelCase, toPascalCase } from "./naming.js";
import { mapCemType } from "./type-mapping.js";

describe("type mapping", () => {
  it("maps primitive CEM types", () => {
    expect(mapCemType("boolean")).toEqual({ csType: "bool", isBool: true, isUnion: false });
    expect(mapCemType(" number ")).toEqual({
      csType: "double?",
      isBool: false,
      isUnion: false,
    });
    expect(mapCemType("string")).toEqual({ csType: "string?", isBool: false, isUnion: false });
  });

  it("extracts string literal unions and rejects numeric unions", () => {
    expect(mapCemType(`"small" | 'large'`)).toEqual({
      csType: "string?",
      isBool: false,
      isUnion: true,
      unionValues: ["small", "large"],
    });
    expect(mapCemType("1 | 2")).toEqual({ csType: "string?", isBool: false, isUnion: false });
  });

  it("falls back to nullable strings for missing and unknown types", () => {
    expect(mapCemType()).toEqual({ csType: "string?", isBool: false, isUnion: false });
    expect(mapCemType("Date")).toEqual({ csType: "string?", isBool: false, isUnion: false });
  });
});

describe("naming", () => {
  it("converts kebab-case names while ignoring empty segments", () => {
    expect(toPascalCase("acme--date-picker")).toBe("AcmeDatePicker");
    expect(toCamelCase("acme--date-picker")).toBe("acmeDatePicker");
    expect(toCamelCase("---")).toBe("---");
  });
});

describe("custom element declarations", () => {
  it("keeps only tagged custom elements", () => {
    const manifest = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            { kind: "class", name: "DatePicker", customElement: true, tagName: "acme-date-picker" },
            {
              kind: "class",
              name: "NotAnElement",
              customElement: false,
              tagName: "not-an-element",
            },
            { kind: "class", name: "MissingTag", customElement: true },
          ],
        },
      ],
    };

    expect(getCustomElementDeclarations(manifest)).toHaveLength(1);
    expect(getCustomElementDeclarations(manifest)[0].tagName).toBe("acme-date-picker");
  });

  it("normalizes summaries and member-backed attributes from a CEM", () => {
    const manifest = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            {
              kind: "class",
              name: "Button",
              customElement: true,
              tagName: "acme-button",
              summary: "A documented button.",
              members: [
                {
                  kind: "field",
                  name: "disabled",
                  attribute: "disabled",
                  type: { text: "boolean" },
                  description: "Disables the button.",
                },
              ],
            },
          ],
        },
      ],
    };
    const [declaration] = getCustomElementDeclarations(manifest);

    expect(declaration.description).toBe("A documented button.");
    expect(declaration.attributes).toEqual([
      {
        name: "disabled",
        type: { text: "boolean" },
        description: "Disables the button.",
      },
    ]);
  });
});
