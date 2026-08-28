# Deployment Guide

## Local Development

Start the API:

```bash
cd services/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Start the UI:

```bash
cd apps/web
npm install
npm run dev
```

## Docker Deployment

```bash
cp .env.example .env
docker compose up --build -d
```

Use paper trading first. Confirm `/status` reports `live_trading_unlocked: false` unless you intentionally enabled live mode.

## Production Notes

- Put the stack behind a private VPN or authenticated reverse proxy.
- Use HTTPS for any remote access.
- Store secrets in a secrets manager or deployment platform, not in Git.
- Add persistent storage for PostgreSQL and Grafana.
- Configure log retention and export.
- Add backups before storing real trade journals.

## Android Access

When the UI is running on a Windows PC or VPS, connect from the Samsung S24 Ultra through the same private network or VPN and open the web URL. The layout collapses into a single-column mobile view while preserving charts, alerts, reasons, and mode controls.
