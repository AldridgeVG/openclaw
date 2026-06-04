---
name: fs-open-welding-machine-real-time
description: >
  Query real-time data from FSCUT welding machines by executing Python scripts.
  Use this skill when the user wants to: (1) Check operating status of one or more machines
  (OFFLINE, WORKING, ALARMING, IDLE, etc.), (2) Read real-time welding system state
  (robot/gantry axis coordinates, TCP position, welding current/voltage).
---

# Welding Machine - Real-time Data

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Available Commands

### Query Operating Status (batch)

```bash
python scripts/welding_realtime.py status --card-ids <ID1>,<ID2>,...
```

Returns: card ID and current state for each machine.

States: `OFFLINE`, `WORKING`, `ALARMING`, `IDLE`, `UNKNOWN`, `CLOSE`, `PAUSE`, `STOP`

### Query Welding System State

```bash
python scripts/welding_realtime.py state --card-id <CARD_ID>
```

Returns: robot/gantry/universal axis coordinates (radians/mm), axis speeds (RPM/mm/s), TCP position, welding current (A), welding voltage (V).

### Options

- `--app-id`, `--app-secret` — Override env vars
- `--zone-id` — Time zone
- `--json` — Raw JSON output

## API Endpoints (referenced by script)

| Command | Endpoint                              |
| ------- | ------------------------------------- |
| status  | `/api/user_devices/current_state`     |
| state   | `/api/user_devices/weld_system_state` |
