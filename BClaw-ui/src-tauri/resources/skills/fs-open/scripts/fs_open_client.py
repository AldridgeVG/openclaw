#!/usr/bin/env python3
"""
FSCUT Open Platform API - Shared Client Library
Handles authentication header generation, request signing, and HTTP requests.
"""

import hashlib
import json
import os
import sys
import time
from typing import Optional

# Third-party dependency: requests
# Install: pip install requests
try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not installed. Run: pip install requests")
    sys.exit(1)


BASE_URL = os.environ.get("FS_OPEN_BASE_URL", "https://mcs-gateway.fscut.com")


class FSCUTAuthError(Exception):
    """Raised when authentication fails or credentials are missing."""
    pass


class FSCUTAPIError(Exception):
    """Raised when API returns a non-zero status code."""
    def __init__(self, status_code: int, msg: str):
        self.status_code = status_code
        self.msg = msg
        super().__init__(f"API Error {status_code}: {msg}")


class FSCUTClient:
    """
    FSCUT Open Platform HTTP client with automatic auth header generation.

    Usage:
        client = FSCUTClient(app_id="your_app_id", app_secret="your_app_secret")
        result = client.post("/api/user_devices", body={})
    """

    def __init__(self, app_id: Optional[str] = None, app_secret: Optional[str] = None):
        self.app_id = app_id or os.environ.get("FS_OPEN_APP_ID")
        self.app_secret = app_secret or os.environ.get("FS_OPEN_APP_SECRET")
        self.base_url = BASE_URL.rstrip("/")

        if not self.app_id:
            raise FSCUTAuthError(
                "app_id is required. Provide it as argument, "
                "set FS_OPEN_APP_ID env var, or enter when prompted."
            )
        if not self.app_secret:
            raise FSCUTAuthError(
                "app_secret is required. Provide it as argument, "
                "set FS_OPEN_APP_SECRET env var, or enter when prompted."
            )

    def _generate_headers(self) -> dict:
        """Generate authentication headers: app-id, time-stamp, app-sign."""
        timestamp = int(time.time() * 1000)
        sign_content = f"{self.app_id}{self.app_secret}{timestamp}"
        app_sign = hashlib.md5(sign_content.encode("utf-8")).hexdigest()
        return {
            "app-id": self.app_id,
            "time-stamp": str(timestamp),
            "app-sign": app_sign,
            "Content-Type": "application/json",
        }

    def post(self, path: str, body: dict, zone_id: Optional[str] = None) -> dict:
        """
        Send a POST request to the FSCUT Open API.

        Args:
            path: API endpoint path (e.g., '/api/user_devices')
            body: Request body as a dict
            zone_id: Optional IANA time zone ID (e.g., 'America/New_York')

        Returns:
            Parsed JSON response dict

        Raises:
            FSCUTAPIError: If API returns non-zero status
            requests.RequestException: On network/HTTP errors
        """
        url = f"{self.base_url}{path}"
        headers = self._generate_headers()

        if zone_id:
            headers["zoneId"] = zone_id

        resp = requests.post(url, headers=headers, json=body, timeout=30)
        resp.raise_for_status()

        data = resp.json()
        status = data.get("status", 0)
        if status != 0:
            raise FSCUTAPIError(status, data.get("msg", "Unknown error"))

        return data

    def upload(self, path: str, file_path: str, fields: dict, zone_id: Optional[str] = None) -> dict:
        """
        Send a multipart/form-data file upload request.

        Args:
            path: API endpoint path
            file_path: Local path to the file to upload
            fields: Additional form fields as dict
            zone_id: Optional IANA time zone ID

        Returns:
            Parsed JSON response dict
        """
        url = f"{self.base_url}{path}"
        headers = self._generate_headers()
        # Content-Type is set automatically by requests for multipart
        del headers["Content-Type"]

        if zone_id:
            headers["zoneId"] = zone_id

        with open(file_path, "rb") as f:
            files = {"file": f}
            resp = requests.post(url, headers=headers, data=fields, files=files, timeout=60)

        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", 0)
        if status != 0:
            raise FSCUTAPIError(status, data.get("msg", "Unknown error"))

        return data


def prompt_credentials() -> tuple[str, str]:
    """Interactively prompt for app_id and app_secret."""
    print("=" * 50)
    print("FSCUT Open Platform API Authentication")
    print("=" * 50)
    app_id = input("Enter your appId: ").strip()
    app_secret = input("Enter your appSecret: ").strip()
    if not app_id or not app_secret:
        print("ERROR: Both appId and appSecret are required.")
        sys.exit(1)
    return app_id, app_secret


def get_client(app_id: Optional[str] = None, app_secret: Optional[str] = None) -> "FSCUTClient":
    """
    Create a FSCUTClient with credentials resolved from:
    1. Explicit arguments
    2. Environment variables (FS_OPEN_APP_ID, FS_OPEN_APP_SECRET)
    3. Interactive prompt
    """
    aid = app_id or os.environ.get("FS_OPEN_APP_ID")
    asec = app_secret or os.environ.get("FS_OPEN_APP_SECRET")

    if not aid or not asec:
        try:
            aid, asec = prompt_credentials()
        except (EOFError, KeyboardInterrupt):
            print("\nAuthentication cancelled.")
            sys.exit(1)

    return FSCUTClient(aid, asec)


def print_json(data: dict):
    """Pretty print JSON response."""
    print(json.dumps(data, indent=2, ensure_ascii=False))


# ---- Pre-built API call functions for direct execution ----

# ========================
# Cutting Machine - Real-time Data
# ========================

def cutting_get_current_alarms(client: FSCUTClient, card_id: str, zone_id: Optional[str] = None) -> dict:
    """Query current alarm list of a cutting machine."""
    return client.post("/api/user_devices/current_alarms", {"cardId": card_id}, zone_id=zone_id)


def cutting_get_current_work(client: FSCUTClient, card_id: str, zone_id: Optional[str] = None) -> dict:
    """Query the ongoing processing task of a cutting machine."""
    return client.post("/api/user_devices/current_work", {"cardId": card_id}, zone_id=zone_id)


def cutting_get_system_state(client: FSCUTClient, card_id: str, zone_id: Optional[str] = None) -> dict:
    """Query real-time status of the cutting system."""
    return client.post("/api/user_devices/cut_system_state", {"cardId": card_id}, zone_id=zone_id)


# ========================
# Cutting Machine - Statistics
# ========================

def cutting_get_statistics_sum(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    """Get summary statistics for a period."""
    return client.post("/api/statistics/sum", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_alarm_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/statistics/daily/alarm_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_pierce_count(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/pierce_count", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_laser_on(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/laser_on", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_gas_on(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/gas_on", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_cut_length(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/cut_length", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_move_length(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/move_length", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def cutting_get_daily_cut_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/cut_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


# ========================
# Cutting Machine - Task Management
# ========================

def cutting_upload_task(client: FSCUTClient, card_id: str, file_path: str, task_name: str, task_amount: int = 1, zone_id: Optional[str] = None) -> dict:
    """Upload a cutting task file."""
    return client.upload("/upload/api/device_tasks/upload/cut", file_path, {
        "cardId": card_id, "taskName": task_name, "taskAmount": str(task_amount)
    }, zone_id=zone_id)


# ========================
# Welding Machine - Management
# ========================

def welding_get_machine_list(client: FSCUTClient) -> dict:
    """Query basic info of all authenticated machines."""
    return client.post("/api/user_devices", {})


def welding_get_machine_detail(client: FSCUTClient, card_id: str) -> dict:
    """Query detailed information about a specific machine."""
    return client.post("/api/user_devices/detail", {"cardId": card_id})


def welding_get_status_records(client: FSCUTClient, card_id: str, start_time: str, end_time: str, zone_id: Optional[str] = None) -> dict:
    """Query machine status change records within a time period."""
    return client.post("/api/user_devices/time_periods", {
        "cardId": card_id, "startTime": start_time, "endTime": end_time
    }, zone_id=zone_id)


# ========================
# Welding Machine - Real-time Data
# ========================

def welding_get_current_state(client: FSCUTClient, card_ids: list, zone_id: Optional[str] = None) -> dict:
    """Query current operating status of welding machines."""
    return client.post("/api/user_devices/current_state", {"cardIds": card_ids}, zone_id=zone_id)


def welding_get_system_state(client: FSCUTClient, card_id: str, zone_id: Optional[str] = None) -> dict:
    """Query real-time welding system state."""
    return client.post("/api/user_devices/weld_system_state", {"cardId": card_id}, zone_id=zone_id)


# ========================
# Welding Machine - Statistics
# ========================

def welding_get_work_logs(client: FSCUTClient, card_id: str, start_time: str, end_time: str,
                          page_number: int = 0, page_size: int = 30, time_desc: bool = True, zone_id: Optional[str] = None) -> dict:
    """Get paged welding processing records."""
    return client.post("/api/statistics/work_logs/v2", {
        "cardId": card_id, "startTime": start_time, "endTime": end_time,
        "pageNumber": page_number, "pageSize": page_size, "timeDesc": time_desc
    }, zone_id=zone_id)


def welding_get_statistics_sum(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/sum/weld", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_idle_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/idle_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_flat_weld_length(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/flat_weld_length", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_flat_weld_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/flat_weld_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_vertical_weld_length(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/vertical_weld_length", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_vertical_weld_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/vertical_weld_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_weld_length(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/weld_length", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_weld_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/weld_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_weld_pass_count(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/weld_pass_count", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


def welding_get_daily_work_time(client: FSCUTClient, card_id: str, start_date: int, end_date: int, zone_id: Optional[str] = None) -> dict:
    return client.post("/api/statistics/daily/work_time", {
        "cardId": card_id, "startDate": start_date, "endDate": end_date
    }, zone_id=zone_id)


# ========================
# Welding Machine - Task Management
# ========================

def welding_upload_task(client: FSCUTClient, card_id: str, file_path: str, task_guid: str,
                        task_amount: int = 1, project_code: Optional[str] = None,
                        job_code: Optional[str] = None, extra_info_json: Optional[str] = None,
                        zone_id: Optional[str] = None) -> dict:
    """Upload a welding task file."""
    fields = {
        "cardId": card_id, "taskGuid": task_guid, "taskAmount": str(task_amount)
    }
    if project_code:
        fields["projectCode"] = project_code
    if job_code:
        fields["jobCode"] = job_code
    if extra_info_json:
        fields["extraInfoJson"] = extra_info_json
    return client.upload("/upload/api/device_tasks/upload/weld", file_path, fields, zone_id=zone_id)


if __name__ == "__main__":
    print("FSCUT Open Platform - Shared Client Library")
    print("Import this module in executor scripts. Do not run directly.")
