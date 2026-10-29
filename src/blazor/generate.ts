import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CemPackage } from "../shared/cem-types.js";
import {
  createBlazorComponentModels,
  isOnOffBoolean,
  resolveFormEvents,
  type BlazorComponentModel,
  type BlazorMethodModel,
  type BlazorTypeRegistry,
} from "./model.js";
import {
  csharpDefaultLiteral,
  mapCemType,
  DEFAULT_BOOLEAN_OFF_VALUE,
} from "../shared/type-mapping.js";
import { toPascalCase } from "../shared/naming.js";
import { writeBlazorSupportFiles } from "../dotnet/scaffold.js";
import type { GeneratedFile } from "../tag-helpers/generate.js";
import { findBlazorParityIssues } from "./parity.js";

export interface BlazorGenOptions {
  outdir: string;
  namespace: string;
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
  /** Validate that every CEM API member is represented in the normalized model. */
  validateParity?: boolean;
  /** Attribute/member names that identify the live value of a form-associated element. */
  formValueMembers?: string[];
  /**
   * Element used to wrap named slot content so it can carry the `slot` attribute. Defaults to
   * `"span"`, which suits inline slot content. Use `"div"` for block-oriented slots, or `null` to
   * emit no wrapper so callers can supply their own element with the `slot` attribute.
   */
  slotWrapperTag?: string | null;
  /**
   * Attribute text written for a boolean attribute whose element default is `true`, so that
   * `false` can be expressed. Defaults to `"false"`, which matches the HTML convention for
   * enumerated boolean attributes such as `spellcheck`. Set to `"off"` for element libraries
   * that spell it that way.
   */
  booleanOffValue?: string;
}

export function generateBlazorComponents(
  manifest: CemPackage,
  options: BlazorGenOptions,
): GeneratedFile[] {
  const {
    outdir,
    namespace,
    typeSrc = "parsedType",
    exclude = [],
    skip = false,
    debug = false,
    validateParity = true,
    formValueMembers,
    slotWrapperTag,
    booleanOffValue = DEFAULT_BOOLEAN_OFF_VALUE,
  } = options;

  if (skip) {
    if (debug) console.log("[dotnet-tools] Blazor generation skipped.");
    return [];
  }

  const slotTag = normalizeSlotWrapperTag(slotWrapperTag);
  mkdirSync(outdir, { recursive: true });

  writeBlazorSupportFiles(outdir, namespace);
  const generated: GeneratedFile[] = [
    "CustomEventArgs.cs",
    "GeneratedComponentBase.cs",
    "GeneratedInputBase.cs",
  ].map((fileName) => ({ fileName, filePath: join(outdir, fileName) }));

  const models = createBlazorComponentModels(manifest, typeSrc, formValueMembers, exclude);
  if (validateParity) {
    const parityIssues = findBlazorParityIssues(manifest, { models, typeSrc, exclude });
    if (parityIssues.length > 0) {
      throw new Error(parityIssues.map((issue) => issue.message).join("\n"));
    }
  }
  const typePath = join(outdir, "BlazorTypes.cs");
  writeFileSync(
    typePath,
    renderBlazorTypes(models[0]?.typeRegistry ?? { enums: [], records: [] }, namespace),
    "utf-8",
  );
  generated.push({ fileName: "BlazorTypes.cs", filePath: typePath });

  for (const model of models) {
    const razorPath = join(outdir, `${model.componentName}.razor`);
    writeFileSync(razorPath, renderRazorMarkup(model, slotTag, booleanOffValue), "utf-8");
    generated.push({ fileName: `${model.componentName}.razor`, filePath: razorPath });

    const codeBehindPath = join(outdir, `${model.componentName}.razor.cs`);
    writeFileSync(codeBehindPath, renderCodeBehind(model, namespace), "utf-8");
    generated.push({ fileName: `${model.componentName}.razor.cs`, filePath: codeBehindPath });
    if (debug) console.log(`[dotnet-tools] Blazor component ${model.componentName}: ${razorPath}`);
  }

  return generated;
}

const SlotWrapperTagPattern = /^[a-z][a-z0-9-]*$/i;

/** Validates the configured slot wrapper so a bad value cannot corrupt generated Razor. */
function normalizeSlotWrapperTag(tag: string | null | undefined): string | null {
  if (tag === null) return null;
  const resolved = tag ?? "span";
  if (!SlotWrapperTagPattern.test(resolved)) {
    throw new Error(
      `Invalid slotWrapperTag '${resolved}'. Use an element name such as "span" or "div", or null to emit no wrapper.`,
    );
  }
  return resolved.toLowerCase();
}

function renderRazorMarkup(
  model: BlazorComponentModel,
  slotWrapperTag: string | null,
  booleanOffValue: string,
): string {
  const attrBindings = model.attributes
    .map((attribute) =>
      attribute === model.formValue
        ? `${attribute.name}="@CurrentValueAsString"`
        : renderAttributeBinding(attribute, booleanOffValue),
    )
    .join(" ");
  // A form control has to read its value back out of the element. Binding the event straight to
  // the user callback would skip HandleValueChanged, which is what updates the bound value, so the
  // generated override is wired in instead and forwards to the callback itself.
  const formEvents = resolveFormEvents(model);
  const eventBindings = model.events
    .filter((event) => !event.useInterop)
    .map((event) => {
      // With both events available, input carries the value only when Immediate is set; otherwise
      // change does, and input still reaches its own callback.
      if (formEvents.supportsImmediate && event === formEvents.inputEvent) {
        return ` @oninput="HandleInputEvent"`;
      }
      if (event === formEvents.bindingEvent) {
        return ` @on${event.name}="HandleValueChanged"`;
      }
      return ` @on${event.name}="${event.propertyName}"`;
    })
    .join("");
  const ssrBindings = model.ssrSlotHints
    .map((slot) => ` with-${slot}="@With${toPascalCase(slot)}"`)
    .join("");
  const slotContent = model.slots
    .map((slot) => {
      if (!slot.name) return `\n    @${slot.propertyName}\n`;
      const guard = `${slot.propertyName} is not null`;
      if (slotWrapperTag === null) {
        return `\n    @if (${guard})\n    {\n        @${slot.propertyName}\n    }\n`;
      }
      return `\n    @if (${guard})\n    {\n        <${slotWrapperTag} slot="${slot.name}">@${slot.propertyName}</${slotWrapperTag}>\n    }\n`;
    })
    .join("");
  const baseType = model.formValue
    ? `GeneratedInputBase<${model.formValue.mappedType.isBool ? "bool" : model.formValue.mappedType.csType}>`
    : "GeneratedComponentBase";

  return `@* Generated from Custom Elements Manifest — do not edit directly *@
@inherits ${baseType}
<${model.tagName} @ref="Element" @attributes="AdditionalAttributes" class="@GetCssClass()" style="@GetStyle()"${eventBindings}${ssrBindings} ${attrBindings}>${slotContent}</${model.tagName}>
`;
}

function renderAttributeBinding(
  attribute: BlazorComponentModel["attributes"][number],
  booleanOffValue: string,
): string {
  if (isOnOffBoolean(attribute)) {
    return `${attribute.name}="@RenderOnOffAttribute("${attribute.name}", ${attribute.propertyName}, "${booleanOffValue}")"`;
  }
  if (attribute.mappedType.csType.startsWith("IReadOnlyList<")) {
    return `${attribute.name}="@RenderJsonAttribute("${attribute.name}", ${attribute.propertyName})"`;
  }
  const value =
    attribute.typeName && attribute.typeKind === "enum"
      ? `GeneratedTypeConversions.ToAttributeValue(${attribute.propertyName})`
      : attribute.propertyName;
  const defaultValue = renderDefaultAttributeValue(
    attribute.defaultValue,
    attribute.mappedType.csType,
  );
  return defaultValue
    ? `${attribute.name}="@RenderAttribute("${attribute.name}", ${value}, ${defaultValue})"`
    : `${attribute.name}="@${value}"`;
}

function renderDefaultAttributeValue(
  defaultValue: string | undefined,
  csType: string,
): string | undefined {
  if (!defaultValue || defaultValue === "undefined" || defaultValue === "null") return undefined;
  if (csType === "bool") return defaultValue.toLowerCase() === "true" ? "true" : "false";
  if (csType === "double?") {
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(defaultValue)) return defaultValue;
    return undefined;
  }
  if (csType === "string?") return `"${defaultValue.replace(/"/g, "\\" + '"')}"`;
  return undefined;
}

function renderCodeBehind(model: BlazorComponentModel, namespace: string): string {
  const { componentName, declaration, attributes, events, methods, formValue } = model;
  const formValueType = formValue?.mappedType.isBool ? "bool" : formValue?.mappedType.csType;
  const parameters = attributes
    .filter((attribute) => attribute !== formValue)
    .map((attribute) => {
      const doc = attribute.description
        ? `    /// <summary>${escapeXmlDoc(attribute.description)}</summary>\n`
        : "";
      const type = isOnOffBoolean(attribute)
        ? "bool?"
        : attribute.mappedType.isBool
          ? "bool"
          : attribute.mappedType.csType;
      // A tri-state boolean has no initializer: null means "leave the element's default alone".
      const initializer = isOnOffBoolean(attribute)
        ? ""
        : csharpDefaultLiteral(attribute.defaultValue, type, attribute.mappedType.isBool);
      const typeName = attribute.typeName ?? type;
      return `${doc}    [Parameter] public ${attribute.typeName ? `${typeName}?` : type} ${attribute.propertyName} { get; set; }${attribute.typeName ? " = default;" : initializer}`;
    })
    .join("\n\n");
  const eventParameters = events
    .map((event) => {
      const doc = event.description
        ? `    /// <summary>${escapeXmlDoc(event.description)}</summary>\n`
        : "";
      const callbackType =
        event.callbackType === "EventArgs"
          ? "EventCallback"
          : `EventCallback<${event.callbackType}>`;
      return `${doc}    [Parameter] public ${callbackType} ${event.propertyName} { get; set; }`;
    })
    .join("\n\n");
  const interopEvents = events.filter((event) => event.useInterop);
  const eventHandlers = interopEvents
    .map(
      (event) =>
        `    [JSInvokable]\n    public async Task Handle${event.propertyName.slice(2)}(${event.callbackType} args) => await ${event.propertyName}.InvokeAsync(args);`,
    )
    .join("\n\n");
  const eventNames = interopEvents.length
    ? `    protected override IReadOnlyList<string> EventNames => new[] { ${interopEvents.map((event) => `"${event.name}"`).join(", ")} };\n\n`
    : "";
  const slots = model.slots
    .map((slot) => `    [Parameter] public RenderFragment? ${slot.propertyName} { get; set; }`)
    .join("\n\n");
  const ssrParameters = model.ssrSlotHints
    .map((slot) => `    [Parameter] public bool With${toPascalCase(slot)} { get; set; }`)
    .join("\n\n");
  const baseType = formValueType
    ? `GeneratedInputBase<${formValueType}>`
    : "GeneratedComponentBase";
  const codeFormEvents = resolveFormEvents(model);
  const formImplementation = formValueType
    ? renderFormImplementation(
        formValueType,
        codeFormEvents.bindingEvent?.propertyName,
        codeFormEvents.supportsImmediate
          ? {
              change: codeFormEvents.changeEvent!.propertyName,
              input: codeFormEvents.inputEvent!.propertyName,
            }
          : undefined,
      )
    : "";
  const methodsCode = methods.map(renderMethod).join("\n\n");
  const liveProperty = model.liveValueProperty
    ? `    protected override string? LiveValuePropertyName => "${model.liveValueProperty}";\n\n`
    : "";
  const summary = declaration.description
    ? `/// <summary>\n/// ${escapeXmlDoc(declaration.description)}\n/// </summary>\n`
    : "";

  return `using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System.Text.Json;
${events.some((event) => !event.useInterop) || formValueType ? "using Microsoft.AspNetCore.Components.Web;\n" : ""}${formValueType ? "using Microsoft.AspNetCore.Components.Forms;\nusing System.Diagnostics.CodeAnalysis;\n" : ""}
namespace ${namespace};

${summary}public partial class ${componentName} : ${baseType}
{
${eventNames}${parameters}${parameters ? "\n\n" : ""}${eventParameters}${eventParameters ? "\n\n" : ""}${slots}${slots ? "\n\n" : ""}${ssrParameters}${ssrParameters ? "\n\n" : ""}${methodsCode}${methodsCode ? "\n\n" : ""}${eventHandlers}${eventHandlers ? "\n\n" : ""}${liveProperty}${formImplementation}}
`;
}

function renderBlazorTypes(registry: BlazorTypeRegistry, namespace: string): string {
  const enums = registry.enums
    .map((entry) => {
      const members = entry.values.map((value) => `    ${toEnumMemberName(value)}`).join(",\n");
      return `public enum ${entry.name}\n{\n${members}\n}`;
    })
    .join("\n\n");
  const records = registry.records
    .map((record) => {
      const properties = record.fields
        .map((field) => `    public ${field.type} ${toPascalCase(field.name)} { get; set; }`)
        .join("\n");
      if (record.kind === "object") {
        return `public sealed class ${record.name}\n{\n${properties}\n}`;
      }
      return `public sealed class ${record.name} : CustomEventArgs\n{\n    public new ${record.name}Detail? Detail { get; set; }\n}\n\npublic sealed class ${record.name}Detail\n{\n${properties}\n}`;
    })
    .join("\n\n");
  const conversions = registry.enums
    .map(
      (entry) =>
        `    public static string? ToAttributeValue(${entry.name}? value) => value switch\n    {\n${entry.values
          .map((value) => `        ${entry.name}.${toEnumMemberName(value)} => "${value}",`)
          .join("\n")}\n        _ => null,\n    };`,
    )
    .join("\n\n");

  return `using System.Text.Json;

namespace ${namespace};

${enums}${enums && records ? "\n\n" : ""}${records}${registry.enums.length ? `\n\npublic static class GeneratedTypeConversions\n{\n${conversions}\n}` : ""}
`;
}

function toEnumMemberName(value: string): string {
  const normalized = toPascalCase(value).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(normalized) ? normalized : `Value${normalized}`;
}

function renderFormImplementation(
  type: string,
  bindingCallback?: string,
  immediate?: { change: string; input: string },
): string {
  // With both events available the caller chooses the binding source at runtime. Only one of the
  // two handlers reads the value back; the other just forwards to its own callback, and the
  // caller's callback always runs after the value has been updated.
  const changeHandler = !bindingCallback
    ? ""
    : immediate
      ? `    protected override async Task HandleValueChanged(ChangeEventArgs args)
    {
        if (!Immediate) await base.HandleValueChanged(args);
        await ${immediate.change}.InvokeAsync(args);
    }

    protected async Task HandleInputEvent(ChangeEventArgs args)
    {
        if (Immediate) await base.HandleValueChanged(args);
        await ${immediate.input}.InvokeAsync(args);
    }

`
      : `    protected override async Task HandleValueChanged(ChangeEventArgs args)
    {
        await base.HandleValueChanged(args);
        await ${bindingCallback}.InvokeAsync(args);
    }

`;
  if (type === "string?") {
    return `${changeHandler}    protected override bool TryParseValueFromString(string? value, out ${type} result, [NotNullWhen(false)] out string? validationErrorMessage)
    {
        result = value;
        validationErrorMessage = null;
        return true;
    }
`;
  }

  const parse =
    type === "bool"
      ? `        if (bool.TryParse(value, out var parsed))
        {
            result = parsed;
            validationErrorMessage = null;
            return true;
        }`
      : type === "double?"
        ? `        if (double.TryParse(value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var parsed))
        {
            result = parsed;
            validationErrorMessage = null;
            return true;
        }`
        : `        result = value;
        validationErrorMessage = null;
        return true;`;

  return `${changeHandler}    protected override bool TryParseValueFromString(string? value, out ${type} result, [NotNullWhen(false)] out string? validationErrorMessage)
    {
${parse}
        result = default;
        validationErrorMessage = "The value is invalid.";
        return false;
    }
`;
}

function renderMethod(method: BlazorMethodModel): string {
  const methodName = toPascalCase(method.member.name) + "Async";
  const modifier = BaseClassMembers.has(methodName) ? "new " : "";
  const parameters = method.parameters
    .map((parameter, index) => {
      const canDefault =
        parameter.optional && method.parameters.slice(index + 1).every((next) => next.optional);
      return `${parameter.typeName ? `${parameter.typeName}?` : parameter.type} ${toParameterName(parameter.name)}${canDefault ? " = default" : ""}`;
    })
    .join(", ");
  const args = method.parameters.map((parameter) => toParameterName(parameter.name)).join(", ");
  const returnText = method.returnType;
  const invocation = `"${method.member.name}", new object?[] { ${args} }`;

  if (!returnText || returnText.trim() === "void") {
    return `    public ${modifier}Task ${methodName}(${parameters}) => InvokeVoidMethodAsync(${invocation});`;
  }

  const returnType = method.returnTypeName
    ? `${method.returnTypeName}?`
    : mapCemType(returnText).csType;
  return `    public ${modifier}Task<${returnType}> ${methodName}(${parameters}) => InvokeMethodAsync<${returnType}>(${invocation});`;
}

const BaseClassMembers = new Set([
  "DisposeAsync",
  "InvokeVoidMethodAsync",
  "InvokeMethodAsync",
  "SetElementValidityAsync",
  "ResetElementValidityAsync",
]);

function toParameterName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_]/g, "_");
  const identifier = /^[A-Za-z_]/.test(normalized) ? normalized : `arg_${normalized}`;
  return CSharpKeywords.has(identifier) ? `@${identifier}` : identifier;
}

const CSharpKeywords = new Set([
  "event",
  "class",
  "namespace",
  "params",
  "ref",
  "return",
  "string",
  "object",
  "value",
]);

function escapeXmlDoc(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
