import { execSync } from "node:child_process";
import { join } from "node:path";

export interface PackAndPushOptions {
  projectDir: string;
  packageId: string;
  version: string;
  nugetApiKey?: string;
  nugetSource?: string;
  dryRun?: boolean;
}

export interface PublishResult {
  nupkgPath: string;
  pushed: boolean;
}

export function packAndPush(options: PackAndPushOptions): PublishResult {
  const {
    projectDir,
    packageId,
    version,
    nugetApiKey = process.env.NUGET_API_KEY,
    nugetSource = "https://api.nuget.org/v3/index.json",
    dryRun = true,
  } = options;

  const outDir = join(projectDir, "out");

  execSync(`dotnet restore "${projectDir}"`, { stdio: "inherit" });
  execSync(`dotnet build "${projectDir}" -c Release`, { stdio: "inherit" });
  execSync(`dotnet pack "${projectDir}" -c Release -o "${outDir}" --no-build`, {
    stdio: "inherit",
  });

  const nupkgPath = join(outDir, `${packageId}.${version}.nupkg`);

  if (dryRun) {
    console.log(`[dry run] Package built at ${nupkgPath} — skipping push.`);
    return { nupkgPath, pushed: false };
  }

  if (!nugetApiKey) {
    throw new Error(
      "NUGET_API_KEY is not set. Set the env var, pass nugetApiKey explicitly, or use dryRun: true.",
    );
  }

  execSync(
    `dotnet nuget push "${nupkgPath}" --api-key ${nugetApiKey} --source ${nugetSource} --skip-duplicate`,
    { stdio: "inherit" },
  );

  return { nupkgPath, pushed: true };
}
