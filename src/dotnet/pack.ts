import { execSync } from "node:child_process";
import { join } from "node:path";

export interface PackNuGetPackageOptions {
  projectDir: string;
  packageId: string;
  version: string;
}

export interface PackNuGetPackageResult {
  nupkgPath: string;
}

export function packNuGetPackage({
  projectDir,
  packageId,
  version,
}: PackNuGetPackageOptions): PackNuGetPackageResult {
  const outDir = join(projectDir, "out");

  execSync(`dotnet restore "${projectDir}"`, { stdio: "inherit" });
  execSync(`dotnet build "${projectDir}" -c Release`, { stdio: "inherit" });
  execSync(`dotnet pack "${projectDir}" -c Release -o "${outDir}" --no-build`, {
    stdio: "inherit",
  });

  const nupkgPath = join(outDir, `${packageId}.${version}.nupkg`);
  return { nupkgPath };
}
