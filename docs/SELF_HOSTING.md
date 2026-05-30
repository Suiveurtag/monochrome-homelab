# Self-Hosting Monochrome On Ubuntu 26.04

This guide covers the first homelab installer path for Ubuntu 26.04. It installs the built web app, the self-hosted API, the local upload API, and an Nginx reverse proxy on one server.

The installer is intentionally conservative:

- It only targets Ubuntu 26.04 by default.
- It installs into explicit system paths.
- It refuses to reuse an existing install directory unless that directory has the installer marker.
- It keeps user data under `/var/lib/monochrome`.

## Install

From a cloned Monochrome checkout on the server:

```bash
sudo MONOCHROME_PUBLIC_URL=https://music.example.com ./scripts/install-ubuntu.sh
```

For a local LAN test without TLS:

```bash
sudo MONOCHROME_PUBLIC_URL=http://server-ip-or-hostname ./scripts/install-ubuntu.sh
```

The default paths are:

| Path | Purpose |
| --- | --- |
| `/opt/monochrome` | Installed application source and `dist/` build |
| `/etc/monochrome/monochrome.env` | Runtime and build configuration |
| `/var/lib/monochrome/self-hosted` | Self-hosted account, profile, social, radio, share, and party JSON data |
| `/var/lib/monochrome/server-uploads` | Uploaded audio, metadata, indexes, stream tokens, and artwork |

Useful install overrides:

```bash
sudo \
  MONOCHROME_PUBLIC_URL=https://music.example.com \
  MONOCHROME_INSTALL_DIR=/opt/monochrome \
  MONOCHROME_DATA_DIR=/var/lib/monochrome \
  MONOCHROME_ADMIN_SECRET="$(openssl rand -hex 32)" \
  MONOCHROME_BOOTSTRAP_ADMIN_USER_ID=your-better-auth-user-id \
  ./scripts/install-ubuntu.sh
```

## Services

The installer creates and starts:

```bash
systemctl status monochrome-selfhost.service
systemctl status monochrome-uploads.service
systemctl status nginx
```

Logs:

```bash
journalctl -u monochrome-selfhost.service -f
journalctl -u monochrome-uploads.service -f
```

The self-hosted API listens on `127.0.0.1:8790` by default. The upload API listens on `127.0.0.1:8789` by default. Nginx serves `dist/`, proxies `/api/` and `/health` to the self-hosted API, and proxies `/uploads/` to the upload API.

The generated Nginx site becomes the default port-80 site. If the stock Ubuntu default site symlink is present, the installer removes that symlink so the Monochrome app answers direct IP or hostname requests.

## Configuration

Edit:

```bash
sudoedit /etc/monochrome/monochrome.env
```

Then rebuild the frontend if you changed browser-injected values such as `MONOCHROME_PUBLIC_URL`, `MONOCHROME_SELF_HOSTED_SERVER_URL`, `MONOCHROME_UPLOAD_SERVER_URL`, or `MONOCHROME_AUTH_REQUIRED`:

```bash
cd /opt/monochrome
set -a
. /etc/monochrome/monochrome.env
set +a
sudo -E npm run build
sudo systemctl restart monochrome-selfhost.service monochrome-uploads.service
sudo systemctl reload nginx
```

## Reverse Proxy And TLS

The generated Nginx site listens on port 80 with `server_name _`. For production, replace `/etc/nginx/sites-available/monochrome.conf` with your domain-specific TLS config or put Monochrome behind an existing reverse proxy.

Keep these routing rules:

- Serve `/opt/monochrome/dist` as the static root.
- Proxy `/api/` and `/health` to `http://127.0.0.1:8790`.
- Proxy `/uploads/` to `http://127.0.0.1:8789`.
- Keep SPA fallback to `/index.html` for app routes.

## Notes

- Ubuntu 26.04 currently provides a Node.js package new enough for this Vite build path; the installer uses the Ubuntu packages rather than a third-party Node repository.
- Self-hosted authentication is still a staged implementation. Better Auth remains the browser session authority, while the self-hosted backend enforces approval state through the normalized user headers sent by the app.
- PocketBase remains the default/public sync and profile service unless mandatory self-hosted auth is enabled for the deployment.
