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
  outdir: string;
  namespace: string;
  /** Emit a real C# enum for string-literal union attributes instead of falling back to string */
  emitEnumsForUnions?: boolean;
  /**
   * CEM property to read type information from. Defaults to `parsedType`, falling back to
   * `parsedType` and then `type` when the configured property is absent.
   */
  typeSrc?: string;
  /** Component names to exclude from generation. */
  exclude?: string[];
  /** Skips generation and returns no files. */
  skip?: boolean;
  /** Logs each generated file. */
  debug?: boolean;
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
  const {
    outdir,
    namespace,
    emitEnumsForUnions = true,
    typeSrc = "parsedType",
    exclude = [],
    skip = false,
    debug = false,
    booleanOffValue,
  } = options;

  if (skip) {
    if (debug) console.log("[dotnet-tools] Tag Helper generation skipped.");
    return [];
  }

  const offValue = booleanOffValue ?? DEFAULT_BOOLEAN_OFF_VALUE;
  mkdirSync(outdir, { recursive: true });

  const generated: GeneratedFile[] = [];

  for (const decl of getCustomElementDeclarations(manifest, exclude)) {
    const className = toPascalCase(decl.tagName) + "TagHelper";
    const code = renderTagHelper(decl, namespace, emitEnumsForUnions, typeSrc, offValue);
    const filePath = join(outdir, `${className}.cs`);
    writeFileSync(filePath, code, "utf-8");
    generated.push({ fileName: `${className}.cs`, filePath });
    if (debug) console.log(`[dotnet-tools] Tag Helper ${className}: ${filePath}`);
  }

  return generated;
}

function renderTagHelper(
  decl: CustomElementDecl,
  namespace: string,
  emitEnums: boolean,
  typeSrc: string,
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
    const mapped = mapCemType(getCemTypeText(attr, typeSrc));

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
      // Collections have no useful ToString, which would write the type name into the markup.
      assignments.push(
        `        if (${propName} is not null)\n` +
          `            output.Attributes.SetAttribute("${attr.name}", JsonSerializer.Serialize(${propName}));`,
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
      const mapped = mapCemType(getCemTypeText(attr, typeSrc));
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
