using Bunit;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;
using WebAwesome.BlazorDemo.Components.Generated;
using Xunit;

namespace WebAwesome.BlazorDemo.Tests;

// These tests render the generated components and fire real DOM events, so they cover the wiring
// between the Razor markup and the code-behind. Reading generated text cannot do that: a control
// whose value event was bound straight to the caller's callback satisfied every source-level
// assertion while the bound value never changed.
public class GeneratedInputTests : TestContext
{
    public GeneratedInputTests()
    {
        // The components bind their events through custom element interop after the first render.
        // No browser is involved here, so those calls are allowed to return a default value.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void ChangeEventUpdatesTheBoundValue()
    {
        var component = RenderComponent<WaInput>(parameters => parameters.Add(p => p.Value, "before"));

        component.Find("wa-input").Change("after");

        Assert.Equal("after", component.Instance.Value);
    }

    [Fact]
    public void InputEventIsIgnoredUntilImmediateIsSet()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Value, "before")
            .Add(p => p.Immediate, false));

        component.Find("wa-input").Input("after");

        Assert.Equal("before", component.Instance.Value);
    }

    [Fact]
    public void InputEventUpdatesTheBoundValueWhenImmediateIsSet()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Value, "before")
            .Add(p => p.Immediate, true));

        component.Find("wa-input").Input("after");

        Assert.Equal("after", component.Instance.Value);
    }

    [Fact]
    public void OnInputRunsAfterTheValueHasBeenUpdated()
    {
        var eventValues = new List<string?>();
        var valuesAtCallback = new List<string?>();
        // The callback reads the component's value to confirm the update happened first, which is
        // only observable if it is assigned before the caller's callback runs.
        WaInput? control = null;
        var onInput = EventCallback.Factory.Create<ChangeEventArgs>(
            this,
            (ChangeEventArgs args) =>
            {
                eventValues.Add(args.Value?.ToString());
                valuesAtCallback.Add(control?.Value);
            }
        );

        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Value, "before")
            .Add(p => p.Immediate, true)
            .Add(p => p.OnInput, onInput));
        control = component.Instance;

        component.Find("wa-input").Input("after");

        Assert.Equal("after", Assert.Single(eventValues));
        Assert.Equal("after", Assert.Single(valuesAtCallback));
    }

    [Fact]
    public void OnChangeStillRunsOnCommitWhileImmediateIsSet()
    {
        var calls = 0;
        var onChange = EventCallback.Factory.Create<ChangeEventArgs>(this, (ChangeEventArgs _) => calls++);
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Value, "before")
            .Add(p => p.Immediate, true)
            .Add(p => p.OnChange, onChange));

        var input = component.Find("wa-input");
        input.Input("after");
        input.Change("after");

        // The value was already applied by the keystroke, so commit only reports the change.
        Assert.Equal(1, calls);
        Assert.Equal("after", component.Instance.Value);
    }

    [Fact]
    public void UnrelatedEventsKeepTheirOwnCallback()
    {
        var calls = 0;
        var onFocus = EventCallback.Factory.Create<FocusEventArgs>(this, (FocusEventArgs _) => calls++);
        var component = RenderComponent<WaInput>(parameters => parameters.Add(p => p.OnFocus, onFocus));

        component.Find("wa-input").Focus();

        Assert.Equal(1, calls);
    }

    [Fact]
    public void CollectionAttributesRenderAsJson()
    {
        var component = RenderComponent<WaPopup>(parameters => parameters
            .Add(p => p.FlipBoundary, (IReadOnlyList<string?>)["top", "bottom"]));

        var rendered = component.Find("wa-popup").GetAttribute("flipBoundary");

        Assert.Equal("""["top","bottom"]""", rendered);
    }

    [Fact]
    public void ClearingACollectionAttributeRemovesIt()
    {
        var component = RenderComponent<WaPopup>(parameters => parameters
            .Add(p => p.ShiftBoundary, (IReadOnlyList<string?>)["top"]));

        component.SetParametersAndRender(parameters => parameters.Add(p => p.ShiftBoundary, null));

        Assert.False(component.Find("wa-popup").HasAttribute("shiftBoundary"));
    }

    [Fact]
    public void AnUnsetBooleanIsLeftToTheElement()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Spellcheck, (bool?)null));

        Assert.False(component.Find("wa-input").HasAttribute("spellcheck"));
    }

    [Fact]
    public void TrueRendersAsBarePresence()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Spellcheck, (bool?)true));

        Assert.Equal("", component.Find("wa-input").GetAttribute("spellcheck"));
    }

    [Fact]
    public void FalseRendersExplicitly()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Spellcheck, (bool?)false));

        Assert.Equal("false", component.Find("wa-input").GetAttribute("spellcheck"));
    }

    [Fact]
    public void ClearingABooleanRestoresTheElementDefault()
    {
        var component = RenderComponent<WaInput>(parameters => parameters
            .Add(p => p.Spellcheck, (bool?)false));

        component.SetParametersAndRender(parameters => parameters.Add(p => p.Spellcheck, (bool?)null));

        Assert.Equal("", component.Find("wa-input").GetAttribute("spellcheck"));
    }
}

public class GeneratedDisposeTests : TestContext
{
    public GeneratedDisposeTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public async Task DisposingAnInputUnbindsItsEvents()
    {
        JSInterop
            .SetupVoid("customElementInterop.unbindEvents", _ => true)
            .SetVoidResult();

        var component = RenderComponent<WaInput>();
        await component.Instance.DisposeAsync();

        Assert.Contains(
            JSInterop.Invocations,
            invocation => invocation.Identifier == "customElementInterop.unbindEvents"
        );
    }

    [Fact]
    public async Task DisposingAfterTheCircuitDisconnectsDoesNotThrow()
    {
        // Closing the tab or dropping the network disposes the circuit before the components in it,
        // so the unbind call reaches a runtime that can no longer talk to the browser. That used to
        // surface as an unhandled CircuitHost error on every disconnect.
        JSInterop
            .SetupVoid("customElementInterop.unbindEvents", _ => true)
            .SetVoidResult()
            .SetException(new JSDisconnectedException("The circuit has disconnected."));

        var component = RenderComponent<WaInput>();

        await component.Instance.DisposeAsync();
    }
}
