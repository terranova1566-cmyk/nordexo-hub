#!/usr/bin/env python3
"""
Backfill `digideal_products.primary_image_phash` from `primary_image_url`.

Why:
- Titles change; primary image is a stronger identifier for "same deal rerun".
- We compute a 64-bit perceptual hash (pHash) in grayscale and store it in Postgres.

Notes:
- We store the raw 64-bit pattern inside a signed BIGINT (two's complement) plus a hex
  debug string, so it is easy to compute Hamming distance in SQL using XOR + bit_count.
"""

from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass


def _die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def _run_psql(database_url: str, sql: str) -> str:
    proc = subprocess.run(
        ["psql", database_url, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        _die(f"psql failed:\n{proc.stderr.strip()}")
    return proc.stdout


def _download_bytes(url: str, timeout_sec: int) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            # Basic UA to avoid some CDNs blocking urllib.
            "User-Agent": "Mozilla/5.0 (compatible; nordexo-hub/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        return resp.read()


@dataclass(frozen=True)
class TargetRow:
    product_id: str
    primary_image_url: str


@dataclass(frozen=True)
class ResultRow:
    product_id: str
    phash_signed: int
    phash_hex: str


@dataclass(frozen=True)
class ErrorRow:
    product_id: str
    primary_image_url: str
    error: str


def _parse_targets(psql_out: str) -> list[TargetRow]:
    rows: list[TargetRow] = []
    for raw in psql_out.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        parts = raw.split("\t")
        if len(parts) != 2:
            continue
        product_id, url = parts
        if not product_id or not url:
            continue
        rows.append(TargetRow(product_id=product_id, primary_image_url=url))
    return rows


def _phash_from_url(target: TargetRow, timeout_sec: int) -> ResultRow:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError(f"Missing dependency (cv2/numpy): {e}")

    img_bytes = _download_bytes(target.primary_image_url, timeout_sec=timeout_sec)

    # Decode into grayscale (black/white) as requested.
    data = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError("cv2.imdecode returned None (unsupported/invalid image)")

    hasher = cv2.img_hash.PHash_create()
    ph = hasher.compute(img)  # shape (1, 8), dtype uint8
    ph_bytes = ph.reshape(-1).tobytes()
    if len(ph_bytes) != 8:
        raise RuntimeError(f"Unexpected pHash length: {len(ph_bytes)} bytes")

    ph_u64 = int.from_bytes(ph_bytes, byteorder="big", signed=False)
    # Store inside signed BIGINT while preserving the exact 64-bit pattern.
    ph_signed = ph_u64 - (1 << 64) if ph_u64 >= (1 << 63) else ph_u64
    return ResultRow(
        product_id=target.product_id,
        phash_signed=ph_signed,
        phash_hex=ph_bytes.hex(),
    )


def _write_csv(path: str, results: list[ResultRow]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["product_id", "phash", "phash_hex"])
        for r in results:
            w.writerow([r.product_id, str(r.phash_signed), r.phash_hex])


def _write_errors(path: str, errors: list[ErrorRow]) -> None:
    if not errors:
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["product_id", "primary_image_url", "error"])
        for e in errors:
            w.writerow([e.product_id, e.primary_image_url, e.error])


def _apply_updates(database_url: str, csv_path: str) -> None:
    # Use a temp table + \copy for fast bulk updates without extra Python DB deps.
    # Only set fields when missing so reruns are safe.
    sql = f"""
\\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE tmp_digideal_phash (
  product_id text PRIMARY KEY,
  phash bigint NOT NULL,
  phash_hex text NOT NULL
);
\\copy tmp_digideal_phash(product_id, phash, phash_hex) FROM '{csv_path}' WITH (FORMAT csv, HEADER true);
UPDATE public.digideal_products d
SET
  primary_image_phash = t.phash,
  primary_image_phash_hex = t.phash_hex,
  primary_image_phash_updated_at = now()
FROM tmp_digideal_phash t
WHERE d.product_id = t.product_id
  AND (d.primary_image_phash IS NULL OR d.primary_image_phash_hex IS NULL);
COMMIT;
"""
    proc = subprocess.run(
        ["psql", database_url, "-v", "ON_ERROR_STOP=1", "-f", "-"],
        input=sql,
        text=True,
    )
    if proc.returncode != 0:
        _die("psql update script failed")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Postgres connection string (default: $DATABASE_URL)",
    )
    ap.add_argument("--limit", type=int, default=0, help="Limit rows processed (0 = no limit)")
    ap.add_argument("--workers", type=int, default=4, help="Concurrent downloads (default: 4)")
    ap.add_argument("--timeout-sec", type=int, default=20, help="Per-image download timeout")
    ap.add_argument(
        "--out-csv",
        default="/tmp/digideal_primary_image_phash.csv",
        help="Output CSV path (default: /tmp/digideal_primary_image_phash.csv)",
    )
    ap.add_argument(
        "--errors-csv",
        default="/tmp/digideal_primary_image_phash_errors.csv",
        help="Errors CSV path (default: /tmp/digideal_primary_image_phash_errors.csv)",
    )
    ap.add_argument(
        "--no-apply",
        action="store_true",
        help="Do not write to DB (only produce CSVs)",
    )
    args = ap.parse_args()

    if not args.database_url:
        _die("Missing --database-url (or $DATABASE_URL).")

    limit_sql = f"LIMIT {args.limit}" if args.limit and args.limit > 0 else ""
    targets_sql = f"""
SELECT product_id, primary_image_url
FROM public.digideal_products
WHERE primary_image_url IS NOT NULL
  AND (primary_image_phash IS NULL OR primary_image_phash_hex IS NULL)
ORDER BY last_seen_at DESC
{limit_sql};
"""

    raw = _run_psql(args.database_url, targets_sql)
    targets = _parse_targets(raw)
    if not targets:
        print("No rows to backfill (all pHash fields present).")
        return

    t0 = time.time()
    results: list[ResultRow] = []
    errors: list[ErrorRow] = []

    print(f"Backfilling pHash for {len(targets)} DigiDeal products...")

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = {
            ex.submit(_phash_from_url, t, args.timeout_sec): t for t in targets
        }
        done = 0
        for fut in as_completed(futs):
            t = futs[fut]
            try:
                results.append(fut.result())
            except urllib.error.HTTPError as e:
                errors.append(ErrorRow(t.product_id, t.primary_image_url, f"HTTPError: {e.code}"))
            except urllib.error.URLError as e:
                errors.append(ErrorRow(t.product_id, t.primary_image_url, f"URLError: {e.reason}"))
            except Exception as e:
                errors.append(ErrorRow(t.product_id, t.primary_image_url, f"{type(e).__name__}: {e}"))

            done += 1
            if done % 25 == 0 or done == len(targets):
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed > 0 else 0
                print(f"  {done}/{len(targets)} done ({rate:.1f}/s)")

    results.sort(key=lambda r: r.product_id)
    _write_csv(args.out_csv, results)
    _write_errors(args.errors_csv, errors)

    print(f"Wrote: {args.out_csv} ({len(results)} rows)")
    if errors:
        print(f"Wrote: {args.errors_csv} ({len(errors)} errors)")

    if not args.no_apply and results:
        _apply_updates(args.database_url, args.out_csv)
        print("Database updated.")


if __name__ == "__main__":
    main()

