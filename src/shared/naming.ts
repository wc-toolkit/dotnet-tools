export function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
}

export function toCamelCase(kebab: string): string {
  const parts = kebab.split("-").filter(Boolean);
  if (parts.length === 0) return kebab;
  return (
    parts[0] +
    parts
      .slice(1)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join("")
  );
}
