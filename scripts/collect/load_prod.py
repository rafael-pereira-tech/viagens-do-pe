#!/usr/bin/env python3
"""Load collected snapshots.jsonl into prod price_snapshots via PostgREST.

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (service role bypasses RLS).
Idempotent: uses Prefer: resolution=ignore-duplicates so re-runs are safe.

Usage:
  python3 scripts/collect/load_prod.py <snapshots.jsonl> [--dry-run]
"""
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def to_row(o):
    return {
        "origin": o["origin"],
        "destination": o["destination"],
        "airline": o["airline"],
        "program": o["program"],
        "flight_date": o["flightDate"],
        "departure_time": o.get("departureTime"),
        "miles": o.get("miles"),
        "amount_brl": o.get("amountBrl"),
        "taxes_brl": o.get("taxesBrl"),
        "currency": o.get("currency", "BRL"),
        "source": o.get("source", "local-cdp-sweep"),
        "collected_at": o.get("collectedAt"),
        "raw_payload": {
            "fareLabel": o.get("fareLabel"),
            "flightCode": o.get("flightCode"),
            "stops": o.get("stops"),
            "modality": o.get("modality"),
        },
    }


def req(method, url, key, body=None, extra_headers=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        print("usage: load_prod.py <snapshots.jsonl> [--dry-run]")
        sys.exit(2)
    jsonl_path = args[0]

    env = load_env(os.path.join(ROOT, ".env"))
    base = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    rows = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(to_row(json.loads(line)))
    print(f"parsed {len(rows)} rows from {jsonl_path}")

    endpoint = f"{base}/rest/v1/price_snapshots"

    # preflight count (before)
    st, h, _ = req(
        "GET",
        f"{endpoint}?select=id&source=eq.local-cdp-sweep",
        key,
        extra_headers={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
    )
    before = h.get("Content-Range", "?").split("/")[-1]
    print(f"preflight: endpoint status={st}, existing local-cdp-sweep rows={before}")
    if st >= 400:
        print("preflight failed; aborting"); sys.exit(1)

    if dry:
        print("--dry-run: not inserting. sample payload:")
        print(json.dumps(rows[0], indent=2, ensure_ascii=False))
        return

    st, h, body = req(
        "POST", endpoint, key, body=rows,
        extra_headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
    )
    print(f"insert status={st}")
    if st >= 400:
        print(body); sys.exit(1)

    st, h, _ = req(
        "GET",
        f"{endpoint}?select=id&source=eq.local-cdp-sweep",
        key,
        extra_headers={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
    )
    after = h.get("Content-Range", "?").split("/")[-1]
    print(f"done. local-cdp-sweep rows: {before} -> {after}")


if __name__ == "__main__":
    main()
