import { describe, expect, it } from "vitest";
import type { CemPackage } from "../shared/cem-types.js";
import { createBlazorComponentModels } from "./model.js";
import { findBlazorParityIssues } from "./parity.js";

const manifest: CemPackage = {
  schemaVersion: "1.0.0",
  modules: [
    {
      path: "components.ts",
      declarations: [
        {
          kind: "class",
          name: "Picker",
          customElement: true,
          tagName: "acme-picker",
          attributes: [{ name: "value", type: { text: "string" } }],
          slots: [{ name: "" }, { name: "start" }],
          events: [{ name: "change" }, { name: "acme-select" }],
          members: [{ kind: "method", name: "open", parameters: [] }],
        },
      ],
    },
  ],
};

describe("Blazor CEM parity", () => {
  it("accepts a complete normalized component model", () => {
    expect(findBlazorParityIssues(manifest)).toEqual([]);
  });

  it("does not report private or protected members as missing", () => {
    const scoped: CemPackage = {
      schemaVersion: "1.0.0",
      modules: [
        {
          path: "components.ts",
          declarations: [
            {
              kind: "class",
              name: "Picker",
              customElement: true,
              tagName: "acme-picker",
              members: [
                { kind: "method", name: "open", parameters: [] },
                { kind: "method", name: "internalHelper", privacy: "private" },
                { kind: "method", name: "onSlotChange", privacy: "protected" },
              ],
            },
          ],
        },
      ],
    };

    expect(findBlazorParityIssues(scoped)).toEqual([]);
    expect(
      createBlazorComponentModels(scoped)[0].methods.map((method) => method.member.name),
    ).toEqual(["open"]);
  });

  it("reports omitted CEM members", () => {
    const models = createBlazorComponentModels(manifest);
    models[0].events = [];
    models[0].methods = [];
    models[0].slots = models[0].slots.slice(0, 1);

    expect(findBlazorParityIssues(manifest, { models })).toEqual([
      {
        component: "acme-picker",
        kind: "slot",
        name: "start",
        message: "CEM slot 'start' is missing from the Blazor model.",
      },
      {
        component: "acme-picker",
        kind: "event",
        name: "change",
        message: "CEM event 'change' is missing from the Blazor model.",
      },
      {
        component: "acme-picker",
        kind: "event",
        name: "acme-select",
        message: "CEM event 'acme-select' is missing from the Blazor model.",
      },
      {
        component: "acme-picker",
        kind: "method",
        name: "open",
        message: "CEM method 'open' is missing from the Blazor model.",
      },
    ]);
  });
});
