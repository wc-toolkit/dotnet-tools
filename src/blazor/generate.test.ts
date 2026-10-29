import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CemPackage } from "../shared/cem-types.js";
import { generateBlazorComponents } from "./generate.js";

const outputDirectories: string[] = [];

afterEach(() => {
  for (const directory of outputDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createOutputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dotnet-tools-test-"));
  outputDirectories.push(directory);
  return directory;
}

const manifest: CemPackage = {
  schemaVersion: "1.0.0",
  modules: [
    {
      path: "components.ts",
      declarations: [
        {
          kind: "class",
          name: "DatePicker",
          customElement: true,
          tagName: "acme-date-picker",
          description: "Select a date.",
          attributes: [
            { name: "disabled", type: { text: "boolean" } },
            { name: "size", type: { text: '"small" | "large"' }, default: "small" },
          ],
          events: [{ name: "date-changed", description: "Emitted when the date changes." }],
          slots: [{ name: "default" }],
        },
      ],
    },
  ],
};

describe("generateBlazorComponents", () => {
  it("generates markup, parameters, slots, and event interop", () => {
    const outdir = createOutputDirectory();
    const generated = generateBlazorComponents(manifest, {
      outdir,
      namespace: "Acme.Components",
    });
    const markup = readFileSync(join(outdir, "AcmeDatePicker.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeDatePicker.razor.cs"), "utf8");

    expect(generated.map((file) => file.fileName)).toEqual([
      "CustomEventArgs.cs",
      "GeneratedComponentBase.cs",
      "GeneratedInputBase.cs",
      "BlazorTypes.cs",
      "AcmeDatePicker.razor",
      "AcmeDatePicker.razor.cs",
    ]);
    expect(markup).toContain('<acme-date-picker @ref="Element"');
    expect(markup).toContain(
      'size="@RenderAttribute("size", GeneratedTypeConversions.ToAttributeValue(Size), "small")"',
    );
    expect(markup).toContain("@ChildContent");
    // A default-only component has no named slot wrappers to guard.
    expect(markup).not.toContain("@if (");
    expect(markup).not.toContain("<span slot=");
    expect(codeBehind).toContain("public bool Disabled { get; set; }");
    expect(codeBehind).toContain("public AcmeDatePickerSizeValue? Size { get; set; } = default;");
    expect(codeBehind).toContain("public EventCallback<CustomEventArgs> OnDateChanged");
    expect(codeBehind).toContain("<summary>Emitted when the date changes.</summary>");
    expect(codeBehind).toContain('EventNames => new[] { "date-changed" }');
    expect(codeBehind).toContain("GeneratedComponentBase");
  });

  it("does not add parameters that are absent from the manifest", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Spinner",
                customElement: true,
                tagName: "acme-spinner",
                attributes: [{ name: "dir", type: { text: "string" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const codeBehind = readFileSync(join(outdir, "AcmeSpinner.razor.cs"), "utf8");

    expect(codeBehind).toContain("public string? Dir { get; set; } = default;");
    expect(codeBehind).not.toContain("public string? Label");
  });

  it("generates named slots and native Blazor event types", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Button",
                customElement: true,
                tagName: "acme-button",
                events: [
                  { name: "click" },
                  { name: "pointerdown" },
                  { name: "paste" },
                  { name: "acme-action", detail: { text: "{ selected: string; count: number }" } },
                  {
                    name: "acme-type",
                    type: { text: "CustomEvent<{ meta: { id: number }; labels: string[] }>" },
                  },
                ],
                slots: [{ name: "" }, { name: "start" }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeButton.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeButton.razor.cs"), "utf8");
    const types = readFileSync(join(outdir, "BlazorTypes.cs"), "utf8");

    expect(markup).toContain('@onclick="OnClick"');
    expect(markup).toContain('@onpointerdown="OnPointerdown"');
    expect(markup).toContain('@onpaste="OnPaste"');
    expect(markup).toContain('<span slot="start">@StartContent</span>');
    expect(markup).toContain("@if (StartContent is not null)");
    expect(codeBehind).toContain("RenderFragment? StartContent");
    expect(codeBehind).toContain("EventCallback<MouseEventArgs> OnClick");
    expect(codeBehind).toContain("EventCallback<PointerEventArgs> OnPointerdown");
    expect(codeBehind).toContain("EventCallback<ClipboardEventArgs> OnPaste");
    expect(codeBehind).toContain("EventCallback<AcmeButtonAcmeActionEventArgs> OnAcmeAction");
    expect(codeBehind).toContain("AcmeButtonAcmeActionEventArgs");
    expect(codeBehind).toContain('EventNames => new[] { "acme-action", "acme-type" }');
    expect(types).toContain("JsonElement? Meta");
    expect(types).toContain("IReadOnlyList<string?>? Labels");
  });

  it("wraps named slots with a configurable element", () => {
    const manifestWithSlots: CemPackage = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            {
              kind: "class",
              name: "Button",
              customElement: true,
              tagName: "acme-button",
              slots: [{ name: "" }, { name: "start" }],
            },
          ],
        },
      ],
    };

    const asSpan = createOutputDirectory();
    generateBlazorComponents(manifestWithSlots, {
      outdir: asSpan,
      namespace: "Acme.Components",
    });
    const spanMarkup = readFileSync(join(asSpan, "AcmeButton.razor"), "utf8");
    expect(spanMarkup).toContain('<span slot="start">@StartContent</span>');

    const asDiv = createOutputDirectory();
    generateBlazorComponents(manifestWithSlots, {
      outdir: asDiv,
      namespace: "Acme.Components",
      slotWrapperTag: "div",
    });
    const divMarkup = readFileSync(join(asDiv, "AcmeButton.razor"), "utf8");
    expect(divMarkup).toContain('<div slot="start">@StartContent</div>');
    expect(divMarkup).not.toContain("<span slot=");
    // The conditional guard applies in every mode.
    expect(divMarkup).toContain("@if (StartContent is not null)");
    // The default slot never gets a wrapper.
    expect(divMarkup).toContain("@ChildContent");
    expect(divMarkup).not.toContain('<div slot="">');

    const unwrapped = createOutputDirectory();
    generateBlazorComponents(manifestWithSlots, {
      outdir: unwrapped,
      namespace: "Acme.Components",
      slotWrapperTag: null,
    });
    const bareMarkup = readFileSync(join(unwrapped, "AcmeButton.razor"), "utf8");
    expect(bareMarkup).toContain("@StartContent");
    expect(bareMarkup).not.toContain("<span slot=");
    expect(bareMarkup).not.toContain("<div slot=");
    expect(bareMarkup).toContain("@if (StartContent is not null)");
  });

  it("rejects an invalid slot wrapper tag", () => {
    const outdir = createOutputDirectory();

    expect(() =>
      generateBlazorComponents(manifest, {
        outdir,
        namespace: "Acme.Components",
        slotWrapperTag: 'span onload="alert(1)"',
      }),
    ).toThrow(/Invalid slotWrapperTag/);
  });

  it("makes a boolean that defaults to true tri-state so false can be written", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Toggle",
                customElement: true,
                tagName: "acme-toggle",
                attributes: [
                  { name: "spellcheck", type: { text: "boolean" }, default: "true" },
                  { name: "disabled", type: { text: "boolean" }, default: "false" },
                ],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeToggle.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeToggle.razor.cs"), "utf8");

    // Omitting the attribute would leave the element's own default (on) in place, so false is
    // written out explicitly instead of being unrepresentable.
    expect(markup).toContain(
      'spellcheck="@RenderOnOffAttribute("spellcheck", Spellcheck, "false")"',
    );
    expect(codeBehind).toContain("[Parameter] public bool? Spellcheck { get; set; }");
    // A boolean that defaults to off keeps plain presence rendering.
    expect(markup).toContain('disabled="@RenderAttribute("disabled", Disabled, false)"');
    expect(codeBehind).toContain("[Parameter] public bool Disabled { get; set; } = false;");
  });

  it("honours a configured boolean off value", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Toggle",
                customElement: true,
                tagName: "acme-toggle",
                attributes: [{ name: "spellcheck", type: { text: "boolean" }, default: "true" }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components", booleanOffValue: "off" },
    );

    const markup = readFileSync(join(outdir, "AcmeToggle.razor"), "utf8");
    expect(markup).toContain('spellcheck="@RenderOnOffAttribute("spellcheck", Spellcheck, "off")"');
  });

  it("wires the value round-trip through HandleValueChanged, not straight to the callback", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "FormControl",
                customElement: true,
                tagName: "acme-form-control",
                attributes: [{ name: "value", type: { text: "string" } }],
                events: [{ name: "change" }, { name: "input" }],
                members: [{ kind: "field", name: "formAssociated", type: { text: "boolean" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeFormControl.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeFormControl.razor.cs"), "utf8");
    const inputBase = readFileSync(join(outdir, "GeneratedInputBase.cs"), "utf8");

    // Every link in the chain has to hold, or the bound value never updates from the element.
    // 1. The event must reach HandleValueChanged. Binding it straight to OnChange skips the read-back.
    expect(markup).toContain('@onchange="HandleValueChanged"');
    expect(markup).not.toContain('@onchange="OnChange"');
    // 2. The override must read the value back before forwarding to the user's callback. This
    // element declares both events, so the read is gated on Immediate.
    expect(codeBehind).toContain("if (!Immediate) await base.HandleValueChanged(args);");
    expect(codeBehind).toContain("await OnChange.InvokeAsync(args);");
    // 3. The base must be what assigns the bound value.
    expect(inputBase).toContain("CurrentValueAsString = args.Value?.ToString();");
  });

  it("lets Immediate choose which event carries the value", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "FormControl",
                customElement: true,
                tagName: "acme-form-control",
                attributes: [{ name: "value", type: { text: "string" } }],
                events: [{ name: "change" }, { name: "input" }],
                members: [{ kind: "field", name: "formAssociated", type: { text: "boolean" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeFormControl.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeFormControl.razor.cs"), "utf8");
    const inputBase = readFileSync(join(outdir, "GeneratedInputBase.cs"), "utf8");

    expect(inputBase).toContain("[Parameter] public bool Immediate { get; set; }");
    // Both events are routed through a handler that consults Immediate, so exactly one of them
    // reads the value back. Whichever it is, the caller's callback still runs.
    expect(markup).toContain('@onchange="HandleValueChanged"');
    expect(markup).toContain('@oninput="HandleInputEvent"');
    expect(codeBehind).toContain("if (!Immediate) await base.HandleValueChanged(args);");
    expect(codeBehind).toContain("if (Immediate) await base.HandleValueChanged(args);");
    expect(codeBehind).toContain("await OnChange.InvokeAsync(args);");
    expect(codeBehind).toContain("await OnInput.InvokeAsync(args);");
  });

  it("omits Immediate for an element that declares only input", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Typing",
                customElement: true,
                tagName: "acme-typing",
                attributes: [{ name: "value", type: { text: "string" } }],
                events: [{ name: "input" }],
                members: [{ kind: "field", name: "formAssociated", type: { text: "boolean" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeTyping.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeTyping.razor.cs"), "utf8");

    // input is the only event that can carry the value, so there is no choice to expose.
    expect(markup).toContain('@oninput="HandleValueChanged"');
    expect(markup).not.toContain("HandleInputEvent");
    expect(codeBehind).not.toContain("Immediate");
    expect(codeBehind).toContain(
      "await base.HandleValueChanged(args);\n        await OnInput.InvokeAsync(args);",
    );
  });

  it("binds the value on input when the element has no change event", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Typing",
                customElement: true,
                tagName: "acme-typing",
                attributes: [{ name: "value", type: { text: "string" } }],
                events: [{ name: "input" }],
                members: [{ kind: "field", name: "formAssociated", type: { text: "boolean" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeTyping.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeTyping.razor.cs"), "utf8");

    expect(markup).toContain('@oninput="HandleValueChanged"');
    expect(codeBehind).toContain("await OnInput.InvokeAsync(args);");
  });

  it("leaves non-form components bound directly to their callbacks", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Button",
                customElement: true,
                tagName: "acme-button",
                events: [{ name: "change" }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeButton.razor"), "utf8");
    expect(markup).toContain('@onchange="OnChange"');
    expect(markup).not.toContain("HandleValueChanged");
  });

  it("generates form binding and typed methods from CEM members", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "FormControl",
                customElement: true,
                tagName: "acme-form-control",
                attributes: [{ name: "value", type: { text: "string" } }],
                events: [{ name: "change" }],
                members: [
                  { kind: "field", name: "formAssociated", type: { text: "boolean" } },
                  {
                    kind: "method",
                    name: "focus",
                    parameters: [{ name: "select", parsedType: "boolean", optional: true }],
                    return: { type: { text: "void" } },
                  },
                  {
                    kind: "method",
                    name: "get-value",
                    return: { parsedType: { text: "number" } },
                  },
                ],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const markup = readFileSync(join(outdir, "AcmeFormControl.razor"), "utf8");
    const codeBehind = readFileSync(join(outdir, "AcmeFormControl.razor.cs"), "utf8");

    expect(markup).toContain('value="@CurrentValueAsString"');
    expect(markup).toContain('@onchange="HandleValueChanged"');
    expect(codeBehind).toContain(
      "public partial class AcmeFormControl : GeneratedInputBase<string?>",
    );
    expect(codeBehind).toContain("public Task FocusAsync(bool select = default)");
    expect(codeBehind).toContain('InvokeVoidMethodAsync("focus", new object?[] { select })');
    expect(codeBehind).toContain("public Task<double?> GetValueAsync()");
    expect(codeBehind).toContain('InvokeMethodAsync<double?>("get-value", new object?[] {  })');
  });

  it("honors configured form value members", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Editor",
                customElement: true,
                tagName: "acme-editor",
                attributes: [
                  { name: "value", type: { text: "string" } },
                  { name: "selection-range", type: { text: "string" } },
                ],
                events: [{ name: "change" }],
                members: [{ kind: "field", name: "formAssociated", type: { text: "boolean" } }],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components", formValueMembers: ["selection-range"] },
    );

    const codeBehind = readFileSync(join(outdir, "AcmeEditor.razor.cs"), "utf8");

    expect(codeBehind).toContain("GeneratedInputBase<string?>");
    expect(codeBehind).toContain('LiveValuePropertyName => "selection-range"');
    expect(codeBehind).not.toContain('LiveValuePropertyName => "value"');
  });

  it("generates records for object attributes, method parameters, and returns", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Panel",
                customElement: true,
                tagName: "acme-panel",
                attributes: [
                  { name: "placement", type: { text: "{ side: string; offset?: number }" } },
                ],
                events: [{ name: "ready", type: { text: "CustomEvent<{ count: number }>" } }],
                members: [
                  {
                    kind: "method",
                    name: "render-item",
                    parameters: [{ name: "options", type: { text: "{ index: number }" } }],
                    return: { type: { text: "void" } },
                  },
                  {
                    kind: "method",
                    name: "measure",
                    return: { type: { text: "{ width: number; height: number }" } },
                  },
                ],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const codeBehind = readFileSync(join(outdir, "AcmePanel.razor.cs"), "utf8");
    const types = readFileSync(join(outdir, "BlazorTypes.cs"), "utf8");

    expect(codeBehind).toContain("public AcmePanelPlacementValue? Placement { get; set; }");
    expect(codeBehind).toContain(
      "public Task RenderItemAsync(AcmePanelRenderItemOptions? options)",
    );
    expect(codeBehind).toContain("public Task<AcmePanelMeasureResult?> MeasureAsync()");
    expect(codeBehind).toContain(
      'InvokeMethodAsync<AcmePanelMeasureResult?>("measure", new object?[] {  })',
    );

    // Object shapes are plain records, not event argument wrappers.
    expect(types).toContain(
      "public sealed class AcmePanelPlacementValue\n{\n    public string? Side { get; set; }\n    public double? Offset { get; set; }\n}",
    );
    expect(types).toContain("public sealed class AcmePanelRenderItemOptions");
    expect(types).toContain("public sealed class AcmePanelMeasureResult");
    expect(types).not.toContain("public sealed class AcmePanelPlacementValue : CustomEventArgs");

    // Event detail shapes keep the CustomEventArgs wrapper.
    expect(types).toContain("public sealed class AcmePanelReadyEventArgs : CustomEventArgs");
    expect(types).toContain("public sealed class AcmePanelReadyEventArgsDetail");
  });

  it("excludes private and protected members", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(
      {
        schemaVersion: "1.0.0",
        modules: [
          {
            path: "components.ts",
            declarations: [
              {
                kind: "class",
                name: "Widget",
                customElement: true,
                tagName: "acme-widget",
                attributes: [{ name: "label", type: { text: "string" } }],
                members: [
                  {
                    kind: "method",
                    name: "open",
                    privacy: "public",
                    return: { type: { text: "void" } },
                  },
                  { kind: "method", name: "reset", return: { type: { text: "void" } } },
                  {
                    kind: "method",
                    name: "internalHelper",
                    privacy: "private",
                    return: { type: { text: "void" } },
                  },
                  {
                    kind: "method",
                    name: "onSlotChange",
                    privacy: "protected",
                    return: { type: { text: "void" } },
                  },
                  {
                    kind: "field",
                    name: "formAssociated",
                    privacy: "private",
                    type: { text: "boolean" },
                  },
                ],
              },
            ],
          },
        ],
      },
      { outdir, namespace: "Acme.Components" },
    );

    const codeBehind = readFileSync(join(outdir, "AcmeWidget.razor.cs"), "utf8");

    expect(codeBehind).toContain("public Task OpenAsync()");
    expect(codeBehind).toContain("public Task ResetAsync()");
    expect(codeBehind).not.toContain("InternalHelperAsync");
    expect(codeBehind).not.toContain("OnSlotChangeAsync");
    // A private formAssociated field must not turn this into an input.
    expect(codeBehind).toContain("GeneratedComponentBase");
    expect(codeBehind).not.toContain("GeneratedInputBase");
  });

  it("gives generated inputs a default ValueExpression so they render without bind-Value", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(manifest, { outdir, namespace: "Acme.Components" });

    const inputBase = readFileSync(join(outdir, "GeneratedInputBase.cs"), "utf8");

    // InputBase throws unless ValueExpression is set; Blazor only supplies it for bind-Value.
    expect(inputBase).toMatch(/protected GeneratedInputBase\(\)/);
    expect(inputBase).toContain("ValueExpression = () => _valueExpressionAnchor;");
    // FieldIdentifier.Create rejects constant expressions, so the fallback must be a member access.
    expect(inputBase).toContain("private TValue _valueExpressionAnchor = default!;");
    expect(inputBase).not.toContain("ValueExpression = () => default");
  });

  it("exposes element validity helpers on the shared bases", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(manifest, { outdir, namespace: "Acme.Components" });

    const componentBase = readFileSync(join(outdir, "GeneratedComponentBase.cs"), "utf8");
    const inputBase = readFileSync(join(outdir, "GeneratedInputBase.cs"), "utf8");

    for (const source of [componentBase, inputBase]) {
      expect(source).toContain("public Task SetElementValidityAsync(string message)");
      expect(source).toContain("public Task ResetElementValidityAsync()");
      expect(source).toContain('"setCustomValidity"');
      expect(source).toContain('"resetValidity"');
    }
  });

  it("exposes the on/off attribute helper on both shared bases", () => {
    const outdir = createOutputDirectory();
    generateBlazorComponents(manifest, { outdir, namespace: "Acme.Components" });

    for (const fileName of ["GeneratedComponentBase.cs", "GeneratedInputBase.cs"]) {
      const source = readFileSync(join(outdir, fileName), "utf8");
      expect(source).toContain(
        "protected object? RenderOnOffAttribute(string name, bool? value, string offValue)",
      );
      expect(source).toContain("if (value.Value) return true;");
      expect(source).toContain("return offValue;");
    }
  });
});
