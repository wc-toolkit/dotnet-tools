import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldOptions {
  projectDir: string;
  packageId: string;
  namespace: string;
  version: string;
  targetFramework?: string;
  description?: string;
  authors?: string;
}

/**
 * Scaffolds a single Razor Class Library (RCL) project that hosts BOTH
 * Tag Helpers and Blazor components. The Razor SDK is a superset of the
 * plain SDK, so it compiles the Tag Helpers' plain .cs files without issue
 * while also handling .razor compilation and wwwroot static assets.
 */
export function scaffoldCombinedProject(options: ScaffoldOptions): void {
  const {
    projectDir,
    packageId,
    namespace,
    version,
    targetFramework = "net8.0",
    description = `Generated ASP.NET Tag Helpers and Blazor components for ${namespace} custom elements.`,
    authors = packageId.split(".")[0],
  } = options;

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, "TagHelpers"), { recursive: true });
  mkdirSync(join(projectDir, "Blazor"), { recursive: true });
  mkdirSync(join(projectDir, "wwwroot"), { recursive: true });
  mkdirSync(join(projectDir, "build"), { recursive: true });

  writeFileSync(
    join(projectDir, `${packageId}.csproj`),
    renderCsproj({ packageId, version, targetFramework, description, authors }),
  );

  writeFileSync(join(projectDir, "build", `${packageId}.props`), renderPropsFile(namespace));

  writeFileSync(join(projectDir, "wwwroot", "customElementInterop.js"), renderInteropJs());

  writeFileSync(join(projectDir, "Blazor", "CustomEventArgs.cs"), renderCustomEventArgs(namespace));

  writeFileSync(join(projectDir, "_ViewImportsExample.txt"), renderViewImportsNote(namespace));
}

function renderCustomEventArgs(namespace: string): string {
  return `using System.Text.Json;

namespace ${namespace};

/// <summary>
/// Wraps a DOM CustomEvent dispatched by a web component, passed from JS
/// interop into the generated Blazor component's [JSInvokable] handlers.
/// </summary>
public class CustomEventArgs
{
    public string Type { get; set; } = string.Empty;

    /// <summary>
    /// The event's \`detail\` payload, as raw JSON. Deserialize with
    /// <c>Detail?.Deserialize&lt;T&gt;()</c> into whatever shape the
    /// specific custom event's detail is documented to carry.
    /// </summary>
    public JsonElement? Detail { get; set; }
}
`;
}

function renderCsproj(opts: {
  packageId: string;
  version: string;
  targetFramework: string;
  description: string;
  authors: string;
}): string {
  const { packageId, version, targetFramework, description, authors } = opts;

  return `<Project Sdk="Microsoft.NET.Sdk.Razor">

  <PropertyGroup>
    <TargetFramework>${targetFramework}</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>

    <PackageId>${packageId}</PackageId>
    <Version>${version}</Version>
    <Authors>${authors}</Authors>
    <Description>${description}</Description>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>

    <!-- This project ships both Tag Helpers (plain .cs) and Blazor components (.razor).
         The Razor SDK compiles both; consumers who only reference Tag Helpers never
         trigger the Blazor JS interop assets in wwwroot. -->
    <RazorLangVersion>${targetFramework.startsWith("net8") ? "8.0" : "latest"}</RazorLangVersion>
    <AddRazorSupportForMvc>true</AddRazorSupportForMvc>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.Razor.Runtime" Version="2.2.0" />
    <PackageReference Include="Microsoft.AspNetCore.Components.Web" Version="8.0.0" />
  </ItemGroup>

  <!-- Auto-registers the Tag Helpers for any consumer that references this package,
       so they don't need to hand-write @addTagHelper in _ViewImports.cshtml -->
  <ItemGroup>
    <None Include="build/${packageId}.props" Pack="true" PackagePath="build/" />
  </ItemGroup>

</Project>
`;
}

function renderPropsFile(namespace: string): string {
  return `<Project>
  <!-- Auto-imported by consumers via NuGet's build/ convention.
       Registers Tag Helpers from this package without requiring
       a manual @addTagHelper directive in _ViewImports.cshtml. -->
  <ItemGroup>
    <RazorGenerateComponentsAssembly Include="${namespace}" />
  </ItemGroup>
</Project>
`;
}

function renderInteropJs(): string {
  return `// customElementInterop.js
// Shared JS interop helper used by generated Blazor component wrappers
// to bridge custom element events back into .NET via JSInvokable methods.

window.customElementInterop = {
  _listeners: new WeakMap(),

  bindEvents(element, dotNetRef, eventNames) {
    const handlers = {};

    for (const eventName of eventNames) {
      const handler = (evt) => {
        const detail = evt.detail ?? null;
        const methodName = 'Handle' + eventName
          .split('-')
          .map((s) => s[0].toUpperCase() + s.slice(1))
          .join('');

        dotNetRef.invokeMethodAsync(methodName, {
          type: evt.type,
          detail,
        });
      };

      element.addEventListener(eventName, handler);
      handlers[eventName] = handler;
    }

    this._listeners.set(element, handlers);
  },

  unbindEvents(element) {
    const handlers = this._listeners.get(element);
    if (!handlers) return;

    for (const [eventName, handler] of Object.entries(handlers)) {
      element.removeEventListener(eventName, handler);
    }

    this._listeners.delete(element);
  },
};
`;
}

function renderViewImportsNote(namespace: string): string {
  return `For Razor Pages / MVC consumers who don't get the auto-registration via
the packaged .props file, the manual equivalent in _ViewImports.cshtml is:

    @addTagHelper *, ${namespace}

For Blazor consumers, add to _Imports.razor:

    @using ${namespace}

And reference the interop script once in your host page (index.html for
Blazor WASM, or _Host.cshtml / App.razor for Blazor Server):

    <script src="_content/YOUR_PACKAGE_ID/customElementInterop.js"></script>
`;
}
