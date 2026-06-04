#!/usr/bin/env python3
"""
FSCUT Open Platform - Cutting Machine Statistics Executor
Queries: summary stats, daily alarm time, pierce count, laser-on time,
         gas-on time, cutting length, traveling distance, processing time

Usage:
    python cutting_statistics.py <command> --card-id ID --start-date YYYYMMDD --end-date YYYYMMDD [options]

Commands:
    sum           Summary statistics for the period
    alarm-time    Daily alarm duration
    pierce-count  Daily piercing count
    laser-on      Daily laser-on time
    gas-on        Daily gas-on time
    cut-length    Daily cutting length
    move-length   Daily traveling distance
    cut-time      Daily processing time

Options:
    --app-id, --app-secret, --card-id, --start-date, --end-date, --zone-id, --json

Examples:
    python cutting_statistics.py sum --card-id 123456789100 --start-date 20230201 --end-date 20230207
    python cutting_statistics.py laser-on --card-id 123456789100 --start-date 20230201 --end-date 20230207 --json
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTClient, FSCUTAPIError, FSCUTAuthError, get_client, print_json


def format_daily_list(data: dict, value_key: str, title: str, unit: str = ""):
    """Format daily statistics list."""
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
    """Format summary statistics."""
    stats = data.get("data", {})
    if not stats:
        print("No summary data found.")
        return
    print(f"\n{'Metric':<20} {'Value':<15} Unit")
    print("-" * 50)
    fields = [
        ("Laser-on Time", "laserOn", "seconds"), ("Cutting Time", "cutTime", "seconds"),
        ("Idle Time", "idleTime", "seconds"), ("Cutting Length", "cutLength", "mm"),
        ("Travel Distance", "moveLength", "mm"), ("Pierce Count", "pierceCount", ""),
        ("Gas-on Time", "gasOn", "seconds"),
    ]
    for label, key, unit in fields:
        value = stats.get(key, "N/A")
        if isinstance(value, float):
            value = f"{value:.2f}"
        print(f"{label:<20} {str(value):<15} {unit}")


def main():
    parser = argparse.ArgumentParser(description="Cutting Machine Statistics Query")
    parser.add_argument("command", choices=["sum", "alarm-time", "pierce-count", "laser-on",
                                             "gas-on", "cut-length", "move-length", "cut-time"],
                        help="Statistics command")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", required=True)
    parser.add_argument("--start-date", type=int, required=True, help="Start date as YYYYMMDD integer")
    parser.add_argument("--end-date", type=int, required=True, help="End date as YYYYMMDD integer")
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    # Map commands to endpoints and formatters
    cmd_map = {
        "sum":        ("/api/statistics/sum", format_summary, None, None),
        "alarm-time": ("/statistics/daily/alarm_time", format_daily_list, "alarmTime", "seconds"),
        "pierce-count":("/api/statistics/daily/pierce_count", format_daily_list, "pierceCount", ""),
        "laser-on":   ("/api/statistics/daily/laser_on", format_daily_list, "laserOn", "seconds"),
        "gas-on":     ("/api/statistics/daily/gas_on", format_daily_list, "gasOn", "seconds"),
        "cut-length": ("/api/statistics/daily/cut_length", format_daily_list, "cutLength", "mm"),
        "move-length":("/api/statistics/daily/move_length", format_daily_list, "moveLength", "mm"),
        "cut-time":   ("/api/statistics/daily/cut_time", format_daily_list, "cutTime", "seconds"),
    }

    endpoint, formatter, value_key, unit = cmd_map[args.command]
    body = {"cardId": args.card_id, "startDate": args.start_date, "endDate": args.end_date}

    try:
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
