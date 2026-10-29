import { cpSync, rmSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CemPackage } from "./shared/cem-types.js";
import { generateTagHelpers } from "./tag-helpers/generate.js";
import { generateBlazorComponents } from "./blazor/generate.js";
import { scaffoldCombinedProject } from "./dotnet/scaffold.js";
import { packNuGetPackage, type PackNuGetPackageResult } from "./dotnet/pack.js";

export interface PackDotNetOptions {
  /** Parsed Custom Elements Manifest to generate from. */
  manifest: CemPackage;
  /** NuGet package ID, e.g. "YourOrg.Components". */
  packageId: string;
  /** Namespace for generated C# and Razor types, e.g. "YourOrg.Components". */
  namespace: string;
  /** Version to include in the NuGet package. */
  version: string;
  /** Target framework for the generated project. Defaults to "net8.0". */
  targetFramework?: string;
  emitEnumsForUnions?: boolean;
  /**
   * CEM property to read type information from. Defaults to `parsedType`, falling back to
   * `parsedType` and then `type` when the configured property is absent.
   */
  typeSrc?: string;
  /** Component names to exclude from generation. */
  exclude?: string[];
  /** Skips generation and packing, resolving to `undefined`. */
  skip?: boolean;
  /** Logs resolved options and each generated file. */
  debug?: boolean;
  /** Generate ASP.NET Tag Helpers into `TagHelpers/`. Defaults to true. */
  tagHelpers?: boolean;
  /** Generate Blazor component wrappers into `Blazor/`. Defaults to true. */
  blazor?: boolean;
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
  /** Output directory for the generated project. Defaults to .cem-dotnet-publish/<packageId>. */
  outdir?: string;
  /** Creates the `.nupkg` after generation. Defaults to true. */
  pack?: boolean;
  /** Files or directories to copy into the package's `wwwroot/` directory. */
  staticAssets?: StaticAsset[];
}

export interface StaticAsset {
  /** Source file or directory, resolved relative to the current working directory. */
  source: string;
  /** Destination path relative to the package's `wwwroot/`. Defaults to the source basename. */
  destination?: string;
}

export interface PackDotNetResult {
  nupkgPath?: PackNuGetPackageResult["nupkgPath"];
  projectDir: string;
  tagHelperFileCount: number;
  blazorFileCount: number;
}

/**
 * Generates Tag Helpers + Blazor component wrappers from a single Custom
 * Elements Manifest and optionally packs them as ONE combined NuGet package.
 */
export async function packDotNetTypes(
  options: PackDotNetOptions,
): Promise<PackDotNetResult | undefined> {
  const {
    manifest,
    packageId,
    namespace,
    version,
    targetFramework = "net8.0",
    emitEnumsForUnions = true,
    typeSrc = "parsedType",
    exclude = [],
    skip = false,
    debug = false,
    tagHelpers = true,
    blazor = true,
    validateParity = true,
    formValueMembers,
    slotWrapperTag,
    booleanOffValue,
    outdir = join(".cem-dotnet-publish", packageId),
    pack = true,
    staticAssets = [],
  } = options;

  if (skip) {
    if (debug) console.log("[dotnet-tools] Generation skipped.");
    return undefined;
  }

  if (!tagHelpers && !blazor) {
    throw new Error("At least one of `tagHelpers` or `blazor` must be enabled.");
  }

  if (debug) {
    console.log(
      `[dotnet-tools] packageId=${packageId} namespace=${namespace} version=${version} ` +
        `targetFramework=${targetFramework} outdir=${outdir} typeSrc=${typeSrc} ` +
        `tagHelpers=${tagHelpers} blazor=${blazor} pack=${pack}`,
    );
    if (exclude.length > 0) {
      console.log(`[dotnet-tools] Excluded components: ${exclude.join(", ")}`);
    }
  }

  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  // 1. Scaffold the combined Razor SDK project (csproj, .props, interop.js)
  scaffoldCombinedProject({
    projectDir: outdir,
    packageId,
    namespace,
    version,
    targetFramework,
  });

  copyStaticAssets(staticAssets, outdir);

  // 2. Generate Tag Helpers into TagHelpers/
  const tagHelperFiles = tagHelpers
    ? generateTagHelpers(manifest, {
        outdir: join(outdir, "TagHelpers"),
        namespace,
        emitEnumsForUnions,
        typeSrc,
        exclude,
        debug,
        booleanOffValue,
      })
    : [];

  // 3. Generate Blazor components into Blazor/
  const blazorFiles = blazor
    ? generateBlazorComponents(manifest, {
        outdir: join(outdir, "Blazor"),
        namespace,
        typeSrc,
        exclude,
        debug,
        validateParity,
        formValueMembers,
        slotWrapperTag,
        booleanOffValue,
      })
    : [];

  const generatedSummary = [
    tagHelpers ? `${tagHelperFiles.length} Tag Helper file(s)` : undefined,
    blazor ? `${blazorFiles.length} Blazor file(s)` : undefined,
  ]
    .filter(Boolean)
    .join(" and ");

  console.log(`Generated ${generatedSummary} into ${outdir}`);

  const packResult = pack
    ? packNuGetPackage({
        projectDir: outdir,
        packageId,
        version,
      })
    : {};

  return {
    ...packResult,
    projectDir: outdir,
    tagHelperFileCount: tagHelperFiles.length,
    blazorFileCount: blazorFiles.length,
  };
}

function copyStaticAssets(staticAssets: StaticAsset[], projectDir: string): void {
  if (staticAssets.length === 0) return;

  const wwwroot = resolve(projectDir, "wwwroot");
  mkdirSync(wwwroot, { recursive: true });

  for (const asset of staticAssets) {
    const source = resolve(asset.source);
    const destination = resolve(wwwroot, asset.destination ?? basename(source));
    const destinationRelativeToWwwroot = relative(wwwroot, destination);

    if (
      isAbsolute(destinationRelativeToWwwroot) ||
      destinationRelativeToWwwroot === ".." ||
      destinationRelativeToWwwroot.startsWith(`..${sep}`)
    ) {
      throw new Error(`Static asset destination must stay inside wwwroot: ${asset.destination}`);
    }

    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, force: true });
  }
}

export { generateTagHelpers } from "./tag-helpers/generate.js";
export { generateBlazorComponents } from "./blazor/generate.js";
export { findBlazorParityIssues } from "./blazor/parity.js";
export { scaffoldCombinedProject } from "./dotnet/scaffold.js";
export { packNuGetPackage } from "./dotnet/pack.js";
export type { CemPackage, CustomElementDecl } from "./shared/cem-types.js";
