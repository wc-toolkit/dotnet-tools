# Agent Instructions

## Project

`@wc-toolkit/dotnet-tools` is a TypeScript/ESM package that turns a Custom Elements Manifest into a .NET Razor Class Library containing ASP.NET Tag Helpers and Blazor components.

## Source Of Truth

- Read `CONTRIBUTING.md` for the complete development and release workflow.
- Change implementation code under `src/`; do not edit `dist/` by hand.
- Treat the CEM as the input contract and keep generated names, paths, and output deterministic.
- Preserve the existing public API and generated-output conventions unless the task explicitly changes them.
- Use `.js` extensions for relative imports in TypeScript files.

## Repository Layout

- `src/index.ts`: public API and end-to-end publishing workflow
- `src/plugin.ts`: CEM build-plugin integration
- `src/tag-helpers/`: C# Tag Helper generation
- `src/blazor/`: Blazor `.razor` and code-behind generation
- `src/dotnet/`: Razor Class Library scaffolding and `dotnet` orchestration
- `src/shared/`: CEM types, naming, and type mapping
- `src/__demo__/`: generated-output demos and fixtures
- `dist/`: TypeScript build output; generated, not hand-edited

## Commands

Run these from the repository root:

```sh
pnpm install
pnpm check
pnpm test
```

`pnpm check` runs formatting validation, linting, and the TypeScript build. Run `pnpm test` when changing behavior covered by Vitest tests. For generated .NET changes, also run the relevant generated project's `dotnet restore`, `dotnet build`, and `dotnet pack` when the .NET 8 SDK is available.

## Change Guidelines

- Keep changes focused and avoid adding dependencies without a concrete need.
- Add or update tests for generator behavior, especially type mapping, naming, events, slots, and generated file contents.
- Use a small CEM fixture when validating generated C# or Razor output.
- Update `README.md` or `CONTRIBUTING.md` when public options, output, or workflows change.
- Add a Changeset for user-facing package behavior or generated-output changes; documentation-only and internal changes do not require one.
- Never commit credentials, NuGet API keys, private feed URLs, or temporary `.cem-dotnet-publish/` output.
- Do not run release or publish commands unless explicitly requested and credentials are intentionally configured.

## Verification

After edits, inspect the diff and run at least `pnpm check`. Do not include unrelated formatting, dependency, or generated-file changes. If `dist/` is tracked or intentionally part of the requested change, regenerate it with `pnpm build` rather than editing it manually.
