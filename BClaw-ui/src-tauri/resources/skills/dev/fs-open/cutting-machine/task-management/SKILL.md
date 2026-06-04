---
name: fs-open-cutting-machine-task
description: >
  Upload cutting task files to FSCUT machines by executing Python scripts.
  Use this skill when the user wants to: (1) Upload a cutting file to a machine,
  (2) Create a cutting task with a name and process amount.
  Supports: dxf, lxds, lxd, nrp, nrp2, zx, nc, cnc, plt, slp (max 100MB).
---

# Cutting Machine - Task Management

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Upload Task

```bash
python scripts/cutting_task.py \
  --card-id <CARD_ID> \
  --file <FILE_PATH> \
  --task-name <TASK_NAME> \
  [--task-amount N]
```

### Examples

```bash
# Basic upload
python scripts/cutting_task.py --card-id 123456789100 --file ./drawing.dxf --task-name "Batch-001"

# With amount
python scripts/cutting_task.py --card-id 123456789100 --file ./part.lxds --task-name "Part-A" --task-amount 5
```

### Options

- `--card-id` (required) — Control card ID
- `--file` (required) — Path to cutting file
- `--task-name` (required) — Task name
- `--task-amount` (default: 1) — Expected process times
- `--app-id`, `--app-secret` — Override env vars
- `--zone-id` — Time zone
- `--json` — Raw JSON output

### Supported File Formats

`dxf`, `lxds`, `lxd`, `nrp`, `nrp2`, `zx`, `nc`, `cnc`, `plt`, `slp`

### Constraints

- File size limit: **100MB**
- `taskAmount` must be >= 1
- `cardId` must be an authenticated machine within quota

## API Endpoint (referenced by script)

```
POST /upload/api/device_tasks/upload/cut
```
