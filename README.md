# Four Seasons Digital — Baymard UX Audit Tracker

A Dockerized web application for tracking progress on closing 41 Baymard UX audit findings across the Four Seasons digital ecosystem. Built with Node.js + Express, PostgreSQL, and Docker Compose.

## Features

- **Executive Summary** (default page) — High-level board/executive view with KPI cards, overall progress bar, and channel sections (Website / Mobile App) organized by bucket with done/in-progress/pending indicators.
- **Progress Tracker** — Detailed roadmap table for product, engineering, design, and content teams. Includes:
  - Big channel tabs (All / Website / App)
  - Three view modes: Roadmap Table, Timeline View, By Theme
  - Theme pillbox filters, status/owner dropdowns, and search
  - Expandable row details with current state, recommendation, action plan, and metadata
  - **Status editing** with name-required traceability and full change history
  - 8-stage status workflow: Identified → Ticket Created → In Planning → In Design → In Development → In QA → In UAT → In Production
- **Shared PostgreSQL database** — All status changes are stored server-side, so they're visible to every user (not per-device localStorage).
- **Brand-compliant styling** — Four Seasons internal brand style: Saol Display Light headlines, Helvetica Neue body, Ever Green palette, Earthen accents.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 + Express |
| Database | PostgreSQL 16 |
| Frontend | Vanilla HTML/CSS/JS (no build step) |
| Deployment | Docker Compose (app + DB containers) |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### Run with Docker Compose

```bash
# Clone or copy the project directory
cd baymard-tracker

# Build and start both containers (app + database)
docker compose up --build

# The app will be available at:
# http://localhost:3000
```

That's it. Docker Compose will:
1. Start a PostgreSQL 16 database container
2. Build and start the Node.js app container
3. The app auto-initializes the database tables on startup

### Stop the app

```bash
docker compose down

# To also remove the database volume (deletes all data):
docker compose down -v
```

## Local Development (without Docker)

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (running locally or remotely)

### Steps

```bash
# Install dependencies
npm install

# Set environment variables (edit as needed for your DB)
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=baymard_tracker
export DB_USER=fs_tracker
export DB_PASSWORD=fs_tracker_secret

# Start the server
npm start

# Or with auto-reload on file changes:
npm run dev
```

The app will be available at `http://localhost:3000`.

## Configuration

All configuration is via environment variables (with defaults):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the Express server listens on |
| `DB_HOST` | `db` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `baymard_tracker` | Database name |
| `DB_USER` | `fs_tracker` | Database user |
| `DB_PASSWORD` | `fs_tracker_secret` | Database password |
| `DB_SSL` | `false` | Set to `true` to enable SSL for remote DB connections |

### Using a Remote/External Database

To use an external PostgreSQL database instead of the Docker Compose database:

1. Create a database and user on your remote PostgreSQL instance.
2. Run the schema in `db/init.sql` against your database.
3. Set the environment variables to point to your remote DB:

```yaml
# docker-compose.yml (app service environment section)
environment:
  DB_HOST: your-remote-db.example.com
  DB_PORT: 5432
  DB_NAME: baymard_tracker
  DB_USER: your_user
  DB_PASSWORD: your_password
  DB_SSL: 'true'
```

4. Remove or comment out the `db` service and `depends_on` block if you don't need the local database container.

## REST API

The app exposes a REST API for status management:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/statuses` | Get all status overrides |
| `GET` | `/api/statuses/:itemKey` | Get status for a specific item |
| `PUT` | `/api/statuses/:itemKey` | Create/update a status override (requires `status` and `updatedBy` in body) |
| `GET` | `/api/history/:itemKey` | Get change history for a specific item |
| `GET` | `/api/history` | Get all change history (optional `?limit=N`, max 500) |

### Example: Update a status

```bash
curl -X PUT http://localhost:3000/api/statuses/WEB%7C1866%7CCAW%20-%20mobile%7C%231866%20Make%20the%20%E2%80%9Cbooking%E2%80%9D \
  -H "Content-Type: application/json" \
  -d '{"status": "In Development", "updatedBy": "Jane Doe"}'
```

## Project Structure

```
baymard-tracker/
├── server.js                 # Express server (static files + REST API)
├── package.json              # Node.js dependencies and scripts
├── Dockerfile                # Container image definition for the app
├── docker-compose.yml        # Orchestrates app + PostgreSQL containers
├── db/
│   └── init.sql              # PostgreSQL schema (auto-run by Compose)
├── public/                   # Static frontend assets
│   ├── index.html            # Executive Summary page (default)
│   ├── roadmap-tracker.html  # Progress Tracker page
│   ├── css/
│   │   ├── brand.css         # Shared brand styles (fonts, colors, header, nav)
│   │   ├── executive.css     # Executive Summary page-specific styles
│   │   └── tracker.css       # Progress Tracker page-specific styles
│   ├── js/
│   │   ├── status.js         # Shared status logic + REST API layer
│   │   ├── executive.js      # Executive Summary page logic
│   │   ├── tracker.js        # Progress Tracker page logic
│   │   └── data.json         # 41-item Baymard audit dataset
│   └── fonts/
│       ├── saoldisplay-light.woff2
│       ├── saoldisplay-lightitalic.woff2
│       └── saolstandard-light.woff2
└── README.md                 # This file
```

## Database Schema

### `status_overrides`
Stores the current overridden status for each audit finding.

| Column | Type | Description |
|--------|------|-------------|
| `item_key` | VARCHAR(255) PK | Unique key for the finding (channel\|guidelineId\|page\|guideline) |
| `status` | VARCHAR(100) | Current status (one of the 8 workflow stages) |
| `updated_by` | VARCHAR(255) | Name of the person who last changed the status |
| `updated_at` | TIMESTAMP | When the status was last changed |

### `status_history`
Full audit trail of every status change.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-incrementing ID |
| `item_key` | VARCHAR(255) | The finding key |
| `old_status` | VARCHAR(100) | Previous status |
| `new_status` | VARCHAR(100) | New status |
| `changed_by` | VARCHAR(255) | Name of the person who made the change |
| `note` | TEXT | Optional note |
| `changed_at` | TIMESTAMP | When the change was made |

## Status Workflow

The 8-stage status workflow, in order:

1. **Identified** — Finding has been identified and logged
2. **Ticket Created** — A JIRA/product ticket has been created
3. **In Planning** — Being scoped and planned
4. **In Design** — Design work in progress
5. **In Development** — Engineering work in progress
6. **In QA** — Quality assurance testing
7. **In UAT** — User acceptance testing
8. **In Production** — Live and addressed

## Brand Styling

This app follows the Four Seasons internal brand style (June 2026 identity):

- **Headlines:** Saol Display Light (font-weight: 300)
- **Body:** Helvetica Neue
- **Primary color:** Ever Green `#3D441E`
- **Accent color:** Earthen `#B6533E` (used for active nav, data viz)
- **Page background:** White Sand `#FFFCF9`
- **Borders:** Warm Stone `#CBC4BC`
- **Progress bar:** Grey → Blue shades → Green (universally comprehensible)

## Data Source

The 41 audit findings are derived from the Baymard UX audit spreadsheet:
- **"Readout for Brian (End of 2026)"** tab — executive-facing fields
- **Action Plan tabs** (Web & Mobile) — source data
- **Product Backlog** tab — guideline ID mapping

## License

Internal use only. Four Seasons Digital.
