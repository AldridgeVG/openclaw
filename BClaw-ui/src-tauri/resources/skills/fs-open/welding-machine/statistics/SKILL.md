---
name: fs-open-welding-machine-statistics
description: >
  Query statistics from FSCUT welding machines by executing Python scripts.
  Use this skill when the user wants to: (1) Get summary welding statistics
  (weld time, weld length, flat/vertical metrics, pass count),
  (2) Query daily metrics (idle time, flat/vertical weld length/time,
  weld length, weld time, weld-pass count, processing time),
  (3) Query paged welding processing records with detailed info.
  Date range must be within last 3 months.
---

# Welding Machine - Statistics

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Available Commands

### Summary Statistics

```bash
python scripts/welding_statistics.py sum --card-id <CARD_ID> --start-date YYYYMMDD --end-date YYYYMMDD
```

Returns: weld time/length, flat/vertical weld time/length, weld pass count, work/idle time.

### Paged Work Logs

```bash
python scripts/welding_statistics.py work-logs --card-id <CARD_ID> \
  --start-time "yyyy-MM-dd HH:mm:ss" \
  --end-time "yyyy-MM-dd HH:mm:ss" \
  [--page-number 0] [--page-size 30]
```

Returns: file name, start/end time, weld time, weld length, pass count, etc.

### Daily Metrics

```bash
python scripts/welding_statistics.py idle-time --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py flat-weld-length --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py flat-weld-time --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py vertical-weld-length --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py vertical-weld-time --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py weld-length --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py weld-time --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py weld-pass-count --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/welding_statistics.py work-time --card-id <ID> --start-date 20230201 --end-date 20230207
```

### Options

- `--app-id`, `--app-secret` — Override env vars
- `--zone-id` — Time zone
- `--json` — Raw JSON output

## Constraints

- `sum` and daily metrics: dates within last **3 months**, format `yyyyMMdd`
- `work-logs`: times within last **3 months**, format `yyyy-MM-dd HH:mm:ss`
- `pageSize` range: **[1, 1000]**

## API Endpoints (referenced by script)

| Command              | Endpoint                                     |
| -------------------- | -------------------------------------------- |
| sum                  | `/api/statistics/sum/weld`                   |
| work-logs            | `/api/statistics/work_logs/v2`               |
| idle-time            | `/api/statistics/daily/idle_time`            |
| flat-weld-length     | `/api/statistics/daily/flat_weld_length`     |
| flat-weld-time       | `/api/statistics/daily/flat_weld_time`       |
| vertical-weld-length | `/api/statistics/daily/vertical_weld_length` |
| vertical-weld-time   | `/api/statistics/daily/vertical_weld_time`   |
| weld-length          | `/api/statistics/daily/weld_length`          |
| weld-time            | `/api/statistics/daily/weld_time`            |
| weld-pass-count      | `/api/statistics/daily/weld_pass_count`      |
| work-time            | `/api/statistics/daily/work_time`            |
