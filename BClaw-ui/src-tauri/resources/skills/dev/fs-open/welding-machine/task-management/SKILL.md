---
name: fs-open-welding-machine-task
description: >
  Upload welding task files to FSCUT machines by executing Python scripts.
  Use this skill when the user wants to: (1) Upload a welding file (ifc/cfi) to a machine,
  (2) Create a welding task with project code, job code, and task GUID.
  The combination projectCode + jobCode + taskGuid forms a unique key.
---

# Welding Machine - Task Management

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Upload Task

```bash
python scripts/welding_task.py \
  --card-id <CARD_ID> \
  --file <FILE_PATH> \
  --task-guid <TASK_GUID> \
  [--task-amount N] \
  [--project-code <CODE>] \
  [--job-code <CODE>] \
  [--extra-info-json '<JSON>']
```

### Examples

```bash
# Basic upload
python scripts/welding_task.py --card-id 123456789100 --file ./part.ifc --task-guid "comp-001"

# With project/job codes
python scripts/welding_task.py --card-id 123456789100 --file ./weld.cfi --task-guid "comp-002" \
  --project-code P202409110846 --job-code J-2996-GH

# With extra metadata
python scripts/welding_task.py --card-id 123456789100 --file ./part.ifc --task-guid "comp-003" \
  --extra-info-json '{"multiPass":true, "passCount":3, "metal":"Al"}'
```

### Options

- `--card-id` (required) — Control card ID
- `--file` (required) — Path to welding file
- `--task-guid` (required) — Task GUID (unique within project+job)
- `--task-amount` (default: 1) — Expected process times
- `--project-code` — Project code (part of unique key)
- `--job-code` — Job code (part of unique key)
- `--extra-info-json` — Custom metadata JSON string (max 1000 chars)
- `--app-id`, `--app-secret` — Override env vars
- `--zone-id` — Time zone
- `--json` — Raw JSON output

### Supported File Formats

`ifc`, `cfi` (max **100MB**)

### Constraints

- `taskAmount` must be >= 1
- `extraInfoJson` max 1000 characters
- `cardId` must be authenticated machine within quota

## API Endpoint (referenced by script)

```
POST /upload/api/device_tasks/upload/weld
```
