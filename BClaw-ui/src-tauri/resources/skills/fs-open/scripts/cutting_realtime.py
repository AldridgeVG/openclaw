#!/usr/bin/env python3
"""
FSCUT Open Platform - Cutting Machine Real-time Data Executor
Queries: current alarms, ongoing task, cutting system state

Usage:
    python cutting_realtime.py <command> [options]

Commands:
    alarms      Query current alarm list
    work        Query ongoing processing task
    state       Query real-time cutting system state

Options:
    --app-id        FSCUT Open Platform appId
    --app-secret    FSCUT Open Platform appSecret
    --card-id       Control card ID of the machine
    --zone-id       Optional IANA time zone ID (default: Asia/Shanghai)
    --json          Output raw JSON

Examples:
    python cutting_realtime.py alarms --card-id 123456789100
    python cutting_realtime.py state --card-id 123456789100 --zone-id America/New_York
    python cutting_realtime.py work --card-id 123456789100 --json
"""

import argparse
import json
import os
import sys

# Add the script directory to path for importing the shared client
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTClient, FSCUTAPIError, FSCUTAuthError, get_client, print_json


def format_alarms(data: dict):
    """Format alarm list for human-readable display."""
    alarms = data.get("data", [])
    if not alarms:
        print("No active alarms on this machine.")
        return
    print(f"\n{'Alarm Code':<25} {'Time':<20} Description")
    print("-" * 70)
    for alarm in alarms:
        print(f"{alarm.get('alarmCode', 'N/A'):<25} {alarm.get('alarmTime', 'N/A'):<20} {alarm.get('alarmDesc', 'N/A')}")
    print(f"\nTotal: {len(alarms)} alarm(s)")


def format_current_work(data: dict):
    """Format current work info for human-readable display."""
    work = data.get("data")
    if not work or not work.get("filename"):
        print("No active processing task on this machine.")
        return
    print(f"\n{'Field':<20} Value")
    print("-" * 60)
    print(f"{'Filename':<20} {work.get('filename', 'N/A')}")
    print(f"{'Portion ID':<20} {work.get('portionId', 'N/A')}")
    print(f"{'Start Time':<20} {work.get('startTime', 'N/A')}")


def format_system_state(data: dict):
    """Format cutting system state for human-readable display."""
    state = data.get("data", {})
    if not state:
        print("No system state data available.")
        return
    print(f"\n{'Parameter':<25} Value")
    print("-" * 50)
    fields = [
        ("Task Name", "taskName"), ("X-Axis", "axisX"), ("Y-Axis", "axisY"),
        ("Z-Axis", "axisZ"), ("Work Speed", "workSpeed"), ("Progress (%)", "cutPercent"),
        ("Laser Power", "laserPower"), ("PWM Freq (Hz)", "pwmFreq"),
        ("Gas Type", "gasType"), ("Gas Pressure", "gasPressure"),
        ("PWM Duty (%)", "pwmRatio"), ("Target Height", "targetHeight"),
        ("Diode Current (%)", "diodeCurrent"), ("Work Time", "workTimeStr"),
    ]
    for label, key in fields:
        value = state.get(key, "N/A")
        if isinstance(value, float):
            value = f"{value:.2f}"
        print(f"{label:<25} {value}")


def main():
    parser = argparse.ArgumentParser(description="Cutting Machine Real-time Data Query")
    parser.add_argument("command", choices=["alarms", "work", "state"],
                        help="API command to execute")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"),
                        help="FSCUT appId (or set FS_OPEN_APP_ID env var)")
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"),
                        help="FSCUT appSecret (or set FS_OPEN_APP_SECRET env var)")
    parser.add_argument("--card-id", required=True, help="Control card ID")
    parser.add_argument("--zone-id", default=None, help="IANA time zone ID")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    try:
        if args.command == "alarms":
            result = client.post("/api/user_devices/current_alarms", {"cardId": args.card_id}, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_alarms(result)

        elif args.command == "work":
            result = client.post("/api/user_devices/current_work", {"cardId": args.card_id}, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_current_work(result)

        elif args.command == "state":
            result = client.post("/api/user_devices/cut_system_state", {"cardId": args.card_id}, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_system_state(result)

    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
