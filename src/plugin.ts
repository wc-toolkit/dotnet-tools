import { publishDotNetTypes, type PublishDotNetOptions } from "./index.js";

/**
 * A plugin hook matching the `onManifestGenerated` lifecycle point used by
 * the existing multi-bundler CEM analyzer plugin. Add this alongside the
 * core analyzer plugin in your Vite/Rollup/Rolldown/webpack config.
 */
export function dotnetTypesPublishPlugin(options: Omit<PublishDotNetOptions, "manifest">) {
  return {
    name: "cem-dotnet-types-publish",
    async onManifestGenerated(manifest: PublishDotNetOptions["manifest"]) {
      const result = await publishDotNetTypes({ manifest, ...options });

      console.log(
        `[cem-dotnet-types-publish] ${result.pushed ? "published" : "staged"} ` +
          `${options.packageId} (${result.tagHelperFileCount} tag helpers, ` +
          `${result.blazorFileCount} blazor files) -> ${result.nupkgPath}`,
      );

      return result;
    },
  };
}
