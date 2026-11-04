# .NET Tools for Custom Elements

<div align="center">
  
![workbench with tools, html, css, javascript, and .NET logos](https://github.com/wc-toolkit/dotnet-tools/blob/main/assets/wc-toolkit_dotnet.png?raw=true)

</div>

`@wc-toolkit/dotnet-tools` turns a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest)
(CEM) into a .NET package containing both [ASP.NET Core Tag Helpers](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/tag-helpers/intro?view=aspnetcore-10.0) and [Blazor component
wrappers](https://learn.microsoft.com/en-us/aspnet/core/blazor/?view=aspnetcore-10.0). It is intended for teams that build Web Components in JavaScript or TypeScript, but consume them from Razor Pages, MVC, or Blazor applications.

## Quick start

All generation modes run the same `packDotNetTypes` pipeline and produce the same Tag Helpers,
Blazor components, and `.nupkg`. Choose the trigger that fits your build.

### Install

Install the package and its peer dependency in the project that generates your manifest:

```sh
npm i -D @wc-toolkit/dotnet-tools
```

### CEM Generator plugin

Use [CEM Generator](https://cem-generator.wc-toolkit.com/) when you want .NET package generation to run automatically after CEM generation.

```js
// cem-generator.config.mjs
import { dotnetTypesGeneratorPlugin } from "@wc-toolkit/dotnet-tools/plugin";

export default {
  filePath: "dist/custom-elements.json",
  include: ["src/**/*.ts"],
  plugins: [
    dotnetTypesGeneratorPlugin({
      packageId: "Acme.Components",
      namespace: "Acme.Components",
      version: "1.0.0",
    }),
  ],
};
```

### CEM Analyzer plugin

Use [CEM Analyzer](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/) when your pipeline is based on CEM analyzer hooks and config-driven manifest builds.

```js
// custom-elements-manifest.config.mjs
import { dotnetTypesAnalyzerPlugin } from "@wc-toolkit/dotnet-tools/plugin";

export default {
  globs: ["src/**/*.ts"],
  outdir: "dist",
  plugins: [
    dotnetTypesAnalyzerPlugin({
      packageId: "Acme.Components",
      namespace: "Acme.Components",
      version: "1.0.0",
    }),
  ],
};
```

### Programmatic generation

Use [`packDotNetTypes`](#direct-generation-apis) from `@wc-toolkit/dotnet-tools` when you need an awaitable, deterministic step in CI or release workflows.

```ts
import { readFile } from "node:fs/promises";
import { packDotNetTypes } from "@wc-toolkit/dotnet-tools";

const manifest = JSON.parse(await readFile("./custom-elements.json", "utf8"));

const result = await packDotNetTypes({
  manifest,
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
});

console.log(result?.nupkgPath);
```

For configuration details, see [Options](#options).

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

- A current Node.js LTS release is recommended.
- A CEM with `schemaVersion` and `modules` fields.
- .NET 8 SDK when using the default generated target framework (`net8.0`). Use another installed target framework with `targetFramework` if appropriate.
- The Web Component JavaScript must still be loaded by the consuming application. This package generates .NET wrappers and can package static assets into `wwwroot`, but it does not automatically load scripts or register custom elements at runtime.

## APIs

The package also exposes separate entry points for the generator, plugin, Tag Helper generator, and Blazor generator if you want to use only isolated features:

```ts
import { packDotNetTypes } from "@wc-toolkit/dotnet-tools";
import {
  dotnetTypesAnalyzerPlugin,
  dotnetTypesGeneratorPlugin,
} from "@wc-toolkit/dotnet-tools/plugin";
import { generateTagHelpers } from "@wc-toolkit/dotnet-tools/tag-helpers";
import { generateBlazorComponents } from "@wc-toolkit/dotnet-tools/blazor";
```

## Options and behavior

The main API accepts a parsed CEM object. It creates a temporary project, generates the
source files, builds an RCL, and packs it into a `.nupkg` file. This package never publishes
to a NuGet feed; publishing remains under the component library maintainer's control.

The default output directory is `.cem-dotnet-publish/<packageId>`. Set `outdir` to control
where generated files and the package output are written. Each run removes and recreates
that directory.

The result includes:

- `projectDir`: generated RCL directory.
- `nupkgPath`: path to the packed NuGet package.
- `tagHelperFileCount` and `blazorFileCount`: generated source-file counts.

`packDotNetTypes` resolves to `undefined` when `skip: true` is set.

Set `pack: false` to generate the RCL project and its files without running `dotnet restore`,
`dotnet build`, or `dotnet pack`. The result still includes `projectDir` and generated file counts,
but has no `nupkgPath`. This option also works with either plugin.

Set `tagHelpers: false` or `blazor: false` to generate only one output kind. At least one must
remain enabled; disabling both throws.

## Options

Only `manifest`, `packageId`, `namespace`, and `version` are required. These options apply to
`packDotNetTypes` and to both plugins.

| Option               | Default                           | Purpose                                                                                         |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `manifest`           | required                          | Parsed Custom Elements Manifest to generate from. Not accepted by the plugins.                  |
| `packageId`          | required                          | NuGet package ID.                                                                               |
| `namespace`          | required                          | Namespace for generated C# and Razor types.                                                     |
| `version`            | required                          | Version to include in the package.                                                              |
| `outdir`             | `.cem-dotnet-publish/<packageId>` | Output directory for the generated RCL and package.                                             |
| `typeSrc`            | `parsedType`                      | CEM property to read types from. Falls back to `parsedType`, then `type`.                       |
| `exclude`            | `[]`                              | Component declaration names to omit from generation.                                            |
| `skip`               | `false`                           | Skips generation and packing entirely.                                                          |
| `pack`               | `true`                            | Creates the `.nupkg` after generation; set to `false` to leave the generated project un-packed. |
| `debug`              | `false`                           | Logs resolved options and each generated file.                                                  |
| `tagHelpers`         | `true`                            | Generate Tag Helpers into `TagHelpers/`.                                                        |
| `blazor`             | `true`                            | Generate Blazor component wrappers into `Blazor/`.                                              |
| `targetFramework`    | `net8.0`                          | Target framework for the generated project.                                                     |
| `emitEnumsForUnions` | `true`                            | Emits C# enums for string-literal unions in Tag Helpers.                                        |
| `validateParity`     | `true`                            | Fails generation when a CEM member is missing from the Blazor model.                            |
| `formValueMembers`   | `["value", "checked"]`            | Attribute/member names that represent live form values.                                         |
| `slotWrapperTag`     | `"span"`                          | Element wrapping named slot content; `null` emits no wrapper.                                   |
| `booleanOffValue`    | `"false"`                         | Attribute value written for an off tri-state boolean.                                           |
| `staticAssets`       | `[]`                              | Files or directories to copy into the generated package's `wwwroot/`.                           |

## Publishing to NuGet

`@wc-toolkit/dotnet-tools` only generates and packs the project. Publish the resulting package
from your own release workflow so your team controls when and where it is released. The pack
result's `nupkgPath` identifies the package; for example:

```sh
dotnet nuget push \
  .cem-dotnet-publish/Acme.Components/out/Acme.Components.1.0.0.nupkg \
  --api-key "$NUGET_API_KEY" \
  --source "https://api.nuget.org/v3/index.json" \
  --skip-duplicate
```

For a private feed, pass its URL to `--source`. Store credentials in your CI secret store, not
in source control or the generator config. Run the push as a separate, release-gated CI step
after generation and package validation.

NuGet does not universally require license metadata, but Microsoft recommends including an SPDX
license expression or a license file. NuGet.org may display packages without license metadata as
unlicensed, and private feeds can impose their own rules. When bundling third-party assets, retain
any required license and notice files and make sure the package's licensing accurately covers its
contents. This generator does not currently set NuGet license metadata.

### Waiting for package generation

The generator's `afterGenerate` and the analyzer's `packageLinkPhase` hooks are synchronous, so
the plugins queue package generation in the background and log the result. Build tools do not wait for
that work, and the process may exit before the package is written.

Use the plugin route for local or watch builds where a staged package is enough. For release
builds, call the API programmatically and `await packDotNetTypes(...)` as shown above.

If you drive generation yourself and still want the plugin interface, wait on the plugin:

```ts
const dotnetTypes = dotnetTypesGeneratorPlugin({
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
});

const manifest = generateCem({
  plugins: [dotnetTypes],
});

await dotnetTypes.flush();
```

`flush()` resolves with every queued `PackDotNetResult` and rejects if package generation failed.
Packages are generated one at a time, so watch rebuilds do not collide in the shared output directory
(`outdir`).

## Generated output

For every custom element declaration with `customElement: true` and a `tagName`, the
generator creates:

```text
<outdir>
  <packageId>.csproj
  build/<packageId>.props
  wwwroot/customElementInterop.js
  TagHelpers/<ElementName>TagHelper.cs
  Blazor/<ElementName>.razor
  Blazor/<ElementName>.razor.cs
  Blazor/CustomEventArgs.cs
  Blazor/GeneratedComponentBase.cs
  Blazor/GeneratedInputBase.cs
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

When a manifest includes an extension type field such as `parsedType`, generation prefers
`parsedType` automatically and falls back to `type`. Set `typeSrc` on `packDotNetTypes`,
`generateTagHelpers`, or `generateBlazorComponents` to prefer another field; the fallback order
remains the configured field, `parsedType`, then `type`.

Optional primitive defaults are emitted as Blazor parameter initializers. Arrays map to nullable
`IReadOnlyList<T>` values.

A `boolean` attribute whose declared default is `true` is generated as a tri-state `bool?` instead
of `bool`, and false is written out as an explicit attribute value. Omitting a boolean attribute
leaves the element's own default in place, so a plain `bool` cannot turn off an attribute that the
element enables by default. True is written as bare presence, which every boolean attribute reads
as on. The off value defaults to `"false"`, matching the HTML convention for enumerated boolean
attributes such as `spellcheck`; set `booleanOffValue` to `"off"` for element libraries that spell
it that way.

Numeric attribute values are always formatted with the invariant culture, so a host application
running under a comma-decimal locale still emits `2.5` rather than `2,5`.

Inline object shapes such as `{ side: string; offset?: number }` generate a shared record in
`BlazorTypes.cs` and are used as the parameter or return type for object-valued attributes, method
parameters, and method returns. Method return records are wrapped in `Task<T?>`. Object and event
detail fields are nullable, since the manifest does not guarantee the property is present on the
wire. Shapes that are not inline object literals, such as named interfaces or unions, still map to
`JsonElement?` so that interop stays lossless.

Set `formValueMembers` to choose which attributes identify the live value of a form-associated
element. It defaults to `["value", "checked"]`; set it when an element exposes its value under
another name. Components inferred as inputs derive from `GeneratedInputBase<TValue>`, support
`@bind-Value` and `EditContext` validation, and expose `SetElementValidityAsync` and
`ResetElementValidityAsync` on the generated base classes.

A form control's value event is routed through `HandleValueChanged` rather than bound straight to
your callback, so the element's value is read back into the bound value before your callback runs.
`change` is preferred when the element declares both; an element that only declares `input` binds
through `input` instead. The generated `HandleValueChanged` override forwards to your `OnChange` or
`OnInput` callback after updating the value.

Controls that declare both events also expose `Immediate`. It is `false` by default, which binds on
`change` and commits when the element fires it, typically on blur. Set it to `true` to bind on every
keystroke instead, so the model stays current while the user types:

```razor
<wa-input @bind-Value="_query" Immediate />
```

Your `OnInput` callback still runs either way, and always after the value has been updated, so it is
not skipped just because the value came from the same event. `Immediate` is only generated when the
element declares both events; with only `input` there is no other event to choose between, so the
value is always read from `input`.

Collection-valued attributes are emitted as JSON. A collection's `ToString` yields the CLR type
name rather than its contents, so serializing is what makes a `string[]` attribute usable.

### Member visibility

Members marked `private` or `protected` in the manifest are treated as implementation details and
are never generated. This applies to Blazor wrapper methods, Tag Helper attributes derived from
members, form-associated detection, and parity validation, so internal helpers such as
`handleTriggerClick` or `animateCollapse` do not become public API on the generated components.

A member with no `privacy` is generated. Many manifests only annotate visibility on some members,
so an unannotated member is treated as part of the public surface rather than silently dropped.

## Consume the generated NuGet package

Install the generated package in an ASP.NET Core or Blazor application:

```sh
dotnet add package Acme.Components --version 1.0.0
```

The generated package does not replace the Web Component JavaScript. Load the JavaScript
that defines your custom elements in the host application before rendering them.

### Include web-component assets

To distribute built JavaScript, CSS, or other static files in the NuGet package, pass them with
`staticAssets`. Source paths are resolved from the current working directory. Directories are
copied recursively; `destination` is relative to the generated project's `wwwroot/` and defaults
to the source's basename.

```ts
await packDotNetTypes({
  manifest,
  packageId: "Acme.Components",
  namespace: "Acme.Components",
  version: "1.0.0",
  staticAssets: [
    {
      source: "node_modules/@acme/elements/dist",
      destination: "acme-elements",
    },
  ],
});
```

The selected files are packed as Razor Class Library static web assets. Once the NuGet package
is referenced by an ASP.NET Core or Blazor app, include the assets from the host page using the
package ID in the `_content` path:

```html
<link
  rel="stylesheet"
  href="_content/Acme.Components/acme-elements/elements.css"
/>
<script
  type="module"
  src="_content/Acme.Components/acme-elements/index.js"
></script>
```

Adjust those paths to match the files in the source directory. This makes the assets available
from the package; it does not automatically add script or stylesheet tags to the consuming app.
Include any runtime dependencies the assets need, and check their licenses and redistribution
requirements before bundling them.

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

Components for elements with slots expose `ChildContent`. Each named slot is rendered only when
content is supplied for it, so an unused slot does not leave an empty element assigned to it. Named
slot content is wrapped in an element that carries the `slot` attribute, because a `RenderFragment`
cannot hold attributes itself. The wrapper is a `<span>` by default, which suits inline slot
content such as icons or labels. Set `slotWrapperTag` to `"div"` for block-oriented slots, or
`null` to emit no wrapper at all so callers can supply their own element with the `slot`
attribute:

```razor
@* slotWrapperTag: null — caller controls the slot element *@
<AcmeCard>
    <FooterContent>
        <div slot="footer">Page controls</div>
    </FooterContent>
</AcmeCard>
```

Keep the wrapper inline when slot content is inline. A block element such as `<div>` is invalid
inside a `<span>`, and under static server-side rendering the browser re-parses the output and
implicitly closes the `<span>`, so the `slot` attribute is lost and the content lands in the
default slot instead.

Components for elements with custom events implement async disposal and unregister their
JavaScript listeners when removed. Elements with a `formAssociated` member and a `value` attribute
generate an
`InputBase<T>` wrapper with `Value` binding when they also expose a `change` or `input` event.
Elements with a `formAssociated` member and a `checked` attribute use the same mechanism for
Boolean controls. CEM method members generate `Task` methods that invoke the underlying
custom-element method; missing return types generate `Task` methods. All wrappers inherit a
generated shared base that provides arbitrary attributes, class/style parameters, lifecycle
event wiring, and JavaScript method invocation.

Standard DOM events use Blazor event argument types and remain on the Razor element directly;
other CEM events use the shared custom-event interop. Libraries that need SSR slot-presence
hints may provide the nonstandard extension `ssr.slotPresenceHints` in a declaration, for
example `{ "ssr": { "slotPresenceHints": ["start"] } }`, which generates a `WithStart`
parameter and matching `with-start` attribute.

## Direct generation APIs

Use the lower-level exports when you already manage the .NET project yourself:

```ts
const tagHelpers = generateTagHelpers(manifest, {
  outdir: "./generated/TagHelpers",
  namespace: "Acme.Components",
  emitEnumsForUnions: true,
  typeSrc: "parsedType",
  booleanOffValue: "false",
});

const blazor = generateBlazorComponents(manifest, {
  outdir: "./generated/Blazor",
  namespace: "Acme.Components",
  typeSrc: "parsedType",
  formValueMembers: ["value", "checked"],
  slotWrapperTag: "span",
  booleanOffValue: "false",
  validateParity: true,
});
```

`scaffoldCombinedProject` creates the RCL project structure, while `packNuGetPackage` restores,
builds, and packs an already-scaffolded project. These functions are
also exported from the package root.

### Validate CEM parity

Use `findBlazorParityIssues` in generator tests or CI to detect CEM members that are missing
from the normalized Blazor model:

```ts
import { findBlazorParityIssues } from "@wc-toolkit/dotnet-tools";

const issues = findBlazorParityIssues(manifest);
if (issues.length > 0) {
  throw new Error(issues.map((issue) => issue.message).join("\n"));
}
```

The validator checks attributes, slots, events, and method members. It complements, rather
than replaces, compiling a generated RCL because it validates API coverage before rendering.

## Limitations

- Only custom element declarations with a `tagName` are generated.
- Attribute/property type mapping is intentionally conservative; unknown types become `string?`.
- Records are generated for inline object literals only. Named types such as interfaces, unions,
  or referenced classes are not resolved, so those attributes, method parameters, and returns
  still use `JsonElement?`.
- Event details that are not inline object literals fall back to an untyped `CustomEventArgs`.

### Extending generated components

Generated Blazor components are `public partial class`, so semantic helpers that a manifest
cannot express can be added in a separate file without forking the generator. The generated base
classes expose `protected ElementReference Element`, `protected IJSRuntime JS`, and
`protected Task InvokeVoidMethodAsync/InvokeMethodAsync` for calling element methods:

```csharp
namespace Acme.Components;

public partial class WaInput
{
    [Parameter] public decimal? MinDecimal { get; set; }

    public async Task FocusAsync()
    {
        await InvokeVoidMethodAsync("focus", []);
    }
}
```

This is the right place for logic like typed union accessors or imperative DOM helpers, which are
too domain-specific to generate.

- A member with no `privacy` is treated as public, so manifests that annotate visibility only
  partially will still expose some internal helpers.
- The generated components are `public partial class`, so you can add your own partials to extend
  behavior (e.g. typed convenience accessors for union types, or imperative helpers). The base
  classes expose `Element` (protected), `JS`, and interop helpers you can call from those partials.
- Numeric attribute values are emitted with the invariant culture; boolean attributes whose element
  default is true use an explicit off value configurable via `booleanOffValue`.
- The generator does not load Web Component JavaScript or validate that the generated package matches a live component implementation.
- The generated project currently references ASP.NET Core component packages aligned with .NET 8. Select and verify a different target framework before using one.

## License

This project is available under the [MIT License](LICENSE).
