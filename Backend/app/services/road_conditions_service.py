from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

OFFICIAL_SOURCE = "Department of Roads (official dashboard)"
OFFICIAL_SOURCE_URL = "https://navigate.dor.gov.np/dashboard"
OFFICIAL_NOTICE_URL = "https://dor.gov.np/home/page/highway-traffic-updates"

ROAD_CONDITION_SNAPSHOT = [
    {
        "id": "nh03-kaligandaki-washout",
        "road": "NH03 / Pushpalal Mid Hill Highway",
        "district": "Gandaki / Nuwakot / Baglung corridor",
        "location": "Kaligandaki River corridor",
        "status": "closed",
        "raw_status": "Closed",
        "reason": "Highway washout by the Kaligandaki River",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-09-27T02:12:00+05:45",
        "latitude": 28.2514,
        "longitude": 84.8722,
    },
    {
        "id": "nh37-kanti-rajpath",
        "road": "NH37 / Kanti Rajpath",
        "district": "Makwanpur",
        "location": "Hetauda–Bagmati–Tikabhairav corridor",
        "status": "closed",
        "raw_status": "Closed",
        "reason": "Landslide and road obstruction",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-09-27T04:00:00+05:45",
        "latitude": 27.4179,
        "longitude": 85.0364,
    },
    {
        "id": "nh42-thori-bhandara",
        "road": "NH42 / Thori–Bhandara–Malekhu corridor",
        "district": "Gorkha / Dhading",
        "location": "Galchi–Trishuli–Betrawati–Mailung section",
        "status": "closed",
        "raw_status": "Closed",
        "reason": "Flood damage and debris across the route",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-08-26T11:30:00+05:45",
        "latitude": 28.1812,
        "longitude": 84.7861,
    },
    {
        "id": "nh58-karnali-rajmarg",
        "road": "NH58 / Karnali Rajmarg",
        "district": "Banke / Surkhet",
        "location": "Jamunaha–Nepalgunj–Kohalpur–Surkhet corridor",
        "status": "partially_open",
        "raw_status": "Partially Opened",
        "reason": "Restricted access with intermittent movement",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-09-28T09:15:00+05:45",
        "latitude": 28.0681,
        "longitude": 81.7519,
    },
    {
        "id": "nh17-prithvi-rajmarg",
        "road": "NH17 / Prithvi Rajmarg",
        "district": "Nuwakot / Tanahun",
        "location": "Naubise–Mugling–Pokhara section",
        "status": "open",
        "raw_status": "Opened",
        "reason": "Public access reopened after earlier disruption",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-09-28T10:45:00+05:45",
        "latitude": 27.8897,
        "longitude": 84.5474,
    },
    {
        "id": "nh05-east-west-unknown",
        "road": "NH05 / East-West Highway section",
        "district": "Nawalpur / Bardiya corridor",
        "location": "Multiple highway segments",
        "status": "unknown",
        "raw_status": "Status not confirmed",
        "reason": "Official notice does not clearly confirm a reliable current status",
        "source": OFFICIAL_SOURCE,
        "source_url": OFFICIAL_SOURCE_URL,
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": "2026-09-28T12:00:00+05:45",
        "latitude": 27.9500,
        "longitude": 83.9000,
    },
]

STATUS_MAP = {
    "open": "open",
    "opened": "open",
    "fully_open": "open",
    "partially_open": "partially_open",
    "partially opened": "partially_open",
    "partially opened road": "partially_open",
    "closed": "closed",
    "closed road": "closed",
    "unknown": "unknown",
    "status not confirmed": "unknown",
    "not confirmed": "unknown",
}


def normalize_status(value: str | None) -> str:
    key = (value or "").strip().lower()
    return STATUS_MAP.get(key, "unknown")


def _max_updated(items: list[dict[str, Any]]) -> str:
    if not items:
        return datetime.now(timezone.utc).isoformat()
    timestamps = []
    for item in items:
        updated = item.get("last_updated")
        if updated:
            try:
                timestamps.append(datetime.fromisoformat(updated.replace("Z", "+00:00")))
            except ValueError:
                continue
    if not timestamps:
        return datetime.now(timezone.utc).isoformat()
    return max(timestamps).astimezone(timezone.utc).isoformat()


def get_road_conditions() -> dict[str, Any]:
    items = []
    for entry in ROAD_CONDITION_SNAPSHOT:
        item = dict(entry)
        item["status"] = normalize_status(item.get("raw_status") or item.get("status"))
        items.append(item)

    last_updated = _max_updated(items)
    return {
        "items": items,
        "source": "Department of Roads (official dashboard) — manually reviewed fallback snapshot",
        "notice_url": OFFICIAL_NOTICE_URL,
        "last_updated": last_updated,
        "is_live": False,
        "is_stale": True,
        "note": "No documented public API was identified for the Department of Roads traffic pages. This response is a reviewed official-dashboard snapshot and should not be treated as automatic live synchronization.",
    }


def summarize_road_conditions(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"open": 0, "partially_open": 0, "closed": 0, "unknown": 0}
    for item in items:
        status = item.get("status", "unknown")
        counts[status if status in counts else "unknown"] += 1

    return {
        "total": len(items),
        "open": counts["open"],
        "partially_open": counts["partially_open"],
        "closed": counts["closed"],
        "unknown": counts["unknown"],
        "source": OFFICIAL_SOURCE,
        "last_updated": _max_updated(items),
        "is_live": False,
        "is_stale": True,
    }
