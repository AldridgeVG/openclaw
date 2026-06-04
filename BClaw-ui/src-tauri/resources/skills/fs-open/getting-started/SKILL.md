---
name: fs-open-getting-started
description: >
  FSCUT Open Platform API authentication, error codes, machine quota, and rate limits.
  Use this skill when the user needs help with: (1) Getting started with FSCUT APIs for the first time,
  (2) Authentication (appId, appSecret, header generation), (3) Understanding error codes,
  (4) Machine quota or API rate limit questions.
---

# FSCUT Open Platform - Getting Started

## Authentication

### Required Credentials

| Credential  | How to Obtain                                    |
| ----------- | ------------------------------------------------ |
| `appId`     | Personal Center at https://open.fscut.com/#/user |
| `appSecret` | Same page (sensitive — keep secure)              |

### Providing Credentials to Scripts

**Method 1: Environment variables (recommended)**

```bash
export FS_OPEN_APP_ID="your_app_id"
export FS_OPEN_APP_SECRET="your_app_secret"
```

**Method 2: CLI arguments**

```bash
python scripts/cutting_realtime.py alarms --card-id 123 --app-id YOUR_ID --app-secret YOUR_SECRET
```

**Method 3: Interactive prompt** (scripts will ask if not provided)

### Auth Header Generation

Scripts auto-generate headers (`app-id`, `time-stamp`, `app-sign`):

```python
timestamp = int(time.time() * 1000)
app_sign = MD5(appId + appSecret + timestamp)
```

## Global Error Codes

| Code | Description                          | Solution                                  |
| ---- | ------------------------------------ | ----------------------------------------- |
| 1000 | Missing "app-id" header              | Check header carries "app-id"             |
| 1001 | "app-id" unauthenticated             | Verify app-id in Personal Center          |
| 1002 | appId expired                        | Contact Bochu customer service            |
| 1003 | "time-stamp" illegal                 | Check timestamp is within +/- 10 min      |
| 1004 | Missing "app-sign" header            | Check header carries "app-sign"           |
| 1005 | "app-sign" signature illegal         | Verify MD5(appId + appSecret + timestamp) |
| 1006 | Request body format incorrect        | Ensure body is valid JSON                 |
| 1007 | Role does not support this API       | Contact customer service                  |
| 1008 | Exceeded daily API quota             | Purchase upgrade pack                     |
| 1009 | Call frequency exceeds limit         | Reduce call frequency                     |
| 1010 | Uncontrollable machine tool          | Confirm correct cardId                    |
| 1011 | cardIds not in collection format     | Use array format                          |
| 1012 | startDate/endDate format incorrect   | Use "yyyyMMdd"                            |
| 1013 | startTime/endTime format incorrect   | Use "yyyy-MM-dd HH:mm:ss"                 |
| 1014 | Time info illegal / beyond 3 months  | Check dates within last 3 months          |
| 1100 | Unknown exception                    | Contact customer service                  |
| 1101 | Project initialization exception     | Contact customer service                  |
| 1102 | Gateway internal logic error         | Contact customer service                  |
| 1103 | Gateway internal error               | Contact customer service                  |
| 1200 | Specified user not found             | Contact customer service                  |
| 2200 | Request parameter abnormal           | Correct request content                   |
| 2201 | Open Platform backend internal error | Contact customer service                  |

## Machine Quota

| Term               | Description                           |
| ------------------ | ------------------------------------- |
| Machine List       | Every user (appId) has a machine list |
| Available Machine  | Can be called by API                  |
| User Machine Quota | Max machines a user can control       |

- Free users: only "Certified Machines"
- Paid users: any machine (with owner permission)

## API Quota & Rate Limit

| Term           | Description          |
| -------------- | -------------------- |
| API Quota      | Max daily API calls  |
| API Rate Limit | Max calls per second |

- Check quota in Personal Center
- Increase quota via online market
- Rate limit cannot be increased by purchase

## Time Zone Support

Optional `zoneId` header for time zone-aware queries:

- IANA Time Zone Database ID (e.g., `America/New_York`)
- Default: `Asia/Shanghai`

```bash
python scripts/cutting_statistics.py sum --card-id 123 --start-date 20230201 --end-date 20230207 --zone-id Europe/Berlin
```
