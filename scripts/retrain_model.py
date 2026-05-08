#!/usr/bin/env python3
"""
Offline monthly retraining for LR / RF / DNN(MLP) with F1-first evaluation.

Usage:
  python scripts/retrain_model.py \
    --dataset scripts/benchmark_outputs/retrain_dataset_approved.csv \
    --out-dir scripts/benchmark_outputs/retraining_outputs
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DROP_COLUMNS = {
    "feedbackCaseId",
    "patientId",
    "predictionId",
    "validatedAt",
    "validatedByDoctorId",
    "validatedByDoctorName",
}
TARGET_CANDIDATES = ("realOutcome", "actualOutcome", "target", "label")


def resolve_target_column(frame: pd.DataFrame) -> str:
    for column in TARGET_CANDIDATES:
        if column in frame.columns:
            return column
    raise ValueError(f"No target column found. Expected one of: {TARGET_CANDIDATES}")


def prepare_xy(frame: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    target_col = resolve_target_column(frame)
    y = frame[target_col].map(lambda v: 1 if str(v).strip() == "Relapse" else 0)
    x = frame.drop(columns=[c for c in [target_col, "predictedOutcome"] if c in frame.columns], errors="ignore")
    x = x.drop(columns=[c for c in x.columns if c in DROP_COLUMNS], errors="ignore")
    return x, y


def build_preprocessor(x: pd.DataFrame) -> ColumnTransformer:
    numeric_cols = [c for c in x.columns if pd.api.types.is_numeric_dtype(x[c])]
    categorical_cols = [c for c in x.columns if c not in numeric_cols]

    numeric_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, numeric_cols),
            ("cat", categorical_pipe, categorical_cols),
        ]
    )


def build_models(preprocessor: ColumnTransformer) -> Dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline(
            steps=[
                ("prep", preprocessor),
                ("clf", LogisticRegression(max_iter=1500, random_state=42)),
            ]
        ),
        "random_forest": Pipeline(
            steps=[
                ("prep", preprocessor),
                ("clf", RandomForestClassifier(n_estimators=500, random_state=42, n_jobs=-1)),
            ]
        ),
        "deep_neural_network": Pipeline(
            steps=[
                ("prep", preprocessor),
                ("clf", MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=600, random_state=42)),
            ]
        ),
    }


def evaluate_models(x: pd.DataFrame, y: pd.Series, models: Dict[str, Pipeline]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    detailed_rows: List[Dict[str, float]] = []

    for fold_idx, (train_idx, test_idx) in enumerate(splitter.split(x, y), start=1):
        x_train, x_test = x.iloc[train_idx], x.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

        for model_key, pipeline in models.items():
            pipeline.fit(x_train, y_train)
            pred = pipeline.predict(x_test)

            detailed_rows.append(
                {
                    "fold": fold_idx,
                    "modelKey": model_key,
                    "f1": float(f1_score(y_test, pred, zero_division=0)),
                    "accuracy": float(accuracy_score(y_test, pred)),
                    "precision": float(precision_score(y_test, pred, zero_division=0)),
                    "recall": float(recall_score(y_test, pred, zero_division=0)),
                }
            )

    detailed_df = pd.DataFrame(detailed_rows)
    summary_df = (
        detailed_df.groupby("modelKey", as_index=False)
        .agg(
            f1_mean=("f1", "mean"),
            f1_std=("f1", "std"),
            accuracy_mean=("accuracy", "mean"),
            precision_mean=("precision", "mean"),
            recall_mean=("recall", "mean"),
        )
        .sort_values(by="f1_mean", ascending=False)
    )

    return detailed_df, summary_df


def train_final_models(x: pd.DataFrame, y: pd.Series, models: Dict[str, Pipeline], out_dir: Path) -> None:
    for model_key, pipeline in models.items():
        pipeline.fit(x, y)
        joblib.dump(pipeline, out_dir / f"{model_key}_pipeline.joblib")


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline retraining (LR/RF/DNN) from approved feedback cases.")
    parser.add_argument("--dataset", required=True, help="Input CSV dataset")
    parser.add_argument(
        "--out-dir",
        default="scripts/benchmark_outputs/retraining_outputs",
        help="Output directory",
    )
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    frame = pd.read_csv(dataset_path)
    if frame.empty:
        raise ValueError("Dataset is empty. No retraining can be performed.")

    x, y = prepare_xy(frame)
    preprocessor = build_preprocessor(x)
    models = build_models(preprocessor)

    detailed_df, summary_df = evaluate_models(x, y, models)

    detailed_df.to_csv(out_dir / "retraining_cv_detailed.csv", index=False)
    summary_df.to_csv(out_dir / "retraining_cv_summary.csv", index=False)

    train_final_models(x, y, models, out_dir)

    best_row = summary_df.iloc[0].to_dict()
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": str(dataset_path),
        "rows": int(len(frame)),
        "targetPositiveLabel": "Relapse",
        "metricPrimary": "f1",
        "bestModelKey": best_row["modelKey"],
        "bestModelF1": float(best_row["f1_mean"]),
        "summary": summary_df.to_dict(orient="records"),
    }
    (out_dir / "retraining_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"[retrain_model] rows={len(frame)} best={report['bestModelKey']} f1={report['bestModelF1']:.4f}")
    print(f"[retrain_model] outputs={out_dir}")


if __name__ == "__main__":
    main()
