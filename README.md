# .NET Tools for Custom Elements

`@wc-toolkit/dotnet-tools` turns a [Custom Elements Manifest](https://custom-elements-manifest.open-wc.org/)
(CEM) into a .NET package containing both [ASP.NET Core Tag Helpers](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/tag-helpers/intro?view=aspnetcore-10.0) and [Blazor component
wrappers](https://learn.microsoft.com/en-us/aspnet/core/blazor/?view=aspnetcore-10.0). It is intended for teams that build Web Components in JavaScript or TypeScript
but consume them from Razor Pages, MVC, or Blazor applications.

## Why use it?

Web Components are easy to render as HTML, but using them from .NET commonly means using them without type safey and autocomplete or manually maintaining types and wrappers. This package uses the component metadata you already produce for your Web Component toolchain to create that .NET integration layer automatically.

The generated package gives .NET consumers:

- Tag Helpers targeting each custom element, including generated properties for documented attributes.
- Blazor components with typed parameters, optional child content for slots, and `EventCallback` properties for custom events.
- Shared JavaScript interop for forwarding custom element events to Blazor.
- A single Razor Class Library (RCL) NuGet package for both MVC/Razor Pages and Blazor consumers.
- Automatic Tag Helper registration through the package's `build/*.props` file.

The generator is deliberately metadata-driven. The CEM remains the source of truth, so a
component API change can be reflected in the generated .NET package as part of the same
build or release process.

## Requirements

- Node.js 14.17 or newer. A current Node.js LTS release is recommended.
- A CEM with `schemaVersion` and `modules` fields.
- .NET 8 SDK when using the default generated target framework (`net8.0`). Use another installed target framework with `targetFramework` if appropriate.
- The Web Component JavaScript itself must still be loaded by the consuming application. This package generates .NET wrappers; it does not bundle or register the Web Components.

## Install

Install the package and its peer dependency in the project that generates your manifest:

```sh
pnpm add @wc-toolkit/dotnet-tools custom-elements-manifest
```

The package also exposes separate entry points for the generator, plugin, Tag Helper
generator, and Blazor generator:

```ts
import { publishDotNetTypes } from "@wc-toolkit/dotnet-tools";
import { dotnetTypesPublishPlugin } from "@wc-toolkit/dotnet-tools/plugin";
import { generateTagHelpers } from "@wc-toolkit/dotnet-tools/tag-helpers";
import { generateBlazorComponents } from "@wc-toolkit/dotnet-tools/blazor";
```

## Quick start: generate and pack

The main API accepts a parsed CEM object. It creates a temporary project, generates the
source files, builds an RCL, and packs it into a `.nupkg` file. Packing is a dry run by
default, so the first invocation does not publish anything to NuGet.

```ts
import { readFile } from "node:fs/promises";
import { publishDotNetTypes } from "@wc-toolkit/dotnet-tools";

const manifest = JSON.parse(await readFile("./custom-elements.json", "utf8"));

const result = await publishDotNetTypes({
  manifest,
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
  // dryRun defaults to true.
});

console.log(result.nupkgPath);
```

The default work directory is `.cem-dotnet-publish/<packageId>`. Set `workDir` to control
where generated files and the package output are written. Each run removes and recreates
that directory.

The result includes:

- `projectDir`: generated RCL directory.
- `nupkgPath`: path to the packed NuGet package.
- `pushed`: whether the package was pushed to the configured NuGet source.
- `tagHelperFileCount` and `blazorFileCount`: generated source-file counts.

## Publishing to NuGet

Set `dryRun: false` only in a release workflow. The API key can be supplied through
`nugetApiKey` or the `NUGET_API_KEY` environment variable. The default source is
`https://api.nuget.org/v3/index.json`; set `nugetSource` for a private feed.

```ts
const result = await publishDotNetTypes({
  manifest,
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: process.env.RELEASE_VERSION!,
  nugetSource: "https://api.nuget.org/v3/index.json",
  dryRun: false,
});
```

Do not put an API key in source control. `dotnet nuget push` is called with
`--skip-duplicate` when publishing.

## Build integration with a CEM plugin

If your manifest tool exposes an `onManifestGenerated` hook, use the plugin entry point to
run generation whenever the manifest is produced. The plugin accepts all publish options
except `manifest`; it receives the generated manifest from the hook.

```ts
import { dotnetTypesPublishPlugin } from "@wc-toolkit/dotnet-tools/plugin";

const dotnetPlugin = dotnetTypesPublishPlugin({
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
  dryRun: true,
});

// Add dotnetPlugin alongside the CEM analyzer plugin in your bundler config.
export default {
  plugins: [, /* CEM analyzer */ dotnetPlugin],
};
```

The plugin is framework-agnostic and returns the same publish result from its
`onManifestGenerated` callback.

## Generated output

For every custom element declaration with `customElement: true` and a `tagName`, the
generator creates:

```text
<workDir>/
  <packageId>.csproj
  build/<packageId>.props
  wwwroot/customElementInterop.js
  TagHelpers/<ElementName>TagHelper.cs
  Blazor/<ElementName>.razor
  Blazor/<ElementName>.razor.cs
  Blazor/CustomEventArgs.cs
```

Declarations without both `customElement: true` and `tagName` are ignored. Kebab-case tag
names are converted to PascalCase for generated C# and Razor names. For example,
`acme-date-picker` becomes `AcmeDatePickerTagHelper` and `AcmeDatePicker`.

### Type mapping

The current attribute mapping is:

| CEM type                                          | Generated C# type                                             |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `boolean`                                         | `bool`                                                        |
| `number`                                          | `double?`                                                     |
| `string`                                          | `string?`                                                     |
| missing or unrecognized type                      | `string?`                                                     |
| string-literal union such as `"small" \| "large"` | nullable generated enum for Tag Helpers; `string?` for Blazor |

Set `emitEnumsForUnions: false` to keep string-literal unions as strings in generated Tag
Helpers. Attribute descriptions and element descriptions are emitted as C# XML
documentation where available.

## Consume the generated NuGet package

Install the generated package in an ASP.NET Core or Blazor application:

```sh
dotnet add package Acme.Components --version 1.0.0
```

The generated package does not replace the Web Component JavaScript. Load the JavaScript
that defines your custom elements in the host application before rendering them.

### Razor Pages and MVC

The package includes a `build/<packageId>.props` file that registers its Tag Helpers for
normal NuGet consumers. If your package setup does not import that build file, add the
manual equivalent to `_ViewImports.cshtml`:

```razor
@addTagHelper *, Acme.Components
```

You can then use the original custom-element tag in a Razor view:

```razor
<acme-date-picker value="2026-09-27"></acme-date-picker>
```

Generated Tag Helpers preserve the custom-element tag name and copy non-null attributes to
the rendered element. Boolean properties render an empty boolean attribute when true.

### Blazor

Import the generated namespace in `_Imports.razor`:

```razor
@using Acme.Components
```

Load the generated interop script once in the host page. The `_content` URL uses the NuGet
package ID:

```html
<script src="_content/Acme.Components/customElementInterop.js"></script>
```

Render the generated component and bind generated event callbacks as needed:

```razor
<AcmeDatePicker Value="2026-09-27" OnDateChanged="HandleDateChanged" />

@code {
    private Task HandleDateChanged(CustomEventArgs args)
    {
        // args.Detail contains the event detail as a JsonElement.
        return Task.CompletedTask;
    }
}
```

Components for elements with slots expose `ChildContent`. Components for elements with
custom events implement async disposal and unregister their JavaScript listeners when
removed.

## Direct generation APIs

Use the lower-level exports when you already manage the .NET project yourself:

```ts
const tagHelpers = generateTagHelpers(manifest, {
  outputDir: "./generated/TagHelpers",
  namespace: "Acme.Components",
  emitEnumsForUnions: true,
});

const blazor = generateBlazorComponents(manifest, {
  outputDir: "./generated/Blazor",
  namespace: "Acme.Components",
});
```

`scaffoldCombinedProject` creates the RCL project structure, while `packAndPush` restores,
builds, packs, and optionally pushes an already-scaffolded project. These functions are
also exported from the package root.

## Limitations

- Only custom element declarations with a `tagName` are generated.
- Attribute/property type mapping is intentionally conservative; unknown types become `string?`.
- Event detail payloads are represented as `JsonElement?` through `CustomEventArgs`; the generator does not create event-detail model classes.
- The generator does not load Web Component JavaScript or validate that the generated package matches a live component implementation.
- The generated project currently references ASP.NET Core component packages aligned with .NET 8. Select and verify a different target framework before using one.

## License

This project is available under the [MIT License](LICENSE).
