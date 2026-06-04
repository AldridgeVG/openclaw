---
name: fs-open-welding-machine-management
description: >
  Manage FSCUT welding machines by executing Python scripts.
  Use this skill when the user wants to: (1) List all authenticated machines,
  (2) Get detailed info about a specific machine, (3) Query status change records
  within a time period (OFFLINE, IDLE, WORK, PAUSE, ALARM, PLC, UNKNOWN).
---

# Welding Machine - Machine Management

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Available Commands

### List All Machines

```bash
python scripts/welding_management.py list
```

Returns: nickname, software name, version, card ID for each machine.

### Machine Details

```bash
python scripts/welding_management.py detail --card-id <CARD_ID>
```

Returns: nickname, software, serial, laser model/power, work area, license expiry.

### Status Change Records

```bash
python scripts/welding_management.py records --card-id <CARD_ID> \
  --start-time "yyyy-MM-dd HH:mm:ss" \
  --end-time "yyyy-MM-dd HH:mm:ss"
```

Returns: time periods with status (OFFLINE, IDLE, WORK, PAUSE, ALARM, PLC, UNKNOWN).

### Constraints for records

- Start/end must be **within the same day**
- Only records from last **100 days** are saved

### Options

- `--app-id`, `--app-secret` — Override env vars
- `--zone-id` — Time zone
- `--json` — Raw JSON output

## API Endpoints (referenced by script)

| Command | Endpoint                         |
| ------- | -------------------------------- |
| list    | `/api/user_devices`              |
| detail  | `/api/user_devices/detail`       |
| records | `/api/user_devices/time_periods` |
