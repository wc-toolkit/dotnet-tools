# Changesets

Add one Markdown file per user-facing change. Run `pnpm changeset` to create one
interactively, or add a file using this format:

```md
---
"@wc-toolkit/dotnet-tools": patch
---

Describe the change for the release notes.
```

The `version` script consumes pending changesets and updates the package version and
changelog. The `release` script builds the package and publishes it with Changesets.
