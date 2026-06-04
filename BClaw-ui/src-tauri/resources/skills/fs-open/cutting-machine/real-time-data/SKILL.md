---
name: fs-open-cutting-machine-real-time
description: >
  Query real-time data from FSCUT cutting machines by executing Python scripts.
  Use this skill when the user wants to: (1) Get current alarms of a cutting machine,
  (2) Check what task a machine is currently processing, (3) Read real-time cutting system
  state (axis positions, laser power, gas, progress).
  Script will prompt for appId/appSecret if not provided.
---

# Cutting Machine - Real-time Data

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Available Commands

### Query Current Alarms

```bash
python scripts/cutting_realtime.py alarms --card-id <CARD_ID>
```

Returns: alarm code, description, and start time for each active alarm.

### Query Ongoing Processing Task

```bash
python scripts/cutting_realtime.py work --card-id <CARD_ID>
```

Returns: filename, portion ID, and start time (or "No active task").

### Query Real-time Cutting System State

```bash
python scripts/cutting_realtime.py state --card-id <CARD_ID>
```

Returns: axis positions (X/Y/Z), work speed, progress %, laser power, gas type/pressure, PWM settings.

### Options

- `--app-id`, `--app-secret` — Override env vars
- `--zone-id <TZ>` — Time zone (e.g., `America/New_York`)
- `--json` — Raw JSON output

## API Endpoints (referenced by script)

| Command | Endpoint                             | Method |
| ------- | ------------------------------------ | ------ |
| alarms  | `/api/user_devices/current_alarms`   | POST   |
| work    | `/api/user_devices/current_work`     | POST   |
| state   | `/api/user_devices/cut_system_state` | POST   |
