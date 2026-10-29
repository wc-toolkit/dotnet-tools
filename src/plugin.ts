import { packDotNetTypes, type PackDotNetOptions, type PackDotNetResult } from "./index.js";

type PackOptions = Omit<PackDotNetOptions, "manifest">;
type Manifest = PackDotNetOptions["manifest"];

const PLUGIN_NAME = "cem-dotnet-types-pack";

export interface CemAnalyzerPackageLinkPhaseParams {
  customElementsManifest: Manifest;
}

/** Shared result queue exposed by every integration plugin. */
export interface DotNetTypesPlugin {
  readonly name: string;
  /**
   * Waits for every package queued by the plugin and returns their results.
   *
   * Build-tool hooks are synchronous, so they start packing in the background.
   * Call `flush()` after generation when the process must not exit before the
   * package is written.
   */
  flush(): Promise<PackDotNetResult[]>;
}

export interface DotNetTypesGeneratorPlugin extends DotNetTypesPlugin {
  afterGenerate(manifest: Manifest): void;
}

export interface DotNetTypesAnalyzerPlugin extends DotNetTypesPlugin {
  packageLinkPhase(params: CemAnalyzerPackageLinkPhaseParams): void;
}

function createPacker(options: PackOptions) {
  const results: PackDotNetResult[] = [];
  const failures: unknown[] = [];
  let queue: Promise<void> = Promise.resolve();

  function pack(manifest: Manifest): Promise<void> {
    const run = queue.then(async () => {
      const result = await packDotNetTypes({ manifest, ...options });

      if (!result) return;

      results.push(result);
      const outputPath = result.nupkgPath ?? result.projectDir;
      console.log(
        `[${PLUGIN_NAME}] ${result.nupkgPath ? "packed" : "generated"} ` +
          `${options.packageId} (${result.tagHelperFileCount} tag helpers, ` +
          `${result.blazorFileCount} blazor files) -> ${outputPath}`,
      );
    });

    queue = run.then(
      () => undefined,
      (error) => {
        failures.push(error);
        console.error(`[${PLUGIN_NAME}] packing failed:`, error);
      },
    );

    // Keep fire-and-forget build-tool runs from crashing on an unhandled rejection.
    run.catch(() => {});

    return run;
  }

  async function flush(): Promise<PackDotNetResult[]> {
    await queue;

    const errors = failures.splice(0);

    if (errors.length > 0) {
      throw errors[0];
    }

    return [...results];
  }

  return { pack, flush };
}

/**
 * Plugin for `@wc-toolkit/cem-generator`.
 *
 * Implements the `afterGenerate` completion hook, so it can be passed to the
 * `plugins` option of `generateCem()` or `cemGeneratorPlugin()`.
 */
export function dotnetTypesGeneratorPlugin(options: PackOptions): DotNetTypesGeneratorPlugin {
  const { pack, flush } = createPacker(options);

  return {
    name: PLUGIN_NAME,
    afterGenerate(manifest) {
      void pack(manifest);
    },
    flush,
  };
}

/**
 * Plugin for the Custom Elements Manifest Analyzer.
 *
 * Implements the `packageLinkPhase` hook, so it can be added to the `plugins`
 * array in `custom-elements-manifest.config.{mjs,js,ts}`.
 */
export function dotnetTypesAnalyzerPlugin(options: PackOptions): DotNetTypesAnalyzerPlugin {
  const { pack, flush } = createPacker(options);

  return {
    name: PLUGIN_NAME,
    packageLinkPhase({ customElementsManifest }) {
      void pack(customElementsManifest);
    },
    flush,
  };
}
