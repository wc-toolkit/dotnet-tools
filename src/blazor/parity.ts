import type { CemPackage } from "../shared/cem-types.js";
import { getCustomElementDeclarations, isExposedMember } from "../shared/cem-types.js";
import { createBlazorComponentModels, type BlazorComponentModel } from "./model.js";

export interface BlazorParityIssue {
  component: string;
  kind: "attribute" | "slot" | "event" | "method";
  name: string;
  message: string;
}

export interface BlazorParityOptions {
  typeSrc?: string;
  exclude?: string[];
  models?: BlazorComponentModel[];
}

/** Finds CEM members that are missing from the normalized Blazor component model. */
export function findBlazorParityIssues(
  manifest: CemPackage,
  options: BlazorParityOptions = {},
): BlazorParityIssue[] {
  const declarations = getCustomElementDeclarations(manifest, options.exclude);
  const models =
    options.models ??
    createBlazorComponentModels(manifest, options.typeSrc, undefined, options.exclude);
  const modelByTag = new Map(models.map((model) => [model.tagName, model]));
  const issues: BlazorParityIssue[] = [];

  for (const declaration of declarations) {
    const model = modelByTag.get(declaration.tagName);
    if (!model) {
      issues.push({
        component: declaration.tagName,
        kind: "attribute",
        name: declaration.tagName,
        message: "Custom element has no normalized Blazor component model.",
      });
      continue;
    }

    const check = (kind: BlazorParityIssue["kind"], expected: string[], actual: string[]) => {
      const actualNames = new Set(actual);
      for (const name of expected) {
        if (!actualNames.has(name)) {
          issues.push({
            component: declaration.tagName,
            kind,
            name,
            message: `CEM ${kind} '${name}' is missing from the Blazor model.`,
          });
        }
      }
    };

    check(
      "attribute",
      (declaration.attributes ?? []).map((attribute) => attribute.name),
      model.attributes.map((attribute) => attribute.name),
    );
    check(
      "slot",
      (declaration.slots ?? []).map((slot) =>
        !slot.name || slot.name === "default" ? "" : slot.name,
      ),
      model.slots.map((slot) => slot.name),
    );
    check(
      "event",
      (declaration.events ?? []).map((event) => event.name),
      model.events.map((event) => event.name),
    );
    check(
      "method",
      (declaration.members ?? [])
        .filter(
          (member) => isExposedMember(member) && (member.kind === "method" || member.parameters),
        )
        .map((member) => member.name),
      model.methods.map((method) => method.member.name),
    );
  }

  return issues;
}
