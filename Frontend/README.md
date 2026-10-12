# Frontend

React 19 + Vite client for Folio Books. See the root README for setup.

- `npm run dev` full-stack dev server (needs the Backend, `VITE_API_URL`)
- `npm run dev:demo` browser-only live preview (no backend)
- `npm run build` production build; `npm run build:pages` static live-preview build for GitHub Pages
- `npm run lint`

`src/shared` is a generated copy of `Backend/shared` (run `npm run sync:shared` in Backend); do not edit it by hand.
