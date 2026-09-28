import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CemPackage, CustomElementDecl } from "../shared/cem-types.js";
import { getCustomElementDeclarations } from "../shared/cem-types.js";
import { toPascalCase } from "../shared/naming.js";
import { mapCemType } from "../shared/type-mapping.js";
import type { GeneratedFile } from "../tag-helpers/generate.js";

export interface BlazorGenOptions {
  outputDir: string;
  namespace: string;
}

export function generateBlazorComponents(
  manifest: CemPackage,
  options: BlazorGenOptions,
): GeneratedFile[] {
  const { outputDir, namespace } = options;
  mkdirSync(outputDir, { recursive: true });

  const generated: GeneratedFile[] = [];

  for (const decl of getCustomElementDeclarations(manifest)) {
    const componentName = toPascalCase(decl.tagName);

    const razorPath = join(outputDir, `${componentName}.razor`);
    writeFileSync(razorPath, renderRazorMarkup(decl), "utf-8");
    generated.push({ fileName: `${componentName}.razor`, filePath: razorPath });

    const codeBehindPath = join(outputDir, `${componentName}.razor.cs`);
    writeFileSync(codeBehindPath, renderCodeBehind(decl, namespace), "utf-8");
    generated.push({ fileName: `${componentName}.razor.cs`, filePath: codeBehindPath });
  }

  return generated;
}

function renderRazorMarkup(decl: CustomElementDecl): string {
  const tagName = decl.tagName;
  const attrs = decl.attributes ?? [];

  const attrBindings = attrs
    .map((a) => {
      const propName = toPascalCase(a.name);
      const mapped = mapCemType(a.type?.text);
      return mapped.isBool ? `${a.name}="@${propName}"` : `${a.name}="@${propName}"`;
    })
    .join(" ");

  const hasSlot = (decl.slots?.length ?? 0) > 0;

  return `@* Generated from Custom Elements Manifest — do not edit directly *@
<${tagName} @ref="_elementRef" ${attrBindings}>${hasSlot ? "\n    @ChildContent\n" : ""}</${tagName}>
`;
}

function renderCodeBehind(decl: CustomElementDecl, namespace: string): string {
  const tagName = decl.tagName;
  const componentName = toPascalCase(tagName);
  const attrs = decl.attributes ?? [];
  const events = decl.events ?? [];
  const hasSlot = (decl.slots?.length ?? 0) > 0;

  const parameters = attrs
    .map((a) => {
      const propName = toPascalCase(a.name);
      const mapped = mapCemType(a.type?.text);
      const csType = mapped.isBool ? "bool" : mapped.csType;
      const doc = a.description
        ? `    /// <summary>${escapeXmlDoc(a.description)}</summary>\n`
        : "";
      return `${doc}    [Parameter] public ${csType} ${propName} { get; set; }${mapped.isBool ? "" : " = default;"}`;
    })
    .join("\n\n");

  const eventParameters = events
    .map((e) => {
      const propName = "On" + toPascalCase(e.name);
      const doc = e.description
        ? `    /// <summary>${escapeXmlDoc(e.description)}</summary>\n`
        : "";
      return `${doc}    [Parameter] public EventCallback<CustomEventArgs> ${propName} { get; set; }`;
    })
    .join("\n\n");

  const eventNamesArray = events.map((e) => `"${e.name}"`).join(", ");

  const eventHandlers = events
    .map((e) => {
      const propName = "On" + toPascalCase(e.name);
      const jsInvokableName = "Handle" + toPascalCase(e.name);
      return (
        `    [JSInvokable]\n` +
        `    public async Task ${jsInvokableName}(CustomEventArgs args) => await ${propName}.InvokeAsync(args);`
      );
    })
    .join("\n\n");

  const childContentParam = hasSlot
    ? `    [Parameter] public RenderFragment? ChildContent { get; set; }\n\n`
    : "";

  const needsInterop = events.length > 0;

  const jsInteropFields = needsInterop
    ? `    private DotNetObjectReference<${componentName}>? _selfRef;\n\n    [Inject] private IJSRuntime JS { get; set; } = default!;\n\n`
    : "";

  const onAfterRender = needsInterop
    ? `    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _selfRef = DotNetObjectReference.Create(this);
            await JS.InvokeVoidAsync(
                "customElementInterop.bindEvents",
                _elementRef,
                _selfRef,
                new[] { ${eventNamesArray} });
        }
    }

`
    : "";

  const disposeAsync = needsInterop
    ? `    public async ValueTask DisposeAsync()
    {
        if (_selfRef is not null)
        {
            await JS.InvokeVoidAsync("customElementInterop.unbindEvents", _elementRef);
            _selfRef.Dispose();
        }
    }
`
    : "";

  const interfaces = needsInterop ? " : IAsyncDisposable" : "";
  const docSummary = decl.description
    ? `/// <summary>\n/// ${escapeXmlDoc(decl.description)}\n/// </summary>\n`
    : "";

  return `using Microsoft.AspNetCore.Components;
${needsInterop ? "using Microsoft.JSInterop;\n" : ""}
namespace ${namespace};

${docSummary}public partial class ${componentName}${interfaces}
{
    private ElementReference _elementRef;

${jsInteropFields}${parameters}${parameters ? "\n\n" : ""}${eventParameters}${eventParameters ? "\n\n" : ""}${childContentParam}${onAfterRender}${eventHandlers}${eventHandlers ? "\n\n" : ""}${disposeAsync}}
`;
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
