---
name: fs-open-cutting-machine-statistics
description: >
  Query historical statistics from FSCUT cutting machines by executing Python scripts.
  Use this skill when the user wants to: (1) Get summary statistics for a time period
  (laser-on time, cut time, idle time, cut length, pierce count, gas-on time),
  (2) Query daily metrics (alarm duration, piercing count, laser-on time, gas-on time,
  cutting length, traveling distance, processing time).
  Date range must be within last 3 months.
---

# Cutting Machine - Statistics

## Prerequisites

Ensure credentials are set (ask user for appId/appSecret if needed):

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

## Available Commands

### Summary Statistics

```bash
python scripts/cutting_statistics.py sum --card-id <CARD_ID> --start-date YYYYMMDD --end-date YYYYMMDD
```

Returns: laser-on time, cut time, idle time, cut length, move length, pierce count, gas-on time.

### Daily Metrics

```bash
python scripts/cutting_statistics.py alarm-time --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py pierce-count --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py laser-on --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py gas-on --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py cut-length --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py move-length --card-id <ID> --start-date 20230201 --end-date 20230207
python scripts/cutting_statistics.py cut-time --card-id <ID> --start-date 20230201 --end-date 20230207
```

### Options

- `--app-id`, `--app-secret` — Override env vars
- `--zone-id <TZ>` — Time zone
- `--json` — Raw JSON output

## Constraints

- Date range must be within last **3 months**
- Dates as integer `yyyyMMdd` (e.g., `20230201`)

## API Endpoints (referenced by script)

| Command      | Endpoint                             |
| ------------ | ------------------------------------ |
| sum          | `/api/statistics/sum`                |
| alarm-time   | `/statistics/daily/alarm_time`       |
| pierce-count | `/api/statistics/daily/pierce_count` |
| laser-on     | `/api/statistics/daily/laser_on`     |
| gas-on       | `/api/statistics/daily/gas_on`       |
| cut-length   | `/api/statistics/daily/cut_length`   |
| move-length  | `/api/statistics/daily/move_length`  |
| cut-time     | `/api/statistics/daily/cut_time`     |
