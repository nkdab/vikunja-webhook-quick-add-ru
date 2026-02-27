# Second Brain Orchestrator

Vikunja webhook enrichment service. Listens for `task.created` events and automatically parses Russian/English quick-add markers from the task title to set due dates, priorities, projects, labels, and recurrence.

## Quick-add syntax

| Marker | Meaning |
|---|---|
| `сегодня` / `today` | Due today 23:59 |
| `завтра` / `tomorrow` | Due tomorrow 23:59 |
| `послезавтра` | Due in 2 days 23:59 |
| `через N дней` | Due in N days 23:59 |
| `в понедельник` … | Next weekday 23:59 |
| `в 18:00` / `18:30` / `в 9` | Specific time (today, or tomorrow if passed) |
| `утром` / `днем` / `вечером` / `ночью` | 08:00 / 13:00 / 20:00 / 23:00 |
| `каждый день` | Repeat daily |
| `каждую неделю` | Repeat weekly |
| `каждый вторник` | Repeat weekly, next Tuesday |
| `каждый месяц` | Repeat monthly |
| `каждое 14 число` | Repeat monthly on the 14th |
| `каждый час` / `каждые 2 часа` | Repeat hourly |
| `!срочно` / `!важно` | Priority 5 / 4 |
| `!1` … `!5` | Explicit priority |
| `+Дом` / `+"Большой проект"` | Assign to project |
| `*быт` / `*"очень важное"` | Attach labels |

**Example:**
```
вынести мусор каждый вторник вечером !важно +Дом *быт
```
→ title: `Вынести мусор`, due: next Tuesday 20:00, repeat weekly, priority 4, project Дом, label быт.

## Setup

### 1. Get a Vikunja API token

1. Log in to your Vikunja instance.
2. Go to **Settings → API Tokens** and create a token with full task access.

### 2. Enable webhooks in Vikunja

1. Go to **Settings → Webhooks** (or project-level webhooks).
2. Add a new webhook:
   - **Target URL:** `http://<orchestrator-host>:3000/webhooks/vikunja`
   - **Events:** `task.created`

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Run locally (dev)

```bash
npm install
npm run dev
```

### 5. Run with Docker

```bash
docker build -t second-brain-orchestrator .
docker run --env-file .env -p 3000:3000 second-brain-orchestrator
```

Or with Docker Compose alongside Vikunja:

```yaml
services:
  orchestrator:
    image: ghcr.io/<your-org>/second-brain-orchestrator:latest
    env_file: .env
    ports:
      - "3000:3000"
    restart: unless-stopped
```

## GitHub Actions

On every push to `main`, the workflow in `.github/workflows/docker.yml` builds and pushes:

- `ghcr.io/<owner>/<repo>:latest`
- `ghcr.io/<owner>/<repo>:<short-sha>`

No additional secrets are needed — it uses `GITHUB_TOKEN`.

## Health check

```
GET /health
→ { "status": "ok", "timestamp": "..." }
```
