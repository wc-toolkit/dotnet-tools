import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CemPackage, CustomElementDecl } from "../shared/cem-types.js";
import { getCemTypeText, getCustomElementDeclarations } from "../shared/cem-types.js";
import { toPascalCase } from "../shared/naming.js";
import {
  booleanAttributeMode,
  csharpDefaultLiteral,
  mapCemType,
  DEFAULT_BOOLEAN_OFF_VALUE,
} from "../shared/type-mapping.js";

export interface TagHelperGenOptions {
  outputDir: string;
  namespace: string;
  /** Emit a real C# enum for string-literal union attributes instead of falling back to string */
  emitEnumsForUnions?: boolean;
  /** Type property to prefer before the parsedType/type fallbacks. */
  typeField?: string;
  /**
   * Attribute text written for a boolean attribute whose element default is `true`, so that
   * `false` can be expressed. Defaults to `"false"`; set to `"off"` for libraries that use it.
   */
  booleanOffValue?: string;
}

export interface GeneratedFile {
  fileName: string;
  filePath: string;
}

export function generateTagHelpers(
  manifest: CemPackage,
  options: TagHelperGenOptions,
): GeneratedFile[] {
  const { outputDir, namespace, emitEnumsForUnions = true, typeField, booleanOffValue } = options;
  const offValue = booleanOffValue ?? DEFAULT_BOOLEAN_OFF_VALUE;
  mkdirSync(outputDir, { recursive: true });

  const generated: GeneratedFile[] = [];

  for (const decl of getCustomElementDeclarations(manifest)) {
    const className = toPascalCase(decl.tagName) + "TagHelper";
    const code = renderTagHelper(decl, namespace, emitEnumsForUnions, typeField, offValue);
    const filePath = join(outputDir, `${className}.cs`);
    writeFileSync(filePath, code, "utf-8");
    generated.push({ fileName: `${className}.cs`, filePath });
  }

  return generated;
}

function renderTagHelper(
  decl: CustomElementDecl,
  namespace: string,
  emitEnums: boolean,
  typeField: string | undefined,
  booleanOffValue: string,
): string {
  const tagName = decl.tagName;
  const className = toPascalCase(tagName) + "TagHelper";
  const attrs = decl.attributes ?? [];

  const enumDefs: string[] = [];
  const properties: string[] = [];
  const assignments: string[] = [];

  for (const attr of attrs) {
    const propName = toPascalCase(attr.name);
    const mapped = mapCemType(getCemTypeText(attr, typeField));

    let csType = mapped.csType;

    if (mapped.isUnion && emitEnums && mapped.unionValues) {
      const enumName = `${propName}Value`;
      enumDefs.push(renderEnum(enumName, mapped.unionValues));
      csType = `${enumName}?`;
      properties.push(`    /// <summary>${escapeXmlDoc(attr.description)}</summary>`);
      properties.push(`    public ${csType} ${propName} { get; set; }`);
      assignments.push(
        `        if (${propName} is not null)\n` +
          `            output.Attributes.SetAttribute("${attr.name}", ${enumName}ToAttributeValue(${propName}.Value));`,
      );
      continue;
    }

    // A boolean whose element default is true cannot be turned off by omitting the attribute,
    // so it becomes tri-state and false is written out explicitly.
    if (mapped.isBool && booleanAttributeMode(attr.default) === "onOff") {
      if (attr.description) {
        properties.push(`    /// <summary>${escapeXmlDoc(attr.description)}</summary>`);
      }
      properties.push(`    public bool? ${propName} { get; set; }`);
      assignments.push(
        `        if (${propName} is not null)\n` +
          `            output.Attributes.SetAttribute("${attr.name}", ${propName}.Value ? "" : "${booleanOffValue}");`,
      );
      continue;
    }

    if (attr.description) {
      properties.push(`    /// <summary>${escapeXmlDoc(attr.description)}</summary>`);
    }
    properties.push(
      `    public ${csType} ${propName} { get; set; }${csharpDefaultLiteral(attr.default, csType, mapped.isBool)}`,
    );

    if (mapped.isBool) {
      assignments.push(
        `        if (${propName})\n            output.Attributes.SetAttribute("${attr.name}", "");`,
      );
    } else if (csType === "string?") {
      assignments.push(
        `        if (!string.IsNullOrEmpty(${propName}))\n            output.Attributes.SetAttribute("${attr.name}", ${propName});`,
      );
    } else if (csType.startsWith("IReadOnlyList<")) {
      assignments.push(
        `        if (${propName} is not null)\n            output.Attributes.SetAttribute("${attr.name}", ${propName}.ToString());`,
      );
    } else {
      assignments.push(
        `        if (${propName} is not null)\n` +
          `            output.Attributes.SetAttribute("${attr.name}", ${propName}.Value.ToString(CultureInfo.InvariantCulture));`,
      );
    }
  }

  const enumHelpers = attrs
    .map((attr) => {
      const mapped = mapCemType(getCemTypeText(attr, typeField));
      if (!(mapped.isUnion && emitEnums && mapped.unionValues)) return null;
      const propName = toPascalCase(attr.name);
      const enumName = `${propName}Value`;
      return renderEnumToAttributeHelper(enumName, mapped.unionValues);
    })
    .filter((x): x is string => x !== null);

  const docSummary = decl.description
    ? `/// <summary>\n/// ${escapeXmlDoc(decl.description)}\n/// </summary>\n`
    : "";

  return `using Microsoft.AspNetCore.Razor.TagHelpers;
using System.Globalization;
using System.Text.Json;

namespace ${namespace};

${docSummary}[HtmlTargetElement("${tagName}")]
public class ${className} : TagHelper
{
${enumDefs.length ? enumDefs.join("\n\n") + "\n\n" : ""}
${properties.join("\n")}

    public override void Process(TagHelperContext context, TagHelperOutput output)
    {
        output.TagName = "${tagName}";
${assignments.join("\n")}
    }
${enumHelpers.length ? "\n" + enumHelpers.join("\n\n") : ""}
}
`;
}

function renderEnum(enumName: string, values: string[]): string {
  const members = values.map((v) => `    ${toEnumMemberName(v)}`).join(",\n");
  return `public enum ${enumName}\n{\n${members}\n}`;
}

function renderEnumToAttributeHelper(enumName: string, values: string[]): string {
  const cases = values
    .map((v) => `            ${enumName}.${toEnumMemberName(v)} => "${v}",`)
    .join("\n");
  return (
    `    private static string ${enumName}ToAttributeValue(${enumName} value) => value switch\n` +
    `    {\n${cases}\n            _ => value.ToString(),\n    };`
  );
}

function toEnumMemberName(value: string): string {
  const normalized = toPascalCase(value).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(normalized) ? normalized : `Value${normalized}`;
}

function escapeXmlDoc(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
