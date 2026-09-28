export interface MappedType {
  csType: string;
  isBool: boolean;
  isUnion: boolean;
  /** Present when the CEM type is a string-literal union, e.g. "primary" | "secondary" */
  unionValues?: string[];
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

  if (trimmed === "boolean") {
    return { csType: "bool", isBool: true, isUnion: false };
  }

  if (trimmed === "number") {
    return { csType: "double?", isBool: false, isUnion: false };
  }

  if (trimmed === "string") {
    return { csType: "string?", isBool: false, isUnion: false };
  }

  // String-literal union, e.g. "primary" | "secondary" | "danger"
  if (trimmed.includes("|")) {
    const values = trimmed
      .split("|")
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);

    const looksLikeStringUnion = values.every((v) => !/^\d+$/.test(v));
    if (looksLikeStringUnion && values.length > 0) {
      return { csType: "string?", isBool: false, isUnion: true, unionValues: values };
    }
  }

  return { csType: "string?", isBool: false, isUnion: false };
}
