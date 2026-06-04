#!/usr/bin/env python3
"""
FSCUT Open Platform - Cutting Machine Task Upload Executor
Upload cutting task files (dxf, lxds, lxd, nrp, nrp2, zx, nc, cnc, plt, slp)

Usage:
    python cutting_task.py --card-id ID --file PATH --task-name NAME [--task-amount N]

Options:
    --app-id, --app-secret, --card-id, --file, --task-name, --task-amount, --zone-id, --json

Examples:
    python cutting_task.py --card-id 123456789100 --file ./drawing.dxf --task-name "Batch-001"
    python cutting_task.py --card-id 123456789100 --file ./part.lxds --task-name "Part-A" --task-amount 5
"""

import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTAPIError, FSCUTAuthError, get_client, print_json

SUPPORTED_EXTS = {"dxf", "lxds", "lxd", "nrp", "nrp2", "zx", "nc", "cnc", "plt", "slp"}


def main():
    parser = argparse.ArgumentParser(description="Cutting Machine Task Upload")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", required=True, help="Control card ID")
    parser.add_argument("--file", required=True, help="Path to cutting file")
    parser.add_argument("--task-name", required=True, help="Task name")
    parser.add_argument("--task-amount", type=int, default=1, help="Expected process times (default: 1)")
    parser.add_argument("--zone-id", default=None)
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    # Validate file
    if not os.path.isfile(args.file):
        print(f"ERROR: File not found: {args.file}")
        sys.exit(1)

    ext = os.path.splitext(args.file)[1].lstrip(".").lower()
    if ext not in SUPPORTED_EXTS:
        print(f"ERROR: Unsupported file format '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTS))}")
        sys.exit(1)

    if args.task_amount < 1:
        print("ERROR: task-amount must be >= 1")
        sys.exit(1)

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    print(f"Uploading '{args.file}' ({ext.upper()}) to machine {args.card_id}...")

    try:
        result = client.upload(
            "/upload/api/device_tasks/upload/cut",
            args.file,
            {
                "cardId": args.card_id,
                "taskName": args.task_name,
                "taskAmount": str(args.task_amount),
            },
            zone_id=args.zone_id,
        )
        if args.json:
            print_json(result)
        else:
            task_uuid = result.get("data", "N/A")
            print(f"Upload successful! TaskUUID: {task_uuid}")
    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Upload failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
