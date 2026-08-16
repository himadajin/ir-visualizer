# Favicon

The application exposes the IR Visualizer icon as an SVG favicon at
`/favicon.svg`. The asset lives in `public/favicon.svg`, so Vite copies it to
the deployment root and applies the configured base path in the generated
HTML.

The favicon replaces the Vite starter icon. Its graph motif represents an IR
input flowing through a transformation into two outputs. The inline SVG
switches its stroke between black and white with `prefers-color-scheme` so the
transparent icon remains visible on light and dark browser chrome.

> Pinned by: `e2e/smoke.spec.ts` (`loads the IR Visualizer favicon`). Visual
> rendering at 16px, 32px, and 64px was reviewed manually; pixel-level
> appearance remains observed, untested.
