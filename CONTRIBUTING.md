# Contributing

Thanks for contributing to `@wc-toolkit/dotnet-tools`. This guide describes the local workflow
for changing the TypeScript generator and its generated .NET output.

## Prerequisites

- Node.js 20.19 or newer; CI uses Node 24. Current Node.js LTS is recommended.
- pnpm, compatible with the lockfile format used by this repository.
- The .NET 8 SDK if you need to build or inspect a generated RCL.
- Git.

The generator builds with the native TypeScript 7 compiler, which resolves a platform binary
through an optional dependency. If `pnpm build` reports that it cannot find `node:fs` and similar
built-ins, the compiler is not seeing ambient type packages: TypeScript 7 no longer includes
every `@types/*` package automatically, and `tsconfig.json` must list each one in `compilerOptions.types`.

## Set up the repository

Install dependencies from the repository root:

```sh
pnpm install
```

The package has a peer dependency on `custom-elements-manifest`; `pnpm install` installs the
version recorded by the lockfile for local development.

## Project layout

```text
src/
  index.ts                  Public API and end-to-end generation workflow
  plugin.ts                 CEM generator and analyzer integration hooks
  blazor/generate.ts        .razor and code-behind generation
  blazor/model.ts           Normalized CEM to Blazor component model
  blazor/parity.ts          CEM API coverage validation
  tag-helpers/generate.ts   C# Tag Helper generation
  dotnet/scaffold.ts        Generated Razor Class Library files
  dotnet/pack.ts            dotnet restore/build/pack orchestration
  shared/                   CEM types, naming, and type mapping
  __demo__/                 Generated-output demos and fixtures
dist/                       TypeScript build output, not hand-edited
vitest.config.ts            Test glob, scoped to src/
```

The generator writes temporary integration output to `.cem-dotnet-publish/` by default.
Keep generated output out of source changes unless a task specifically requires a fixture.

## Development commands

Build TypeScript and declaration files into `dist/`:

```sh
pnpm build
```

Format TypeScript source with Oxfmt:

```sh
pnpm format
```

Check formatting without changing files:

```sh
pnpm format:check
```

Lint TypeScript source with Oxlint:

```sh
pnpm lint
```

Run formatting checks, linting, and the TypeScript build together:

```sh
pnpm check
```

Create a release note for a user-facing change:

```sh
pnpm changeset
```

Consume pending changesets and update the package version:

```sh
pnpm version
```

The `release` script builds and publishes the package through Changesets. Do not run it
unless you have release credentials and are intentionally publishing:

```sh
pnpm release
```

Run TypeScript in watch mode while developing:

```sh
pnpm dev
```

Build both generated demo projects, including the generated Blazor and Razor Pages output, then run
the rendered-component tests against them:

```sh
pnpm test:generated
```

Run the unit tests:

```sh
pnpm test
```

`pnpm test` runs against `src/` only. `vitest.config.ts` scopes the test glob so compiled
output in `dist/` is not collected a second time. Run `pnpm check` and `pnpm test` for every
change, plus `pnpm test:generated` for changes to generated C# or Razor.

## Testing generated components

The Vitest tests assert on generated source text. That cannot tell whether a generated handler is
reachable from the markup, which is why a form control whose value event was bound straight to the
caller's callback passed every source-level assertion while `@bind-Value` silently did nothing.

`test/Blazor` covers that gap with bUnit. It renders the components produced by the last
`test:generated` run and fires real events, so it exercises the markup-to-code-behind wiring. It is
part of `test:generated` and needs the .NET 8 SDK.

When you change event routing, form binding, the shared generated base classes, or attribute
rendering, add a case there. Assert the behavior through the rendered element rather than the
component's properties where possible. Extending that suite is the right answer to "how do I know
this actually works?"; running a demo app by hand remains useful for anything a browser does that
bUnit does not, such as a real custom element upgrading and dispatching events.

## Making a change

1. Create a focused branch from the current default branch.
2. Read the relevant generator and shared utility code before changing output behavior.
3. Update TypeScript source under `src/`; do not edit `dist/` by hand.
4. Keep generated names, namespaces, and file paths deterministic.
5. Update `README.md` or this guide when public options, output, or workflows change.
6. Add a changeset for user-facing package or generated-output behavior.
7. Run `pnpm check`, `pnpm test`, and `pnpm test:generated`.
8. Review the diff, including generated declaration changes in `dist/` if build output is tracked by the project.
9. Open a pull request describing the behavior change and verification performed.

## Working with generated output

The main workflow is `packDotNetTypes`. It removes and recreates its `outdir`, then:

1. Scaffolds a Razor Class Library project.
2. Generates Tag Helpers under `TagHelpers/`.
3. Generates Blazor components under `Blazor/`.
4. Runs `dotnet restore`, `dotnet build -c Release`, and `dotnet pack`.
5. Leaves the resulting `.nupkg` in the generated project's `out/` directory. Publishing is
   controlled by the component library maintainer's release process.

When testing changes to generated C# or Razor, use a small CEM fixture containing at least:

- One boolean, string, number, and union attribute.
- One custom event with a detail payload.
- One element with a slot.
- Kebab-case tag and attribute names.
- Members with `privacy` set to `public`, `private`, and absent, to confirm private and protected
  members are excluded.
- One inline object shape on an attribute, a method parameter, and a method return.
- One form-associated element with a live value, exercised with and without `bind-Value`.

Inspect the generated files as well as the compiler output. Verify that event listeners are
bound and disposed, that union enum values preserve their original attribute strings, that private
members produce no generated API, and that the package contains the expected `build/` and
`wwwroot/` assets.

## Code conventions

- Follow the existing strict TypeScript configuration and ESM import style.
- Use `.js` extensions in relative TypeScript imports because the project uses `NodeNext` module resolution.
- Prefer small, deterministic functions for rendering generated source.
- Preserve existing generated-output conventions unless the change intentionally updates the public API.
- Avoid adding dependencies when a platform or existing project API is sufficient.
- Keep comments focused on behavior that is not obvious from the code.

## Pull requests

Pull requests should include:

- A concise explanation of the problem and the chosen solution.
- Any public API or generated-output changes.
- Commands run and their results, for example `pnpm build` or generated `.NET` validation.
- Notes about limitations or follow-up work.

Keep unrelated formatting or dependency changes out of the pull request. Generated `dist/`
files should only be included when they are intentionally part of the repository's release
workflow.

## Changesets

Every user-facing change should include a changeset. Use `patch` for fixes and small
backward-compatible changes, `minor` for new backward-compatible features, and `major` for
breaking public API or generated-output changes. Documentation-only and internal changes do
not need a changeset unless they affect published package behavior.

## Reporting issues

Include the smallest reproducible CEM, the generator options, Node.js and .NET SDK versions,
the command that failed, and the generated file or compiler error. Remove credentials and
private package-feed URLs before posting logs.

## Releasing and publishing

This project creates NuGet packages but does not publish them. Component library maintainers
should publish the generated `.nupkg` from their own CI or release workflow, where they control
the version, approvals, credentials, and package source. Never add NuGet credentials to this
repository or to a generator config.
