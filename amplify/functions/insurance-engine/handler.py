import json
from typing import Any

from engines import assign_tier, calculate_depreciation, calculate_risk, detect_fraud


def handler(event: dict[str, Any], _context: Any) -> str:
    """AppSync Lambda resolver. Returns JSON so the schema stays stable across runtimes."""
    arguments = event.get("arguments") or {}
    operation = arguments.get("operation")
    payload = arguments.get("payload") or {}
    if isinstance(payload, str):
        payload = json.loads(payload)

    operations = {
        "assignTier": lambda value: {"tier": assign_tier(value.get("amount"))},
        "calculateRisk": calculate_risk,
        "calculateDepreciation": calculate_depreciation,
        "detectFraud": detect_fraud,
    }
    if operation not in operations:
        raise ValueError("Unsupported insurance engine operation")
    return json.dumps(operations[operation](payload), separators=(",", ":"))
