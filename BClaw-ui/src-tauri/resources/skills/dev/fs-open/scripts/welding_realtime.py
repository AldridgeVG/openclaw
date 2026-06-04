#!/usr/bin/env python3
"""
FSCUT Open Platform - Welding Machine Real-time Data Executor
Queries: operating status, welding system state

Usage:
    python welding_realtime.py <command> [options]

Commands:
    status      Query current operating status of one or more machines
    state       Query real-time welding system state

Options:
    --app-id, --app-secret, --card-id(s), --zone-id, --json

Examples:
    python welding_realtime.py status --card-ids 123456789100,123456789101
    python welding_realtime.py state --card-id 123456789100
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTClient, FSCUTAPIError, FSCUTAuthError, get_client, print_json


def format_operating_status(data: dict):
    machines = data.get("data", [])
    if not machines:
        print("No machine status data found.")
        return
    status_labels = {
        "OFFLINE": "OFFLINE", "WORKING": "WORKING", "ALARMING": "ALARMING",
        "IDLE": "IDLE", "UNKNOWN": "UNKNOWN", "CLOSE": "CLOSE",
        "PAUSE": "PAUSE", "STOP": "STOP",
    }
    print(f"\n{'Card ID':<20} Status")
    print("-" * 35)
    for m in machines:
        status = m.get("deviceState", "UNKNOWN")
        print(f"{m.get('cardId', 'N/A'):<20} {status_labels.get(status, status)}")
    print(f"\nTotal: {len(machines)} machine(s)")


def format_welding_state(data: dict):
    state = data.get("data", {})
    if not state:
        print("No welding system state data available.")
        return
    print(f"\n{'Parameter':<30} Value")
    print("-" * 60)
    # Robot axis coordinates
    coors = state.get("robotAxisCoor", [])
    if coors:
        print(f"{'Robot Axis Coordinates':<30} {coors} (radians)")
    coors = state.get("gantryAxisCoor", [])
    if coors:
        print(f"{'Gantry Coordinates':<30} {coors} (mm)")
    coors = state.get("cmAxisCoor", [])
    if coors:
        print(f"{'Universal Axis Coordinates':<30} {coors} (radians)")
    speeds = state.get("robotAxisSpeed", [])
    if speeds:
        print(f"{'Robot Axis Speed':<30} {speeds} (RPM)")
    speeds = state.get("gantryAxisSpeed", [])
    if speeds:
        print(f"{'Gantry Speed':<30} {speeds} (mm/s)")
    speeds = state.get("cmAxisSpeed", [])
    if speeds:
        print(f"{'Universal Axis Speed':<30} {speeds} (RPM)")
    tcp = state.get("tcpPosition", [])
    if tcp:
        print(f"{'TCP Position':<30} {tcp} (mm, radians)")
    print(f"{'Welding Current':<30} {state.get('weldingCurrent', 'N/A')} A")
    print(f"{'Welding Voltage':<30} {state.get('weldingVoltage', 'N/A')} V")


def main():
    parser = argparse.ArgumentParser(description="Welding Machine Real-time Data Query")
    parser.add_argument("command", choices=["status", "state"],
                        help="Command to execute")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", help="Control card ID (for 'state' command)")
    parser.add_argument("--card-ids", help="Comma-separated card IDs (for 'status' command)")
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    try:
        if args.command == "status":
            if not args.card_ids:
                print("ERROR: --card-ids is required for 'status' command (comma-separated)")
                sys.exit(1)
            card_ids = [c.strip() for c in args.card_ids.split(",")]
            result = client.post("/api/user_devices/current_state", {"cardIds": card_ids}, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_operating_status(result)

        elif args.command == "state":
            if not args.card_id:
                print("ERROR: --card-id is required for 'state' command")
                sys.exit(1)
            result = client.post("/api/user_devices/weld_system_state", {"cardId": args.card_id}, zone_id=args.zone_id)
            if args.json:
                print_json(result)
            else:
                format_welding_state(result)

    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
