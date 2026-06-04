#!/usr/bin/env python3
"""
FSCUT Open Platform - Welding Machine Management Executor
Queries: machine list, machine details, status change records

Usage:
    python welding_management.py <command> [options]

Commands:
    list        Query all authenticated machines
    detail      Query detailed info of a specific machine
    records     Query status change records within a time period

Options:
    --app-id, --app-secret, --card-id, --start-time, --end-time, --zone-id, --json

Examples:
    python welding_management.py list
    python welding_management.py detail --card-id 123456789100
    python welding_management.py records --card-id 123456789100 --start-time "2023-11-17 00:00:00" --end-time "2023-11-17 23:59:59"
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTClient, FSCUTAPIError, FSCUTAuthError, get_client, print_json


def format_machine_list(data: dict):
    machines = data.get("data", [])
    if not machines:
        print("No machines found.")
        return
    print(f"\n{'Nickname':<25} {'Software':<12} {'Version':<15} {'Card ID'}")
    print("-" * 80)
    for m in machines:
        print(f"{m.get('nickname', 'N/A'):<25} {m.get('appName', 'N/A'):<12} {m.get('appVer', 'N/A'):<15} {m.get('cardId', 'N/A')}")
    print(f"\nTotal: {len(machines)} machine(s)")


def format_machine_detail(data: dict):
    info = data.get("data", {})
    if not info:
        print("No machine detail found.")
        return
    print(f"\n{'Field':<20} Value")
    print("-" * 60)
    fields = [
        ("Nickname", "nickname"), ("Software", "appName"), ("Version", "appVer"),
        ("Serial", "serial"), ("Card ID", "cardId"), ("Laser Model", "laserModel"),
        ("Laser Power", "laserPower"), ("Work Area", "range"),
        ("License Valid Until", "licenseValidEnd"),
    ]
    for label, key in fields:
        print(f"{label:<20} {info.get(key, 'N/A')}")


def format_status_records(data: dict):
    records = data.get("data", [])
    if not records:
        print("No status records found.")
        return
    print(f"\n{'Start Time':<20} {'End Time':<20} {'Duration(s)':<12} Status")
    print("-" * 70)
    status_labels = {
        "OFFLINE": "OFFLINE", "IDLE": "IDLE", "WORK": "WORK",
        "PAUSE": "PAUSE", "ALARM": "ALARM", "PLC": "PLC", "UNKNOWN": "UNKNOWN",
    }
    for rec in records:
        status = rec.get("status", "UNKNOWN")
        label = status_labels.get(status, status)
        print(f"{rec.get('timeStart', 'N/A'):<20} {rec.get('timeEnd', 'N/A'):<20} {rec.get('time', 'N/A'):<12} {label}")
    print(f"\nTotal: {len(records)} record(s)")


def main():
    parser = argparse.ArgumentParser(description="Welding Machine Management")
    parser.add_argument("command", choices=["list", "detail", "records"],
                        help="Command to execute")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", help="Control card ID")
    parser.add_argument("--start-time", help="Start time (yyyy-MM-dd HH:mm:ss)")
    parser.add_argument("--end-time", help="End time (yyyy-MM-dd HH:mm:ss)")
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    try:
        if args.command == "list":
            result = client.post("/api/user_devices", {})
            if args.json:
                print_json(result)
            else:
                format_machine_list(result)

        elif args.command == "detail":
            if not args.card_id:
                print("ERROR: --card-id is required for 'detail' command")
                sys.exit(1)
            result = client.post("/api/user_devices/detail", {"cardId": args.card_id})
            if args.json:
                print_json(result)
            else:
                format_machine_detail(result)

        elif args.command == "records":
            if not args.card_id or not args.start_time or not args.end_time:
                print("ERROR: --card-id, --start-time, and --end-time are required for 'records'")
                sys.exit(1)
            result = client.post("/api/user_devices/time_periods", {
                "cardId": args.card_id, "startTime": args.start_time, "endTime": args.end_time
            }, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_status_records(result)

    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
