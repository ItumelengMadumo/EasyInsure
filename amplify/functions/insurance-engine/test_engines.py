import unittest
from datetime import datetime, timezone

from engines import assign_tier, calculate_depreciation, calculate_risk, detect_fraud


class EngineTests(unittest.TestCase):
    def test_tier_boundaries(self):
        self.assertEqual(assign_tier(50000), 1)
        self.assertEqual(assign_tier(50000.01), 2)
        self.assertEqual(assign_tier(200000), 2)
        self.assertEqual(assign_tier(200000.01), 3)

    def test_good_history_discount(self):
        result = calculate_risk({"assetType": "vehicle", "assetValue": 100000, "previousClaimsCount": 0})
        self.assertEqual(result["totalRiskScore"], -0.2)
        self.assertEqual(result["suggestedPremium"], 400)

    def test_depreciation_matches_original_formula(self):
        result = calculate_depreciation({
            "purchasePrice": 100000, "purchaseDate": "2024-01-01T00:00:00Z",
            "claimDate": "2025-01-01T06:00:00Z", "assetType": "vehicle", "excess": 500,
        })
        self.assertAlmostEqual(result["depreciatedValue"], 85000, delta=1)
        self.assertAlmostEqual(result["suggestedPayout"], 84500, delta=1)

    def test_fraud_is_advisory(self):
        result = detect_fraud({
            "claimAmount": 90000, "assetValue": 100000,
            "policyStartDate": "2026-01-01T00:00:00Z", "incidentDate": "2026-01-10T00:00:00Z",
            "evaluationDate": datetime(2026, 2, 1, tzinfo=timezone.utc).isoformat(),
        })
        self.assertTrue(result["isFlagged"])
        self.assertNotIn("approve", result["recommendation"].lower())

    def test_rejects_negative_money(self):
        with self.assertRaises(ValueError):
            calculate_risk({"assetValue": -1})


if __name__ == "__main__":
    unittest.main()
