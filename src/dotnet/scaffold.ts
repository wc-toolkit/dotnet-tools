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

  writeBlazorSupportFiles(join(projectDir, "Blazor"), namespace);

  writeFileSync(join(projectDir, "_ViewImportsExample.txt"), renderViewImportsNote(namespace));
}

export function writeBlazorSupportFiles(outputDir: string, namespace: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "CustomEventArgs.cs"), renderCustomEventArgs(namespace));
  writeFileSync(join(outputDir, "GeneratedComponentBase.cs"), renderComponentBase(namespace));
  writeFileSync(join(outputDir, "GeneratedInputBase.cs"), renderInputBase(namespace));
}

function renderComponentBase(namespace: string): string {
  return `using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
using System.Collections.Generic;
using System.Text.Json;

namespace ${namespace};

public abstract class GeneratedComponentBase : ComponentBase, IAsyncDisposable
{
    [Inject] protected IJSRuntime JS { get; set; } = default!;

    [Parameter(CaptureUnmatchedValues = true)]
    public IReadOnlyDictionary<string, object>? AdditionalAttributes { get; set; }

    [Parameter] public string? Class { get; set; }

    [Parameter] public string? Style { get; set; }

    protected ElementReference Element { get; set; }

    private readonly HashSet<string> _renderedAttributes = new(StringComparer.Ordinal);

    protected object? RenderAttribute(string name, object? value, object? defaultValue = null)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            return value;
        }

        return _renderedAttributes.Contains(name) ? defaultValue : null;
    }

    /// <summary>
    /// Writes a boolean attribute that the element defaults to on, so false has to be stated
    /// explicitly: omitting the attribute would leave the element's own default in place.
    /// True is written as bare presence, which every boolean attribute reads as on.
    /// </summary>
    /// <param name="name">The attribute name.</param>
    /// <param name="value">The parameter value, or null to leave the attribute to the element.</param>
    /// <param name="offValue">Attribute text that the element reads as false.</param>
    protected object? RenderOnOffAttribute(string name, bool? value, string offValue)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            if (value.Value) return true;
            return offValue;
        }

        // Reverting to null after the attribute was written restores the element's default, which is on.
        return _renderedAttributes.Contains(name) ? true : null;
    }

    /// <summary>
    /// Writes a collection-valued attribute as JSON. A collection's ToString yields the CLR type
    /// name rather than its contents, so it is serialized instead.
    /// </summary>
    /// <param name="name">The attribute name.</param>
    /// <param name="value">The collection, or null to leave the attribute to the element.</param>
    /// <param name="defaultValue">Attribute text to restore once the attribute has been written.</param>
    protected string? RenderJsonAttribute(string name, object? value, string? defaultValue = null)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            return JsonSerializer.Serialize(value);
        }

        return _renderedAttributes.Contains(name) ? defaultValue : null;
    }

    protected string? GetCssClass()
        => JoinAttribute("class", Class);

    protected string? GetStyle()
        => JoinAttribute("style", Style);

    private string? JoinAttribute(string name, string? value)
    {
        object? additional = null;
        AdditionalAttributes?.TryGetValue(name, out additional);
        return string.IsNullOrWhiteSpace(additional?.ToString()) ? value : string.IsNullOrWhiteSpace(value?.ToString())
            ? additional?.ToString()
            : $"{additional} {value}";
    }

    protected virtual IReadOnlyList<string> EventNames => Array.Empty<string>();

    private DotNetObjectReference<GeneratedComponentBase>? _selfReference;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        await base.OnAfterRenderAsync(firstRender);
        if (firstRender && EventNames.Count > 0)
        {
            _selfReference = DotNetObjectReference.Create(this);
            await JS.InvokeVoidAsync("customElementInterop.bindEvents", Element, _selfReference, EventNames);
        }
    }

    protected Task InvokeVoidMethodAsync(string methodName, object?[] args)
        => JS.InvokeVoidAsync("customElementInterop.invokeMethod", Element, methodName, args).AsTask();

    protected Task<T> InvokeMethodAsync<T>(string methodName, object?[] args)
        => JS.InvokeAsync<T>("customElementInterop.invokeMethod", Element, methodName, args).AsTask();

    public Task SetElementValidityAsync(string message)
        => InvokeVoidMethodAsync("setCustomValidity", new object?[] { message });

    public Task ResetElementValidityAsync()
        => InvokeVoidMethodAsync("resetValidity", Array.Empty<object?>());

    public async ValueTask DisposeAsync()
    {
        if (_selfReference is not null)
        {
            await JS.InvokeVoidAsync("customElementInterop.unbindEvents", Element);
            _selfReference.Dispose();
        }
    }
}
`;
}

function renderInputBase(namespace: string): string {
  return `using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;
using System.Collections.Generic;
using System.Text.Json;

namespace ${namespace};

public abstract class GeneratedInputBase<TValue> : InputBase<TValue>, IAsyncDisposable
{
    /// <summary>
    /// Placeholder target for the fallback <see cref="ValueExpression"/>. Blazor only supplies
    /// that expression for bind-Value, and FieldIdentifier.Create rejects constant expressions,
    /// so the fallback has to point at a real member.
    /// </summary>
    private TValue _valueExpressionAnchor = default!;

    /// <summary>
    /// InputBase throws unless ValueExpression is set, so a consumer that passes Value or
    /// ValueChanged without bind-Value would otherwise fail to render. Blazor overwrites this
    /// with the real expression whenever bind-Value is used.
    /// </summary>
    protected GeneratedInputBase()
    {
        ValueExpression = () => _valueExpressionAnchor;
    }

    [Inject] protected IJSRuntime JS { get; set; } = default!;

    [Parameter] public string? Class { get; set; }

    [Parameter] public string? Style { get; set; }

    /// <summary>
    /// Binds the value on every keystroke (the input event) instead of only when the change is
    /// committed (the change event, typically on blur), so the model stays current while the user
    /// types. Generated components only expose it when the element declares both events.
    /// </summary>
    [Parameter] public bool Immediate { get; set; }

    protected ElementReference Element { get; set; }

    private readonly HashSet<string> _renderedAttributes = new(StringComparer.Ordinal);

    protected object? RenderAttribute(string name, object? value, object? defaultValue = null)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            return value;
        }

        return _renderedAttributes.Contains(name) ? defaultValue : null;
    }

    /// <summary>
    /// Writes a boolean attribute that the element defaults to on, so false has to be stated
    /// explicitly: omitting the attribute would leave the element's own default in place.
    /// True is written as bare presence, which every boolean attribute reads as on.
    /// </summary>
    /// <param name="name">The attribute name.</param>
    /// <param name="value">The parameter value, or null to leave the attribute to the element.</param>
    /// <param name="offValue">Attribute text that the element reads as false.</param>
    protected object? RenderOnOffAttribute(string name, bool? value, string offValue)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            if (value.Value) return true;
            return offValue;
        }

        // Reverting to null after the attribute was written restores the element's default, which is on.
        return _renderedAttributes.Contains(name) ? true : null;
    }

    /// <summary>
    /// Writes a collection-valued attribute as JSON. A collection's ToString yields the CLR type
    /// name rather than its contents, so it is serialized instead.
    /// </summary>
    /// <param name="name">The attribute name.</param>
    /// <param name="value">The collection, or null to leave the attribute to the element.</param>
    /// <param name="defaultValue">Attribute text to restore once the attribute has been written.</param>
    protected string? RenderJsonAttribute(string name, object? value, string? defaultValue = null)
    {
        if (value is not null)
        {
            _renderedAttributes.Add(name);
            return JsonSerializer.Serialize(value);
        }

        return _renderedAttributes.Contains(name) ? defaultValue : null;
    }

    protected string? GetCssClass()
        => JoinAttribute("class", Class);

    protected string? GetStyle()
        => JoinAttribute("style", Style);

    private string? JoinAttribute(string name, string? value)
    {
        object? additional = null;
        AdditionalAttributes?.TryGetValue(name, out additional);
        return string.IsNullOrWhiteSpace(additional?.ToString()) ? value : string.IsNullOrWhiteSpace(value?.ToString())
            ? additional?.ToString()
            : $"{additional} {value}";
    }

    protected virtual IReadOnlyList<string> EventNames => Array.Empty<string>();

    protected virtual string? LiveValuePropertyName => null;

    private object? _lastLiveValue;
    private bool _hasLiveValue;

    private DotNetObjectReference<GeneratedInputBase<TValue>>? _selfReference;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        await base.OnAfterRenderAsync(firstRender);
        if (firstRender && EventNames.Count > 0)
        {
            _selfReference = DotNetObjectReference.Create(this);
            await JS.InvokeVoidAsync("customElementInterop.bindEvents", Element, _selfReference, EventNames);
        }

        if (LiveValuePropertyName is not null)
        {
            var currentValue = CurrentValue;
            if (firstRender || !_hasLiveValue)
            {
                _lastLiveValue = currentValue;
                _hasLiveValue = true;
            }
            else if (!Equals(_lastLiveValue, currentValue))
            {
                _lastLiveValue = currentValue;
                await JS.InvokeVoidAsync("customElementInterop.syncProperty", Element, LiveValuePropertyName, currentValue);
            }
        }
    }

    protected virtual Task HandleValueChanged(ChangeEventArgs args)
    {
        CurrentValueAsString = args.Value?.ToString();
        return Task.CompletedTask;
    }

    protected Task InvokeVoidMethodAsync(string methodName, object?[] args)
        => JS.InvokeVoidAsync("customElementInterop.invokeMethod", Element, methodName, args).AsTask();

    protected Task<T> InvokeMethodAsync<T>(string methodName, object?[] args)
        => JS.InvokeAsync<T>("customElementInterop.invokeMethod", Element, methodName, args).AsTask();

    public Task SetElementValidityAsync(string message)
        => InvokeVoidMethodAsync("setCustomValidity", new object?[] { message });

    public Task ResetElementValidityAsync()
        => InvokeVoidMethodAsync("resetValidity", Array.Empty<object?>());

    public async ValueTask DisposeAsync()
    {
        if (_selfReference is not null)
        {
            await JS.InvokeVoidAsync("customElementInterop.unbindEvents", Element);
            _selfReference.Dispose();
        }
    }
}
`;
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

  invokeMethod(element, methodName, args) {
    return element[methodName](...(args ?? []));
  },

  syncProperty(element, propertyName, value) {
    if (element[propertyName] !== value) element[propertyName] = value;
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
