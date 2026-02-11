#!/usr/bin/env python3
"""
Export cases where (seller_name, listing_title) are identical but images differ.

This is intended as a sanity check:
- Sometimes titles stay the same while images change (could be different products).
- Sometimes images change slightly (crop/nuance); pHash distance helps quantify that.

Output: a readable .txt grouped by seller+title.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
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


@dataclass(frozen=True)
class Row:
    seller_name: str
    listing_title: str
    product_id: str
    last_seen_at: str
    dist_from_latest: int
    phash_hex: str
    primary_image_url: str


def _parse_rows(tsv: str) -> list[Row]:
    out: list[Row] = []
    for line in tsv.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) != 7:
            continue
        seller_name, listing_title, product_id, last_seen_at, dist, phash_hex, url = parts
        try:
            dist_i = int(dist)
        except Exception:
            dist_i = -1
        out.append(
            Row(
                seller_name=seller_name,
                listing_title=listing_title,
                product_id=product_id,
                last_seen_at=last_seen_at,
                dist_from_latest=dist_i,
                phash_hex=phash_hex,
                primary_image_url=url,
            )
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Postgres connection string (default: $DATABASE_URL)",
    )
    ap.add_argument(
        "--out",
        default="",
        help="Output path. Default: exports/digideal/digideal_title_seller_same_diff_image_<date>.txt",
    )
    args = ap.parse_args()

    if not args.database_url:
        _die("Missing --database-url (or $DATABASE_URL).")

    sql = r"""
WITH g AS (
  SELECT seller_name, listing_title
  FROM public.digideal_products
  WHERE seller_name IS NOT NULL
    AND listing_title IS NOT NULL
    AND primary_image_phash IS NOT NULL
  GROUP BY seller_name, listing_title
  HAVING COUNT(*) > 1
     AND COUNT(DISTINCT primary_image_phash) > 1
),
rows AS (
  SELECT d.seller_name,
         d.listing_title,
         d.product_id,
         d.last_seen_at,
         d.primary_image_url,
         d.primary_image_phash,
         d.primary_image_phash_hex,
         first_value(d.primary_image_phash) OVER (
           PARTITION BY d.seller_name, d.listing_title
           ORDER BY d.last_seen_at DESC
         ) AS ref_phash
  FROM public.digideal_products d
  JOIN g
    ON g.seller_name = d.seller_name
   AND g.listing_title = d.listing_title
)
SELECT seller_name,
       listing_title,
       product_id,
       to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       public.phash64_distance(primary_image_phash, ref_phash) AS dist_from_latest,
       coalesce(primary_image_phash_hex, ''),
       coalesce(primary_image_url, '')
FROM rows
ORDER BY seller_name, listing_title, last_seen_at DESC;
"""

    raw = _run_psql(args.database_url, sql)
    rows = _parse_rows(raw)

    today = dt.date.today().isoformat()
    default_out = os.path.join(
        "exports",
        "digideal",
        f"digideal_title_seller_same_diff_image_{today}.txt",
    )
    out_path = args.out or default_out
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Group rows.
    rows.sort(key=lambda r: (r.seller_name, r.listing_title, r.last_seen_at), reverse=False)

    groups: dict[tuple[str, str], list[Row]] = {}
    for r in rows:
        groups.setdefault((r.seller_name, r.listing_title), []).append(r)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("DigiDeal: Same seller+title, different image fingerprint\n")
        f.write(f"Generated: {dt.datetime.now().isoformat(timespec='seconds')}\n")
        f.write("Notes:\n")
        f.write("- dist_from_latest is Hamming distance between pHash64 values (0 = identical)\n")
        f.write("- Similarity ~95% corresponds to distance <= 3 for 64-bit pHash\n")
        f.write("\n")

        if not groups:
            f.write("No matches found.\n")
            print(out_path)
            return

        for (seller, title), rs in groups.items():
            # rs is already ordered by last_seen_at DESC in SQL, but keep deterministic.
            rs_sorted = sorted(rs, key=lambda r: r.last_seen_at, reverse=True)
            distinct_hex = sorted({r.phash_hex for r in rs_sorted if r.phash_hex})
            max_dist = max((r.dist_from_latest for r in rs_sorted if r.dist_from_latest >= 0), default=-1)

            f.write("=" * 100 + "\n")
            f.write(f"Seller: {seller}\n")
            f.write(f"Title : {title}\n")
            f.write(f"Rows  : {len(rs_sorted)}\n")
            f.write(f"pHash : {len(distinct_hex)} distinct\n")
            f.write(f"Max dist_from_latest: {max_dist}\n")
            f.write("\n")
            for r in rs_sorted:
                f.write(
                    f"- {r.product_id} | last_seen={r.last_seen_at} | dist={r.dist_from_latest} | phash_hex={r.phash_hex}\n"
                )
                if r.primary_image_url:
                    f.write(f"  {r.primary_image_url}\n")
            f.write("\n")

    print(out_path)


if __name__ == "__main__":
    main()
