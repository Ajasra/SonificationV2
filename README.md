# Sonification V2

Browser studio and mobile camera for processing image pixels through audio DSP filters. Inputs include still images, video files, and a live camera. The studio includes a filter library, rotary controls, factory studies, custom presets, QR sharing, snapshots, and video recording.

The app has five local default presets. User accounts, private preset libraries, and public preset search use PocketBase. Presets are JSON records in PocketBase's SQLite database file on your VPS; each public link opens without login. Database persistence requires a VPS volume or disk that survives process restarts.

## Local test setup

Use two terminals from the project directory. Download PocketBase 0.28.1 for your OS from [PocketBase releases](https://github.com/pocketbase/pocketbase/releases) and put its executable in the project root as `pocketbase.exe` on Windows or `pocketbase` on Linux/macOS. This version was used to validate this project's migration and hooks.

Terminal 1, start PocketBase. It listens only on this computer at port 8090:

```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090
```

Terminal 2, start the Vite development site:

```powershell
npm ci
npm run dev
```

Open the HTTPS URL printed by Vite, usually `https://localhost:5173`. Vite proxies `/api` and `/_/` to PocketBase. PocketBase applies migrations from `pb_migrations/` and loads `pb_hooks/` automatically when launched from the project root. On first launch, open the PocketBase setup link printed in its terminal to create the separate admin account.

For phone testing, use the computer's LAN IP with port 5173, on the same Wi-Fi network. Accept the development certificate warning if prompted, then enter the computer's reachable LAN address in the QR dialog.

## Ubuntu VPS with Nginx and PM2

The VPS runs one PocketBase process. PocketBase serves the compiled frontend from `pb_public/`, the API, and the admin UI; SQLite data lives in `pb_data/`. Nginx terminates HTTPS and proxies `https://sonification.vasily.onl` to PocketBase's internal port (`127.0.0.1:38472`). Because it binds strictly to `127.0.0.1`, PocketBase is completely inaccessible from the public internet directly and can only be reached via Nginx. PM2 keeps that process running. The supplied files are `ecosystem.config.cjs`, `deploy/nginx/sonification-v2.conf`, and `deploy/update-ubuntu.sh`.

Install Node.js/npm, PM2, and Nginx on Ubuntu, then clone or copy this repository to the VPS (for example `/opt/sonification-v2/`). Run the updater as the Linux user that should own the app and database:

```bash
cd /opt/sonification-v2
bash deploy/update-ubuntu.sh
```

The script initializes `.env` from `.env.example` if absent (configured with `PB_PORT=38472` and `VITE_SITE_URL=https://sonification.vasily.onl`), installs PocketBase 0.28.1 for the VPS architecture if the binary is missing, builds the frontend into `pb_public/`, and starts or restarts the PM2 app. It does not overwrite `pb_data/`. Keep that directory on persistent VPS storage and do not remove it during updates.

Run `pm2 startup` once. PM2 prints a `sudo` command; run that exact command, then run `pm2 save`. PM2 can restore saved processes on Ubuntu after reboot.

The supplied Nginx file (`deploy/nginx/sonification-v2.conf`) is configured for `sonification.vasily.onl` and proxies to `127.0.0.1:38472`. For a dedicated host, copy the file to `/etc/nginx/sites-available/sonification-v2.conf`, enable it, obtain certificates via Certbot, then validate and reload Nginx:

```bash
sudo cp deploy/nginx/sonification-v2.conf /etc/nginx/sites-available/sonification-v2.conf
sudo ln -s /etc/nginx/sites-available/sonification-v2.conf /etc/nginx/sites-enabled/sonification-v2.conf
sudo certbot --nginx -d sonification.vasily.onl
sudo nginx -t
sudo systemctl reload nginx
```

Make sure DNS points `sonification.vasily.onl` to the VPS and that public ports 80 and 443 are open. Visit `https://sonification.vasily.onl/`; on first start, inspect `pm2 logs sonification-v2` for PocketBase's one-time admin setup link. App users register through the site, separately from the admin account.

For updates, replace `pb_public/`, `pb_hooks/`, and `pb_migrations/`, then run `pm2 restart sonification-v2`. Keep `pb_data/` on persistent VPS storage and back it up from the PocketBase admin UI. Do not overwrite or remove it during updates. PocketBase's official [Nginx deployment guidance](https://pocketbase.io/docs/going-to-production/) covers the proxy headers used by the supplied config.

Camera access requires a secure context. Production hosting must provide HTTPS. See [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Camera recovery

Switching cameras stops the old tracks, acquires the replacement stream, and restarts frame processing. Repeated taps during a switch are ignored. Acquisition and playback each have a 12-second timeout. A timed-out permission request can still be pending in the browser; any stream it returns later is stopped.

Leaving or hiding the page releases the camera. When returning, tap **START CAM** or **Live camera** to acquire it again. This makes recovery available inside the page. Permission denial, a disconnected device, or operating-system camera contention can still prevent startup.

Phone acceptance remains pending. Automated camera checks use mocked browser APIs, and local migration validation does not verify a VPS backup/restore or live two-account behavior.

## Verification

```powershell
npm test
npm run build
git diff --check
```

The existing regression checks cover camera request ownership, cancellation, playback failures and timeouts, callback cancellation, camera-switch render restart, dynamics history, factory-preset rendering, and edited factory-preset sharing. The build runs strict TypeScript checking and produces the Vite bundle in `dist`.

## Accounts and preset sharing

Registration uses a 3–32 character username and password. The PocketBase auth token remains in the browser's auth store and is configured to last up to 180 days. Signing out or clearing browser data removes it. There is no email-based password recovery; ask the PocketBase administrator to reset an account.

New saves are private. My presets loads only the signed-in user's records. **Share publicly** makes a saved preset searchable and creates a stable `#shared=` link that loads its latest saved revision. **Make private** removes it from search and disables that lookup. The QR modal's snapshot link contains the current preset parameters, needs no account, and remains usable by anyone who has the link. A snapshot QR that is too large can still be copied as text.

Guests can search Explore, open public links, and use all five Defaults. Saving or importing old browser-local presets needs login. Import copies them into the account and leaves the local data intact. Existing factory links remain resolvable.

If PocketBase is offline, camera use, defaults, and parameter snapshot links continue to work. Account sign-in, My presets, Explore, and shared-record QR lookup require the VPS.

## Recording

Real-time recording uses canvas capture and Web Audio through MediaRecorder. Codec support depends on the browser. Video-file export also has an offline WebCodecs path. Confirm that an exported recording contains moving video and audible audio on each target device.


## Project documents

- [GOAL.md](GOAL.md): product goals and performance targets.
- [PRD.md](PRD.md): product requirements.
- [SPECS.md](SPECS.md): original technical design.
- [REVIEW.md](REVIEW.md): implementation findings and verification limits.
- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md): ordered follow-up work and acceptance criteria.
- [SPEC.md](SPEC.md): account, preset library, backend, and performance implementation requirements.

Performance figures in the goal and specification documents are targets. This review does not establish phone frame rates, 4K latency, or mathematical equivalence to the Processing implementation.
