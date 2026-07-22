# Magica Viewer

Magica Viewer is a browser-based explorer for Magica drive-history backups. It reads `.magica` SQLite files locally, plots recorded routes on an interactive map, and lists the available drive details.

## Development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful commands:

- `npm run lint` checks the source.
- `npm run build` creates the production build.
- `npm test` runs lint and the production build.

## Architecture

- Next.js-compatible application built with Vinext and Vite
- Leaflet map rendering
- `sql.js` for reading uploaded SQLite backups in the browser
- Cloudflare Worker production output

Uploaded backups are processed in browser memory and are not sent to an application server.
