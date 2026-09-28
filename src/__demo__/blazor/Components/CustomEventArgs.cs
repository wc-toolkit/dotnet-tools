using System.Text.Json;

namespace WebAwesome.BlazorDemo.Components.Generated;

public class CustomEventArgs
{
    public string Type { get; set; } = string.Empty;

    public JsonElement? Detail { get; set; }
}
