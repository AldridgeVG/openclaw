#!/usr/bin/env python3
"""
FSCUT Open Platform - Welding Machine Task Upload Executor
Upload welding task files (ifc, cfi)

Usage:
    python welding_task.py --card-id ID --file PATH --task-guid GUID [options]

Options:
    --app-id, --app-secret, --card-id, --file, --task-guid, --task-amount,
    --project-code, --job-code, --extra-info-json, --zone-id, --json

Examples:
    python welding_task.py --card-id 123456789100 --file ./part.ifc --task-guid "comp-001"
    python welding_task.py --card-id 123456789100 --file ./weld.cfi --task-guid "comp-002" \
        --project-code P202409110846 --job-code J-2996-GH \
        --extra-info-json '{"multiPass":true, "passCount":3, "metal":"Al"}'
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fs_open_client import FSCUTAPIError, FSCUTAuthError, get_client, print_json

SUPPORTED_EXTS = {"ifc", "cfi"}


def main():
    parser = argparse.ArgumentParser(description="Welding Machine Task Upload")
    parser.add_argument("--app-id", default=os.environ.get("FS_OPEN_APP_ID"))
    parser.add_argument("--app-secret", default=os.environ.get("FS_OPEN_APP_SECRET"))
    parser.add_argument("--card-id", required=True, help="Control card ID")
    parser.add_argument("--file", required=True, help="Path to welding file (ifc/cfi)")
    parser.add_argument("--task-guid", required=True, help="Task GUID (unique within project+job)")
    parser.add_argument("--task-amount", type=int, default=1, help="Expected process times (default: 1)")
    parser.add_argument("--project-code", default=None, help="Project code (part of unique key)")
    parser.add_argument("--job-code", default=None, help="Job code (part of unique key)")
    parser.add_argument("--extra-info-json", default=None, help="Extra metadata as JSON string (max 1000 chars)")
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

    if args.extra_info_json and len(args.extra_info_json) > 1000:
        print("ERROR: extra-info-json exceeds 1000 character limit")
        sys.exit(1)

    try:
        client = get_client(args.app_id, args.app_secret)
    except FSCUTAuthError as e:
        print(f"Auth Error: {e}")
        sys.exit(1)

    print(f"Uploading '{args.file}' ({ext.upper()}) to machine {args.card_id}...")
    print(f"  Task GUID: {args.task_guid}")
    if args.project_code:
        print(f"  Project Code: {args.project_code}")
    if args.job_code:
        print(f"  Job Code: {args.job_code}")

    try:
        fields = {
            "cardId": args.card_id,
            "taskGuid": args.task_guid,
            "taskAmount": str(args.task_amount),
        }
        if args.project_code:
            fields["projectCode"] = args.project_code
        if args.job_code:
            fields["jobCode"] = args.job_code
        if args.extra_info_json:
            fields["extraInfoJson"] = args.extra_info_json

        result = client.upload(
            "/upload/api/device_tasks/upload/weld",
            args.file,
            fields,
            zone_id=args.zone_id,
        )
        if args.json:
            print_json(result)
        else:
            print("Upload successful!")
    except FSCUTAPIError as e:
        print(f"API Error [{e.status_code}]: {e.msg}")
        sys.exit(1)
    except Exception as e:
        print(f"Upload failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
