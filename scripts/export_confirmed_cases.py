#!/usr/bin/env python3
"""
Export admin-approved feedback cases for offline retraining.

Usage:
  python scripts/export_confirmed_cases.py \
    --mongo-uri "mongodb://127.0.0.1:27017/noufar_cdss" \
    --db noufar_cdss \
    --out scripts/benchmark_outputs/retrain_dataset_approved.csv
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
from pymongo import MongoClient


def flatten_input_snapshot(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    flattened: Dict[str, Any] = {}
    for key, value in (snapshot or {}).items():
        if isinstance(value, (dict, list)):
            flattened[key] = json.dumps(value, ensure_ascii=False)
        else:
            flattened[key] = value
    return flattened


def build_rows(cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for case in cases:
        base = {
            "feedbackCaseId": str(case.get("_id", "")),
            "patientId": str(case.get("patientId", "")),
            "predictionId": str(case.get("predictionId", "")),
            "patientNameSnapshot": case.get("patientNameSnapshot", ""),
            "predictedOutcome": case.get("predictedOutcome", ""),
            "realOutcome": case.get("realOutcome", ""),
            "predictionProbability": case.get("predictionProbability"),
            "validatedAt": case.get("validatedAt"),
            "validatedByDoctorId": str(case.get("validatedByDoctorId", "")),
            "validatedByDoctorName": case.get("validatedByDoctorName", ""),
            "modelVersionUsed": case.get("modelVersionUsed", ""),
            "selectedModelKey": case.get("selectedModelKey", ""),
            "selectionPolicy": case.get("selectionPolicy", ""),
            "source": case.get("source", ""),
        }
        base.update(flatten_input_snapshot(case.get("inputSnapshot") or {}))
        rows.append(base)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Export confirmed feedback cases for retraining.")
    parser.add_argument("--mongo-uri", required=True, help="Mongo connection string")
    parser.add_argument("--db", required=True, help="Database name")
    parser.add_argument(
        "--out",
        default="scripts/benchmark_outputs/retrain_dataset_approved.csv",
        help="Output CSV path",
    )
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    client = MongoClient(args.mongo_uri)
    db = client[args.db]

    cursor = db.trainingfeedbackcases.find(
        {
            "validationStatus": "admin_approved",
            "isRetrainEligible": True,
            "realOutcome": {"$in": ["Relapse", "No Relapse"]},
        }
    ).sort("validatedAt", 1)

    cases = list(cursor)
    rows = build_rows(cases)
    frame = pd.DataFrame(rows)
    frame.to_csv(out_path, index=False)

    print(f"[export_confirmed_cases] exported_rows={len(frame)} out={out_path}")


if __name__ == "__main__":
    main()
