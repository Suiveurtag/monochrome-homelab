# Docker Deployment Guide

## Quick Start

### Monochrome Only

```bash
docker compose up -d
```

Visit `http://localhost:3000`

### Development

```bash
./monochrome dev
```

Visit `http://localhost:5173` (hot-reload enabled)

This is the recommended Codex Desktop workflow. Vite runs directly on the host, so frontend changes are visible immediately without a Docker build. Docker only runs PocketBase and a development SpotiFLAC importer. The importer's source is mounted and its lightweight watcher automatically recompiles and restarts it when a Go file changes.

The first run builds the importer toolchain image. Later source changes do not rebuild it. Rebuild that image only after changing `docker/Dockerfile.importer.dev` or the pinned SpotiFLAC version.

PocketBase is available at `http://localhost:8090/_/`; its data is kept in `./pb_data`. The importer is available through Vite's `/api/selfhost` proxy and directly at `http://localhost:8787/health`.

The development profile creates a local PocketBase superuser with `admin@example.com` / `changeme`. Set `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD` before starting Compose to override these credentials, and do not reuse the default password outside local development.

Stop only Vite with `Ctrl+C`. PocketBase and the importer intentionally stay running so the next start is fast. Stop the complete development stack with:

```bash
./monochrome down
```

Use `./monochrome logs` or `./monochrome status` for diagnostics. `npm run dev:stack` and `npm run dev:down` are equivalent aliases.

---

## How It Works

### Development orchestration

The root `docker-compose.yml` is the canonical production and infrastructure definition. `./monochrome dev` deliberately starts only `pocketbase`, `pocketbase-dev-init`, and `selfhost-importer-dev`; it does not start or rebuild the production frontend and importer.

| Process | Development runtime | Reload behavior |
| ------- | ------------------- | --------------- |
| Frontend | Host Vite process on port 5173 | Vite HMR/full reload |
| PocketBase | Docker on port 8090 | Restart after changing migrations |
| SpotiFLAC importer | Docker dev toolchain on port 8787 | Automatic Go recompile and restart |

The `dev` Compose profile contains only development support containers. Use the launcher rather than invoking the profile directly, because Compose would otherwise also select services without a profile.

### Override File

Docker Compose automatically merges `docker-compose.override.yml` into `docker-compose.yml` if it exists in the same directory. No flags needed.

This is useful for forks that need to add custom services or configuration (Traefik labels, extra containers, custom networks) without modifying the base `docker-compose.yml`.

The override file does not exist in the upstream repo, don't search it!

**Example** -- adding Traefik labels to PocketBase in your fork:

```yaml
# docker-compose.override.yml
services:
    pocketbase:
        labels:
            - traefik.enable=true
            - traefik.http.routers.pocketbase.rule=Host(`pocketbase.example.com`)
            - traefik.http.routers.pocketbase.entrypoints=websecure
            - traefik.http.routers.pocketbase.tls.certresolver=letsencrypt
            - traefik.http.services.pocketbase.loadbalancer.server.port=8090
        networks:
            - proxy-network

networks:
    proxy-network:
        external: true
```

**Example** -- adding a custom service in your fork:

```yaml
# docker-compose.override.yml
services:
    my-custom-api:
        image: my-api:latest
        restart: unless-stopped
        ports:
            - '4000:4000'
        networks:
            - monochrome-network
```

Override files can extend existing services (add labels, env vars, networks) and define entirely new services. See the [Docker docs](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) for the full merge behavior.

---

## Configuration

The application is configured via environment variables. Copy `.env.example` to `.env` and edit it to match your setup.

### Authentication (Appwrite)

Monochrome uses Appwrite for user authentication. While it defaults to official instances, you can use your own self-hosted Appwrite instance:

1. Create a project in Appwrite.
2. Enable the **Google** or **Email/Password** providers in the Appwrite Console.
3. Set these variables in your `.env`:
    - `APPWRITE_ENDPOINT`: Your Appwrite API endpoint (e.g., `https://auth.yourdomain.com/v1`).
    - `APPWRITE_PROJECT_ID`: Your Appwrite project ID (e.g., `auth-for-monochrome`).

### Database (PocketBase)

Monochrome uses PocketBase to store user data (playlists, favorites, profiles, etc.). It is part of the production stack, or can be started alone for diagnostics:

```bash
docker compose up -d pocketbase
```

#### PocketBase Schema Note

If you are setting up a new PocketBase collection for user data, ensure it has a field named `firebase_id` (this is a legacy name we use when we first started the accounts system, we used firebase. and im too lazy to change it so yea fuck you).

---

## Portainer Deployment

Portainer can deploy directly from your GitHub fork with auto-updates on push.

### Setup

1. In Portainer, go to **Stacks > Add Stack > Repository**
2. Enter your fork URL and branch
3. Compose path: `docker-compose.yml`
4. If your fork has a `docker-compose.override.yml`, Portainer loads it automatically
5. Under **Environment variables**, add:
    - `PB_ADMIN_EMAIL=your@email.com`
    - `PB_ADMIN_PASSWORD=your_secure_password`
    - Any other variables from `.env.example`
6. Enable **GitOps updates** to auto-redeploy on push

> **Warning:** The `dev` profile is for **local development only**. It uses volume mounts to enable hot-reload, which requires the source code to be present on the host machine. Do **not** include `dev` in `COMPOSE_PROFILES` on Portainer deployments from GitHub - it will fail because there's no local source code to mount.

### Fork Workflow

To add custom services (Traefik, monitoring, etc.) to your fork:

1. Create `docker-compose.override.yml` in your fork
2. Remove the `docker-compose.override.yml` line from `.gitignore`
3. Commit both changes to your fork
4. Portainer will auto-load the override file alongside the base compose

When pulling updates from upstream (`git pull upstream main`), there are no conflicts -- the upstream repo does not have an override file.

---

## Common Operations

```bash
# View logs
docker compose logs -f
docker compose logs -f pocketbase

# Rebuild after code changes
docker compose up -d --build

# Stop everything (include all profiles you started)
docker compose down

# Stop and remove volumes (data loss!)
docker compose down -v

# Backup PocketBase data
docker compose exec pocketbase tar czf - /pb_data > backup.tar.gz

# Restore PocketBase data
docker compose exec pocketbase tar xzf - -C / < backup.tar.gz
```

---

## Architecture

### Production (Dockerfile)

The Bun builder installs dependencies and runs `vite build`; nginx serves the static result on port 4173.

### Development

Vite runs on the host. `Dockerfile.importer.dev` contains the reusable Go/SpotiFLAC toolchain; `services/spotiflac-importer/dev-watch.sh` recompiles mounted backend source without rebuilding the image.

### Files

| File                          | Purpose                       | In upstream repo |
| ----------------------------- | ----------------------------- | :--------------: |
| `docker-compose.yml`          | All services with profiles    |       Yes        |
| `docker-compose.override.yml` | Fork-specific customizations  |        No        |
| `.env.example`                | Environment variable template |       Yes        |
| `.env`                        | Your local configuration      |        No        |
| `Dockerfile`                  | Production build              |       Yes        |
| `Dockerfile.importer.dev`     | Backend development toolchain |       Yes        |
| `.dockerignore`               | Build context exclusions      |       Yes        |
