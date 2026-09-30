---
"@wc-toolkit/dotnet-tools": minor
---

Generate a shared Blazor architecture from a Custom Elements Manifest: shared component and input base classes, named and default slots, typed standard and custom events, and generated enums and records for inline object shapes on attributes, method parameters, and method returns. Add configurable form value members, element validity helpers, CEM parity validation, and generated-project verification in CI and release. Respect the CEM `privacy` property so private and protected members are excluded from generated wrappers, Tag Helpers, and parity checks. Generated inputs supply a default `ValueExpression` so they render when used with `Value` alone, without `bind-Value`. Named slots render only when content is supplied, and their wrapper element is configurable through `slotWrapperTag`. Route a form control's value event through `HandleValueChanged` so the element's value is read back into the bound value before the caller callback runs, falling back to the `input` event for elements that do not declare `change`. Emit collection-valued attributes as JSON, since a collection's `ToString` writes the CLR type name into the markup.

Fix two defects in generated output found by comparing against a hand-written Web Awesome wrapper:

- A `boolean` attribute whose manifest default is `true` was generated as a plain `bool` rendered by bare presence. Omitting the attribute falls back to the element's own default, so `false` was silently unrepresentable (`Spellcheck="false"` did nothing). Such attributes are now tri-state `bool?` with an explicit off value, configurable via `booleanOffValue`.
- Tag Helper numeric attributes were formatted with the current culture, so a comma-decimal locale emitted unparseable values such as `rotate="2,5"`. They are now formatted with the invariant culture.
