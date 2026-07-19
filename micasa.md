---
name: homelab
description: |
  Homelab maintenance skill for micasa (10.0.0.197, SSH port 1616) running CasaOS
  with 60+ Docker containers. Covers weekly health checks, service investigation,
  and troubleshooting.
triggers:
  - "check homelab"
  - "health check"
  - "micasa"
  - "casaos"
  - any container/service name on micasa
---

# Homelab — micasa Health & Maintenance

## Host Details
- **Hostname:** micasa
- **IP:** 10.0.0.197
- **SSH:** port 1616, user `n0x`
- **OS:** Ubuntu, CasaOS managing Docker Compose stacks
- **Compose files:** `/var/lib/casaos/apps/<app_name>/docker-compose.yml` (root-owned 0600, NOT readable without sudo)
- **Storage:** `/DATA` mount at 3.6T (media, app data)
- **Memory:** 23 Gi RAM, 4 Gi swap

## Portainer API (preferred for stack management)
- **URL:** `https://localhost:9443`
- **Auth:** API key header `X-API-Key: ptr_k0QbuWjlLKmDGO4u8kFsEACdwNnI8eJepgm7Wpf1Ed0=`
- **Endpoint ID:** 2 (local)
- **Stacks endpoint:** `/api/stacks`
- **Get stack file:** `GET /api/stacks/{id}/file?endpointId=2` → `{"StackFileContent": "..."}`
- **Redeploy stack:** `PUT /api/stacks/{id}?endpointId=2` with body `{"StackFileContent": "...", "pullImage": false, "prune": false}`
- **Key stacks:** none currently (both plex and qbittorrent_airvpn are now CasaOS-managed — see below)
- **Note:** Plex is a CasaOS-managed app, NOT a Portainer stack. Do not import it into Portainer. See "CasaOS App Recovery" section below and `references/plex-portainer-import.md`.
- **List all containers:** `GET /api/endpoints/2/docker/containers/json` — use this to inspect any container via Portainer, not just stacks. Filter by `.Labels["com.docker.compose.project"]` to find compose project/workdir.
- **Create new stack:** `POST /api/stacks/create/standalone/string?endpointId=2` (endpointId is a **query param**, NOT in body — body only needs `name` and `stackFileContent`)
- **Pitfall:** When inspecting containers to understand their config, **use Portainer containers API first**, not `docker inspect`. It's faster and gives the same data without extra SSH commands.
- **Pitfall:** Compose files are root 0600 — `docker compose down` works (docker group) but `up -d` fails (can't read file). Use Portainer API to redeploy.
- **Pitfall:** When building PUT payload, write JSON to temp file first, then `curl -d @file`. Don't pass large payloads inline — shell escaping corrupts YAML content.

## Permission Model
- **Read/inspect commands:** Always OK — run immediately
- **Write/change commands:** Require explicit user approval first
  - This includes: docker restart, compose edits, package installs, service enable/disable, file writes on micasa
  - **This ALSO includes:** Hermes gateway restart, config.yaml edits affecting running services, cron job modifications that alter running behavior
  - When in doubt: ask. Restarting infrastructure without permission is a violation.
- **Research before guessing:** Always web-search about unfamiliar services/errors

## CRITICAL: Report Actual State

**NEVER suppress or skip reporting based on Known Issues.** The Known Issues section documents *known root causes* — it does NOT mean "don't report this." Always:
1. Run ALL check commands (container status, resources, disk, etc.)
2. Report the ACTUAL current state of every container
3. If a known issue explains the state, mention it as context — but still report

**Wrong:** "Known issue says gluetun unhealthy is cosmetic → skip → report All Clear"
**Right:** "Gluetun status: Exited (0). Known issue: healthcheck flaps on DoTLS, but container is fully DOWN — not just unhealthy. Investigate."

## Weekly Health Check

Run this sequence (EVERY check, NO shortcuts):

### 1. Container Status
```bash
ssh -p 1616 -o ConnectTimeout=10 n0x@10.0.0.197 "docker ps -a --format 'table {{.Names}}\t{{.Status}}'"
```
Flag: exited containers, unhealthy status, high restart counts, recently restarted (might indicate crash loop)

### 2. Resource Usage
```bash
ssh -p 1616 -o ConnectTimeout=10 n0x@10.0.0.197 "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'"
```

### 3. Host Memory
```bash
ssh -p 1616 -o ConnectTimeout=10 n0x@10.0.0.197 "free -h"
```

### 4. Disk Usage
```bash
ssh -p 1616 -o ConnectTimeout=10 n0x@10.0.0.197 "df -h / /DATA"
```
Alert thresholds:
- Root (/) > 85%
- /DATA > 90% (critical at 95%+)

### 5. Swap
```bash
ssh -p 1616 -o ConnectTimeout=10 n0x@10.0.0.197 "swapon --show"
```

### Report Format
- Silent if all healthy
- Brief report listing only issues found
- Include severity: ⚠️ warning vs 🔴 critical

## Known Issues & Patterns

### gluetun / qbittorrent_airvpn
- **Now a CasaOS-managed app** — compose at `/var/lib/casaos/apps/qbittorrent_airvpn/docker-compose.yml`
- gluetun (VPN) + qbittorrent share network (`network_mode: "service:gluetun"`)
- Healthcheck on gluetun flaps on Cloudflare DoTLS (1.0.0.1:853) connection resets
- VPN provider: AirVPN, Wireguard to Canada
- Icon: `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png`
- **Daily restart required** — see cron job section below
- Verify after restart: gluetun healthy, public IP in Canada, qbittorrent responding on port 8090
- Use nsenter redeploy procedure (not Portainer) for any compose changes

### invoiceninja-app crash loop
- Root cause: stale `DB_HOST1=172.22.0.2` pointing to wrong IP
- DB container moves IP on restart; hardcoded IPs break
- Fix: edit compose file, remove all `DB_HOST1`/`DB_PORT1` vars (multi-DB mode not enabled)
- Downgrade from 5.12.30 to 5.7.22: UNSAFE — Laravel migrations are one-way, DB schema incompatible

### CasaOS compose edits
- Files at `/var/lib/casaos/apps/<name>/docker-compose.yml`
- Root-owned (0600) — can't be read or written by `n0x` directly
- **Read via docker:** `docker run --rm --entrypoint cat -v /var/lib/casaos/apps/<name>:/data alpine /data/docker-compose.yml`
- **Write via docker:** mount dir + source file, `cp` inside alpine container
- **Restart preserving CasaOS ownership (nsenter):**
  ```bash
  docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -i -n -p -- \
    docker compose --project-directory /var/lib/casaos/apps/<name> --project-name <name> up -d
  ```
  This runs as root on the host, reads the 0600 file, and stamps the correct labels so CasaOS sees the app.
- **NEVER use `-f /tmp/file.yml`** with docker compose for CasaOS apps — it stamps the wrong `config_files` label and CasaOS loses the app.
- A `.bak` of the original compose exists in each app dir — use it to restore if the compose gets corrupted.

### Exited containers (intentional)
- `jellyfin` — not used (Plex instead)
- `maintainerr` — not used
- `mosquitto-app-1` — MQTT not needed
- `fastembed-cpu` — exited with code 127 (missing binary?), may be unused

### Swap exhaustion
- Persistent issue — 4 Gi swap fully used
- Top consumers: plex (~3.6 Gi), syncthing (~2.9 Gi)
- Mitigation: review memory limits on containers, consider adding RAM

## ⚠️ CRITICAL: Portainer Stacks Break CasaOS Ownership

**Do NOT import CasaOS apps into Portainer as new stacks.** When Portainer creates a stack, it sets container labels `com.docker.compose.project.working_dir` and `com.docker.compose.project.config_files` to its own path (`/data/compose/<id>/`). CasaOS then loses track of the app entirely — it disappears from the dashboard.

**Safe pattern:** Use Portainer only to manage stacks that were *never* CasaOS apps (e.g. qbittorrent_airvpn which was already imported). For existing CasaOS apps, use the CasaOS app management API or the nsenter redeploy procedure below.

---

## CasaOS App Recovery (After Portainer Takeover)

If a CasaOS app has been imported into Portainer and is now missing from the CasaOS dashboard:

### Step 1 — Delete the Portainer stack
```bash
curl -sk -X DELETE "https://localhost:9443/api/stacks/<id>?endpointId=2" \
  -H "X-API-Key: ptr_k0QbuWjlLKmDGO4u8kFsEACdwNnI8eJepgm7Wpf1Ed0="
```
This removes the container AND Portainer's stack record.

### Step 2 — Restore the correct compose file
CasaOS keeps a `.bak` in the app dir. Read it via docker (since it's root 0600):
```bash
docker run --rm --entrypoint cat -v /var/lib/casaos/apps/<name>:/data alpine /data/docker-compose.yml.bak
```
Make any edits needed (e.g. add tmpfs), write to `/tmp/<name>.yml`, then copy back:
```bash
docker run --rm --entrypoint sh \
  -v /var/lib/casaos/apps/<name>:/target \
  -v /tmp/<name>.yml:/src/docker-compose.yml:ro \
  alpine -c 'cp /src/docker-compose.yml /target/docker-compose.yml && chmod 600 /target/docker-compose.yml && echo done'
```

### Step 3 — Start via nsenter (runs as root, reads the 0600 file)
```bash
docker run --rm --privileged --pid=host alpine nsenter -t 1 -m -u -i -n -p -- \
  docker compose --project-directory /var/lib/casaos/apps/<name> --project-name <name> up -d
```
**This is the key command.** `--project-directory` points to the CasaOS path, so the container labels get stamped correctly: `working_dir=/var/lib/casaos/apps/<name>`, `config_files=/var/lib/casaos/apps/<name>/docker-compose.yml`.

### Step 4 — Verify
```bash
docker inspect <name> --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
# Should be: /var/lib/casaos/apps/<name>

curl -s 'http://127.0.0.1:45263/v2/app_management/compose' | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print("<name> found:", "<name>" in d.get("data",{}))'
# Should be: True
```

### Pitfalls
- **`-f /tmp/file.yml` stamps the WRONG label** — using `-f` makes docker stamp `/tmp/file.yml` as config_files, so CasaOS can't find it. Always use `--project-directory` without `-f` so docker reads the file from the CasaOS path itself.
- **`docker/compose:latest` is Compose v1** — doesn't support top-level `name:` field in YAML. Use `nsenter` approach or `ghcr.io/linuxserver/docker-compose:latest`.
- **`/dev/dvb` not on micasa** — Original Plex compose includes `/dev/dvb:/dev/dvb` but device doesn't exist. Remove it or container won't start (`no such file or directory`).
- **CasaOS API install (`POST /v2/app_management/compose`) returns "main service not been specified"** — This is a CasaOS API bug/version issue. Even with correct `x-casaos.main:` in the YAML, the API refuses it. Do NOT waste time debugging this endpoint — use the nsenter approach instead.

---

## Importing a CasaOS App into Portainer as a Managed Stack

CasaOS apps are docker compose projects under `/var/lib/casaos/apps/<name>/` (root 0600). To bring them under Portainer management (so you can edit/redeploy via API without sudo):

1. **Reconstruct compose from docker inspect** — use Portainer containers API to pull full config:
   ```
   GET /api/endpoints/2/docker/containers/json
   ```
   Filter by container name, then inspect the relevant fields: `Image`, `HostConfig.Binds`, `HostConfig.Devices`, `HostConfig.RestartPolicy`, `Config.Env`, `NetworkSettings.Networks`, `HostConfig.ShmSize`.

2. **Build the compose YAML** — reconstruct from inspect output. Note: `Binds: null` with mounts means the original compose used `volumes:` (named style). Check `HostConfig.Mounts` for source/destination.

3. **Create the stack via API:**
   ```bash
   curl -sk -X POST 'https://localhost:9443/api/stacks/create/standalone/string?endpointId=2' \
     -H 'X-API-Key: ptr_k0QbuWjlLKmDGO4u8kFsEACdwNnI8eJepgm7Wpf1Ed0=' \
     -H 'Content-Type: application/json' \
     -d '{"name":"<name>","stackFileContent":"<compose yaml>"}'
   ```
   This stops and recreates the container under Portainer's management.

4. **Verify:** `docker ps --filter name=<name>` — should show as running with new config.

**Pitfall:** `endpointId` must be a **query parameter** in the URL, not in the JSON body — the body only accepts `name` and `stackFileContent`. Putting it in the body returns "Invalid query parameter: endpointId".

See `references/plex-portainer-import.md` for the Plex-specific example including tmpfs transcode setup.

## Service Catalog
See `references/micasa-service-catalog.md` for full container list with purposes.

## Cron Job Configuration

### Daily: qbittorrent_vpn restart (08:00 UTC / 02:00 PT)
Restarts the qbittorrent_airvpn containers to keep VPN connection fresh.

- **Restart procedure (SSH preferred):**
  Direct `docker restart` via SSH is more reliable than Portainer API for this specific stack.
  ```bash
  ssh -p 1616 n0x@10.0.0.197 "docker restart gluetun && sleep 10 && docker restart qbittorrent"
  ```
- **Pitfall:** Portainer API (`/api/endpoints/2/docker/containers/{id}/restart`) often returns 400 Bad Request. See `references/portainer-api-pitfalls.md`.
- **Pitfall:** Do NOT redeploy the stack (PUT /api/stacks) for routine restarts — it's slow and pulls images. Container restart is fast and clean.
- **Pitfall:** Restart gluetun before qbittorrent since qbittorrent depends on gluetun's network.

### Weekly: homelab health check (Mondays 09:00 UTC)

**Required configuration:**
- **Provider:** `custom:omniroute` (self-hosted on micasa port 20128)
- **Model:** `free-medium`
- **Config prerequisite (in `~/.hermes/config.yaml`):**
  ```yaml
  providers:
    omniroute:
      name: omniroute
      api: http://10.0.0.197:20128/v1
  ```
  ⚠️ **Pitfall:** Do NOT use `custom_providers:` as a YAML dict (e.g. `custom_providers:\n  omniroute:\n    base_url: ...`). The legacy `custom_providers` key expects a **list** format, and dict-format entries are silently rejected with `logger.warning("custom_providers is a dict, not a list")` → returns `None` → cron fails with "Unknown provider". Use the `providers:` key (new-style dict format, `api:` field for base URL) instead.
- **Model MUST be explicit:** Cron jobs don't inherit the creator's model — null/empty model causes API 400 with providers like DeepSeek. Always set `model` when creating/updating.
- **Gateway change is a write operation:** Restarting the gateway or editing live config requires user approval (permission model above). If the gateway needs to pick up config changes, ask first.

### Omniroute
- Container: `omniroute` on micasa, port 20128, Docker network IP 172.17.0.32
- Purpose: Self-hosted LLM router — preferred over cloud providers for automated tasks
- Models: `free-medium`, `free-high`

### Cron Job Debugging
See `references/cron-provider-debugging.md` for the resolution testing procedure and common failure patterns.
