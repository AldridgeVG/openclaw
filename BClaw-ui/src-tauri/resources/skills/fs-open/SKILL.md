---
name: fs-open
description: >
  FSCUT Open Platform (Friendess/Bochu) API integration for industrial laser cutting and welding machines.
  Use this skill when the user needs to: (1) Query real-time or historical data from cutting/welding machines,
  (2) Upload cutting or welding tasks to machines, (3) Manage machine lists and view machine details,
  (4) Get statistics (laser-on time, cutting length, weld metrics, etc.), (5) Authenticate with FSCUT APIs.
  Covers cutting-machine (alarms, system state, statistics, task upload) and welding-machine
  (status, coordinates, welding params, statistics, task upload) APIs.
---

# FSCUT Open Platform - Master Skill

## Authentication

Before any API call, the agent **must** obtain credentials from the user:

1. **Ask the user** for their `appId` and `appSecret` (from https://open.fscut.com/#/user)
2. **Set environment variables** or pass as CLI arguments:
   ```bash
   export FS_OPEN_APP_ID="your_app_id"
   export FS_OPEN_APP_SECRET="your_app_secret"
   ```
3. If not provided via env/args, scripts will **prompt interactively** for credentials

## Available Scripts

| Domain             | Script Path                     | Purpose                                       |
| ------------------ | ------------------------------- | --------------------------------------------- |
| Getting Started    | `scripts/fs_open_client.py`     | Shared client library (import only)           |
| Cutting Real-time  | `scripts/cutting_realtime.py`   | Alarms, current work, system state            |
| Cutting Statistics | `scripts/cutting_statistics.py` | Period summary + 7 daily metrics              |
| Cutting Task       | `scripts/cutting_task.py`       | Upload cutting files                          |
| Welding Management | `scripts/welding_management.py` | Machine list, details, status records         |
| Welding Real-time  | `scripts/welding_realtime.py`   | Operating status, welding system state        |
| Welding Statistics | `scripts/welding_statistics.py` | Work logs + period summary + 10 daily metrics |
| Welding Task       | `scripts/welding_task.py`       | Upload welding files                          |

## Quick Reference

### Cutting Machine

- **Real-time data**: `python scripts/cutting_realtime.py <alarms|work|state> --card-id <ID>`
- **Statistics**: `python scripts/cutting_statistics.py <sum|alarm-time|pierce-count|laser-on|gas-on|cut-length|move-length|cut-time> --card-id <ID> --start-date YYYYMMDD --end-date YYYYMMDD`
- **Upload task**: `python scripts/cutting_task.py --card-id <ID> --file <PATH> --task-name <NAME>`

### Welding Machine

- **Management**: `python scripts/welding_management.py <list|detail|records> [--card-id <ID>]`
- **Real-time**: `python scripts/welding_realtime.py <status|state> --card-id(s) <ID>`
- **Statistics**: `python scripts/welding_statistics.py <sum|work-logs|idle-time|...> --card-id <ID> --start-date YYYYMMDD --end-date YYYYMMDD`
- **Upload task**: `python scripts/welding_task.py --card-id <ID> --file <PATH> --task-guid <GUID>`

### Common Options

- `--app-id` / `--app-secret` — Override env vars
- `--zone-id` — IANA time zone (e.g., `America/New_York`)
- `--json` — Output raw JSON instead of formatted tables
- All scripts auto-prompt for credentials if not provided

## API Constraints

- Statistics: date range must be within last **3 months**
- Status records: start/end must be within **same day**, within last **100 days**
- Machine quota: only "available machines" in the user's list can be queried
- Rate limits: check in Personal Center at https://open.fscut.com

## Error Codes

See `getting-started/SKILL.md` for full error code reference.
