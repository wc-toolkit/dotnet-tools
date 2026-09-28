import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBlazorComponents, generateTagHelpers } from "../index.js";
import type { CemPackage } from "../shared/cem-types.js";

const demoDirectory = fileURLToPath(new URL(".", import.meta.url));
const sourceDemoDirectory = join(demoDirectory, "..", "..", "src", "__demo__");
const manifest = JSON.parse(
  readFileSync(join(sourceDemoDirectory, "custom-elements.json"), "utf8"),
) as CemPackage;
const demoTags = new Set(["wa-badge", "wa-divider", "wa-input", "wa-progress-bar", "wa-spinner"]);
const demoManifest: CemPackage = {
  ...manifest,
  modules: manifest.modules.map((module) => ({
    ...module,
    declarations: module.declarations,
  })),
};

rmSync(join(sourceDemoDirectory, "razor-pages", "Generated"), { recursive: true, force: true });
rmSync(join(sourceDemoDirectory, "blazor", "Components", "Generated"), {
  recursive: true,
  force: true,
});

generateTagHelpers(demoManifest, {
  outputDir: join(sourceDemoDirectory, "razor-pages", "Generated", "TagHelpers"),
  namespace: "WebAwesome.RazorPagesDemo",
});

generateBlazorComponents(demoManifest, {
  outputDir: join(sourceDemoDirectory, "blazor", "Components", "Generated"),
  namespace: "WebAwesome.BlazorDemo.Components.Generated",
});

console.log("Generated Web Awesome wrappers for both demos.");
