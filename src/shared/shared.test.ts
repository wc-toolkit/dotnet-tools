import { describe, expect, it } from "vitest";
import {
  getCemTypeText,
  getCustomElementDeclarations,
  isExposedMember,
  isFormAssociated,
} from "./cem-types.js";
import { toCamelCase, toPascalCase } from "./naming.js";
import { csharpDefaultLiteral, mapCemType, booleanAttributeMode } from "./type-mapping.js";

describe("type mapping", () => {
  it("shares C# default literal rendering", () => {
    expect(csharpDefaultLiteral("true", "bool", true)).toBe(" = true;");
    expect(csharpDefaultLiteral("Infinity", "double?")).toBe(" = double.PositiveInfinity;");
    expect(csharpDefaultLiteral("ready", "string?")).toBe(' = "ready";');
  });

  it("prefers a configured type field, then parsedType, then type", () => {
    expect(
      getCemTypeText(
        {
          type: { text: "string" },
          parsedType: { text: '"small" | "large"' },
          customType: { text: "boolean" },
        },
        "customType",
      ),
    ).toBe("boolean");
    expect(getCemTypeText({ type: { text: "string" }, parsedType: { text: "number" } })).toBe(
      "number",
    );
    expect(getCemTypeText({ type: { text: "string" } })).toBe("string");
  });

  it("maps primitive CEM types", () => {
    expect(mapCemType("boolean")).toEqual({ csType: "bool", isBool: true, isUnion: false });
    expect(mapCemType(" number ")).toEqual({
      csType: "double?",
      isBool: false,
      isUnion: false,
    });
    expect(mapCemType("string")).toEqual({ csType: "string?", isBool: false, isUnion: false });
  });

  it("maps optional, collection, and object types", () => {
    expect(mapCemType("number | undefined").csType).toBe("double?");
    expect(mapCemType("string[]").csType).toBe("IReadOnlyList<string?>?");
    expect(mapCemType("Record<string, unknown>").csType).toBe("JsonElement?");
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

describe("boolean attribute mode", () => {
  it("requires an explicit off value only when the element defaults to true", () => {
    expect(booleanAttributeMode("true")).toBe("onOff");
    expect(booleanAttributeMode(" true ")).toBe("onOff");
    expect(booleanAttributeMode("false")).toBe("presence");
    expect(booleanAttributeMode("false")).toBe("presence");
    expect(booleanAttributeMode(undefined)).toBe("presence");
    expect(booleanAttributeMode("''")).toBe("presence");
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

  it("excludes private and protected members", () => {
    const manifest = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            {
              kind: "class",
              name: "Widget",
              customElement: true,
              tagName: "acme-widget",
              members: [
                { kind: "method", name: "open", privacy: "public" },
                { kind: "method", name: "reset" },
                { kind: "method", name: "internalHelper", privacy: "private" },
                { kind: "method", name: "onSlotChange", privacy: "protected" },
                { kind: "field", name: "secret", privacy: "private" },
              ],
            },
          ],
        },
      ],
    };
    const [declaration] = getCustomElementDeclarations(manifest);

    expect(declaration.members?.map((member) => member.name)).toEqual(["open", "reset"]);
    expect(isExposedMember({ privacy: "public" })).toBe(true);
    expect(isExposedMember({})).toBe(true);
    expect(isExposedMember({ privacy: "private" })).toBe(false);
    expect(isExposedMember({ privacy: "protected" })).toBe(false);
    expect(isExposedMember({ privacy: "PRIVATE" })).toBe(false);
  });

  it("does not derive attributes or inputs from non-exposed members", () => {
    const manifest = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            {
              kind: "class",
              name: "Field",
              customElement: true,
              tagName: "acme-field",
              members: [
                {
                  kind: "field",
                  name: "hiddenValue",
                  attribute: "hidden-value",
                  privacy: "private",
                  type: { text: "string" },
                },
                {
                  kind: "field",
                  name: "shownValue",
                  attribute: "shown-value",
                  privacy: "public",
                  type: { text: "string" },
                },
                { kind: "field", name: "formAssociated", privacy: "private" },
              ],
            },
          ],
        },
      ],
    };
    const [declaration] = getCustomElementDeclarations(manifest);

    expect(declaration.attributes?.map((attribute) => attribute.name)).toEqual(["shown-value"]);
    expect(isFormAssociated(declaration)).toBe(false);
  });
});
