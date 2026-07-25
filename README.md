# Magica Viewer

Magica Viewer is a browser-based explorer for Magica drive-history backups. It reads `.magica` SQLite files locally, plots recorded routes on an interactive map, and lists the available drive details.

> This project is vibe coded with AI assistance.

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

## Docker

Build and run the same image used in production:

```bash
docker build -t magica-viewer .
docker run --rm -p 3000:3000 magica-viewer
```

The container listens on port `3000` and includes an HTTP health check against
`GET /`.

## Coolify deployment

Gitea Actions tests every change and publishes a Docker image for each pushed
branch to:

```text
gitea.example.com/contributor/magica-viewer
```

Branch names are normalized into valid image tags, so `main` is published as
`gitea.example.com/contributor/magica-viewer:main`. Configure the Coolify application
as a **Docker Image** resource using that image and tag, expose port `3000`, and
enable the `GET /` health check. Add a repository Actions secret named
`REGISTRY_TOKEN` containing a Gitea personal access token with package
read/write permission.

The persistence staging branch is published as
`gitea.example.com/contributor/magica-viewer:codex-sqlite-persistence-staging`.
Configure a separate Coolify application for this tag and attach persistent
storage at `/data`. The SQLite database is stored at
`/data/magica-viewer.sqlite`; without the mounted volume, imported history will
be lost when Coolify replaces the container.

When a branch is deleted or its pull request is merged, its image is removed.
After a successful `main` build, obsolete package versions are removed, leaving
only the production image.

## License

Magica Viewer is available under the [MIT License](LICENSE). You may freely use, modify, and distribute it, including for commercial purposes, provided the copyright and license notice are retained.
