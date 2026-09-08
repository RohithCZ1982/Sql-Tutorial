# SQL Window (local Postgres)

Small demo: a web "SQL window" that sends SELECT queries to a local PostgreSQL instance.

Prerequisites
- Node.js (14+)
- A running local PostgreSQL server (defaults: host=localhost port=5432)

Setup

1. From the project root, install dependencies:

```bash
npm install
```

2. Configure connection (optional): set environment variables if different from defaults:

```bash
export PGHOST=localhost
export PGUSER=postgres
export PGPASSWORD=yourpassword
export PGDATABASE=postgres
export PGPORT=5432
```

On Windows (PowerShell):

```powershell
$env:PGPASSWORD = "yourpassword"
```

Run

```bash
npm start
# then open http://localhost:3000/sql.html
```

Notes & safety
- This demo restricts queries to `SELECT` statements only.
- Running arbitrary SQL against your local DB can be dangerous — use a non-production DB.

Files
- [server.js](server.js) — backend server
- [public/sql.html](public/sql.html) — frontend SQL window
