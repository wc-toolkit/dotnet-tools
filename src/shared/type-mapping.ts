export interface MappedType {
  csType: string;
  isBool: boolean;
  isUnion: boolean;
  /** Present when the CEM type is a string-literal union, e.g. "primary" | "secondary" */
  unionValues?: string[];
}

/**
 * How a boolean attribute is written to the element.
 *
 * - `presence`: emit the attribute or omit it. Correct when the element's own default is off,
 *   because omission already reads as false.
 * - `onOff`: emit an explicit off value so the attribute can be turned off. Required when the
 *   element's own default is true, because omission falls back to that default and leaves the
 *   attribute on -- bare presence cannot express false in that case.
 */
export type BooleanAttributeMode = "presence" | "onOff";

/** The off value written for an `onOff` boolean attribute unless overridden by the caller. */
export const DEFAULT_BOOLEAN_OFF_VALUE = "false";

/** Selects the rendering mode for a boolean attribute from its declared default. */
export function booleanAttributeMode(defaultValue: string | undefined): BooleanAttributeMode {
  return defaultValue?.trim().toLowerCase() === "true" ? "onOff" : "presence";
}

export function csharpDefaultLiteral(
  defaultValue: string | undefined,
  csType: string,
  isBool = false,
): string {
  if (!defaultValue || defaultValue === "undefined" || defaultValue === "null") {
    return isBool ? "" : " = default;";
  }
  if (csType === "bool") return ` = ${defaultValue.toLowerCase() === "true" ? "true" : "false"};`;
  if (csType === "double?") {
    if (defaultValue === "Infinity") return " = double.PositiveInfinity;";
    if (defaultValue === "-Infinity") return " = double.NegativeInfinity;";
    if (defaultValue === "NaN") return " = double.NaN;";
    return ` = ${defaultValue};`;
  }
  if (csType === "string?") return ` = "${defaultValue.replace(/"/g, '\\"')}";`;
  return " = default;";
}

/**
 * Maps a CEM attribute/property type string to a C# type.
 * String-literal unions are flagged so callers can optionally emit a backed enum
 * instead of falling back to `string`.
 */
export function mapCemType(cemType?: string): MappedType {
  if (!cemType) {
    return { csType: "string?", isBool: false, isUnion: false };
  }

  const trimmed = cemType.trim();
  const withoutUndefined = trimmed.replace(/\s*\|\s*(undefined|null)$/, "");
  if (withoutUndefined !== trimmed) return mapCemType(withoutUndefined);

  if (trimmed === "boolean") {
    return { csType: "bool", isBool: true, isUnion: false };
  }

  if (trimmed === "number") {
    return { csType: "double?", isBool: false, isUnion: false };
  }

  if (trimmed === "string") {
    return { csType: "string?", isBool: false, isUnion: false };
  }

  if (trimmed.endsWith("[]")) {
    const item = mapCemType(trimmed.slice(0, -2));
    return { csType: `IReadOnlyList<${item.csType}>?`, isBool: false, isUnion: false };
  }

  if (trimmed === "object" || trimmed.startsWith("Record<") || trimmed.startsWith("{")) {
    return { csType: "JsonElement?", isBool: false, isUnion: false };
  }

  // String-literal union, e.g. "primary" | "secondary" | "danger"
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((v) => v.trim());
    const looksLikeStringUnion = parts.every(
      (value) => /^(['"]).*\1$/.test(value) || value === "undefined" || value === "null",
    );
    const values = parts
      .filter((value) => value !== "undefined" && value !== "null")
      .map((v) => v.replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    if (looksLikeStringUnion && values.length > 0) {
      return { csType: "string?", isBool: false, isUnion: true, unionValues: values };
    }
  }

  return { csType: "string?", isBool: false, isUnion: false };
}
