#!/usr/bin/env python3
"""
FSCUT Open Platform - Welding Machine Statistics Executor
Queries: paged work logs, summary stats, daily idle/flat/vertical weld metrics,
         daily weld length/time/pass count, daily work time

Usage:
    python welding_statistics.py <command> [options]

Commands:
    work-logs          Paged welding processing records
    sum                Summary statistics for the period
    idle-time          Daily idle time
    flat-weld-length   Daily flat-weld length
    flat-weld-time     Daily flat-weld time
    vertical-weld-length Daily vertical-weld length
    vertical-weld-time Daily vertical-weld time
    weld-length        Daily weld length
    weld-time          Daily weld time
    weld-pass-count    Daily weld-pass count
    work-time          Daily processing time

Options:
    --app-id, --app-secret, --card-id, --start-date, --end-date,
    --start-time, --end-time, --page-number, --page-size, --time-desc,
    --zone-id, --json

Examples:
    python welding_statistics.py sum --card-id 123456789100 --start-date 20230201 --end-date 20230207
    python welding_statistics.py work-logs --card-id 123456789100 --start-time "2023-05-01 00:00:00" --end-time "2023-05-17 15:00:00"
    python welding_statistics.py weld-time --card-id 123456789100 --start-date 20230201 --end-date 20230207
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTClient, FSCUTAPIError, FSCUTAuthError, get_client, print_json


def format_daily_list(data: dict, value_key: str, title: str, unit: str = ""):
    items = data.get("data", {}).get("list", [])
    if not items:
        print(f"No data found for {title}.")
        return
    u = f" ({unit})" if unit else ""
    print(f"\n{title}{u}")
    print(f"{'Date':<12} {value_key}")
    print("-" * 30)
    for item in items:
        date_str = str(item.get("statDate", "N/A"))
        formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
        value = item.get(value_key, "N/A")
        if isinstance(value, float):
            value = f"{value:.2f}"
        print(f"{formatted_date:<12} {value}")
    print(f"\nTotal: {len(items)} day(s)")


def format_summary(data: dict):
    stats = data.get("data", {})
    if not stats:
        print("No summary data found.")
        return
    print(f"\n{'Metric':<25} {'Value':<15} Unit")
    print("-" * 55)
    fields = [
        ("Weld Time", "weldTime", "s"), ("Weld Length", "weldLength", "mm"),
        ("Flat Weld Time", "flatWeldTime", "s"), ("Flat Weld Length", "flatWeldLength", "mm"),
        ("Vertical Weld Time", "verticalWeldTime", "s"), ("Vertical Weld Length", "verticalWeldLength", "mm"),
        ("Weld Pass Count", "weldPassCount", ""), ("Work Time", "workTime", "s"), ("Idle Time", "idleTime", "s"),
    ]
    for label, key, unit in fields:
        value = stats.get(key, "N/A")
        if isinstance(value, float):
            value = f"{value:.2f}"
        print(f"{label:<25} {str(value):<15} {unit}")


def format_work_logs(data: dict):
    result = data.get("data", {})
    items = result.get("list", [])
    meta = result.get("meta", {})
    if not items:
        print("No work logs found.")
        return
    print(f"\nTotal Records: {meta.get('total', 'N/A')} | Sync Time: {meta.get('syncTime', 'N/A')}")
    print(f"\n{'File':<35} {'Start':<18} {'End':<18} {'State':<8} {'Weld Time(s)':<12}")
    print("-" * 100)
    end_states = {0: "Done", -1: "Running", 1: "Paused", 2: "Stopped"}
    for item in items:
        fname = item.get("fileName", "N/A")
        if len(fname) > 33:
            fname = "..." + fname[-30:]
        state = end_states.get(item.get("endState"), "?")
        print(f"{fname:<35} {item.get('startTime', 'N/A'):<18} {item.get('endTime', 'N/A'):<18} "
              f"{state:<8} {item.get('weldingTime', 'N/A'):<12}")
    print(f"\nShowing {len(items)} record(s)")


def main():
    parser = argparse.ArgumentParser(description="Welding Machine Statistics Query")
    parser.add_argument("command", choices=[
        "work-logs", "sum", "idle-time", "flat-weld-length", "flat-weld-time",
        "vertical-weld-length", "vertical-weld-time", "weld-length", "weld-time",
        "weld-pass-count", "work-time",
    ])
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", required=True)
    parser.add_argument("--start-date", type=int, help="Start date (YYYYMMDD)")
    parser.add_argument("--end-date", type=int, help="End date (YYYYMMDD)")
    parser.add_argument("--start-time", help="Start time (yyyy-MM-dd HH:mm:ss)")
    parser.add_argument("--end-time", help="End time (yyyy-MM-dd HH:mm:ss)")
    parser.add_argument("--page-number", type=int, default=0)
    parser.add_argument("--page-size", type=int, default=30)
    parser.add_argument("--time-desc", type=bool, default=True)
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    # Commands using startDate/endDate
    date_cmds = {
        "sum":               ("/api/statistics/sum/weld", format_summary, None, None),
        "idle-time":         ("/api/statistics/daily/idle_time", format_daily_list, "idleTime", "seconds"),
        "flat-weld-length":  ("/api/statistics/daily/flat_weld_length", format_daily_list, "flatWeldLength", "mm"),
        "flat-weld-time":    ("/api/statistics/daily/flat_weld_time", format_daily_list, "flatWeldTime", "seconds"),
        "vertical-weld-length":("/api/statistics/daily/vertical_weld_length", format_daily_list, "verticalWeldLength", "mm"),
        "vertical-weld-time":("/api/statistics/daily/vertical_weld_time", format_daily_list, "verticalWeldTime", "seconds"),
        "weld-length":       ("/api/statistics/daily/weld_length", format_daily_list, "weldLength", "mm"),
        "weld-time":         ("/api/statistics/daily/weld_time", format_daily_list, "weldTime", "seconds"),
        "weld-pass-count":   ("/api/statistics/daily/weld_pass_count", format_daily_list, "weldPassCount", ""),
        "work-time":         ("/api/statistics/daily/work_time", format_daily_list, "workTime", "seconds"),
    }

    try:
        if args.command == "work-logs":
            if not args.start_time or not args.end_time:
                print("ERROR: --start-time and --end-time are required for work-logs")
                sys.exit(1)
            result = client.post("/api/statistics/work_logs/v2", {
                "cardId": args.card_id, "startTime": args.start_time, "endTime": args.end_time,
                "pageNumber": args.page_number, "pageSize": args.page_size, "timeDesc": args.time_desc,
            }, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_work_logs(result)
        else:
            if not args.start_date or not args.end_date:
                print(f"ERROR: --start-date and --end-date are required for '{args.command}'")
                sys.exit(1)
            endpoint, formatter, value_key, unit = date_cmds[args.command]
            body = {"cardId": args.card_id, "startDate": args.start_date, "endDate": args.end_date}
            result = client.post(endpoint, body, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                if value_key:
                    formatter(result, value_key, args.command.replace("-", " ").title(), unit)
                else:
                    formatter(result)

    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
