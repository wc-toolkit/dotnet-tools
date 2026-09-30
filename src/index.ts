import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
import type { CemPackage } from "./shared/cem-types.js";
import { generateTagHelpers } from "./tag-helpers/generate.js";
import { generateBlazorComponents } from "./blazor/generate.js";
import { scaffoldCombinedProject } from "./dotnet/scaffold.js";
import { packAndPush, type PublishResult } from "./dotnet/publish.js";

export interface PublishDotNetOptions {
  manifest: CemPackage;
  packageId: string; // e.g. "YourOrg.Components"
  namespace: string; // e.g. "YourOrg.Components"
  version: string;
  targetFramework?: string;
  nugetApiKey?: string;
  nugetSource?: string;
  dryRun?: boolean;
  emitEnumsForUnions?: boolean;
  /** Type property to prefer before the parsedType/type fallbacks. */
  typeField?: string;
  /** Validate Blazor CEM parity before generating output. Defaults to true. */
  validateParity?: boolean;
  /** Attribute/member names considered live form values. */
  formValueMembers?: string[];
  /**
   * Element wrapping named slot content. Defaults to "span" for inline slot content. Use "div"
   * for block-oriented slots, or null to emit no wrapper.
   */
  slotWrapperTag?: string | null;
  /**
   * Attribute text written for a boolean attribute whose element default is `true`, so `false`
   * can be expressed. Defaults to "false"; set to "off" for libraries that spell it that way.
   */
  booleanOffValue?: string;
  /** Defaults to .cem-dotnet-publish/<packageId> */
  workDir?: string;
}

export interface PublishDotNetResult extends PublishResult {
  projectDir: string;
  tagHelperFileCount: number;
  blazorFileCount: number;
}

/**
 * Generates Tag Helpers + Blazor component wrappers from a single Custom
 * Elements Manifest and packs/pushes them as ONE combined NuGet package.
 */
export async function publishDotNetTypes(
  options: PublishDotNetOptions,
): Promise<PublishDotNetResult> {
  const {
    manifest,
    packageId,
    namespace,
    version,
    targetFramework = "net8.0",
    nugetApiKey,
    nugetSource,
    dryRun = true,
    emitEnumsForUnions = true,
    typeField,
    validateParity = true,
    formValueMembers,
    slotWrapperTag,
    booleanOffValue,
    workDir = join(".cem-dotnet-publish", packageId),
  } = options;

  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // 1. Scaffold the combined Razor SDK project (csproj, .props, interop.js)
  scaffoldCombinedProject({
    projectDir: workDir,
    packageId,
    namespace,
    version,
    targetFramework,
  });

  // 2. Generate Tag Helpers into TagHelpers/
  const tagHelperFiles = generateTagHelpers(manifest, {
    outputDir: join(workDir, "TagHelpers"),
    namespace,
    emitEnumsForUnions,
    typeField,
    booleanOffValue,
  });

  // 3. Generate Blazor components into Blazor/
  const blazorFiles = generateBlazorComponents(manifest, {
    outputDir: join(workDir, "Blazor"),
    namespace,
    typeField,
    validateParity,
    formValueMembers,
    slotWrapperTag,
    booleanOffValue,
  });

  console.log(
    `Generated ${tagHelperFiles.length} Tag Helper file(s) and ${blazorFiles.length} Blazor file(s) into ${workDir}`,
  );

  // 4. Pack (and optionally push) the single combined package
  const publishResult = packAndPush({
    projectDir: workDir,
    packageId,
    version,
    nugetApiKey,
    nugetSource,
    dryRun,
  });

  return {
    ...publishResult,
    projectDir: workDir,
    tagHelperFileCount: tagHelperFiles.length,
    blazorFileCount: blazorFiles.length,
  };
}

export { generateTagHelpers } from "./tag-helpers/generate.js";
export { generateBlazorComponents } from "./blazor/generate.js";
export { findBlazorParityIssues } from "./blazor/parity.js";
export { scaffoldCombinedProject } from "./dotnet/scaffold.js";
export { packAndPush } from "./dotnet/publish.js";
export type { CemPackage, CustomElementDecl } from "./shared/cem-types.js";
