# Web Awesome Demos

The demos use `custom-elements.json` to generate wrappers for the representative Web Awesome
elements used by each page.

Regenerate the wrappers from the manifest:

```sh
pnpm build
node dist/__demo__/generate-demos.js
```

Run the Razor Pages demo from the repository root:

```sh
pnpm demo:razor-pages
```

Run the Blazor demo from the repository root:

```sh
pnpm demo:blazor
```

Both demos load Web Awesome CSS and JavaScript from the Web Awesome CDN.
