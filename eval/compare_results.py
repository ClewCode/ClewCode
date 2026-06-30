#!/usr/bin/env python3
"""Compare two SWE-bench harness summary JSON files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _ids(summary: dict[str, Any], key: str) -> set[str]:
    return set(summary.get(key, []))


def _count(summary: dict[str, Any], key: str) -> int:
    return int(summary.get(key, 0))


def _render(left: dict[str, Any], right: dict[str, Any], left_label: str, right_label: str) -> str:
    left_resolved = _ids(left, "resolved_ids")
    right_resolved = _ids(right, "resolved_ids")
    submitted = _ids(left, "submitted_ids") | _ids(right, "submitted_ids")
    both = sorted(left_resolved & right_resolved)
    only_left = sorted(left_resolved - right_resolved)
    only_right = sorted(right_resolved - left_resolved)
    neither = sorted(submitted - left_resolved - right_resolved)

    lines = [
        f"# SWE-bench comparison: `{left_label}` vs `{right_label}`",
        "",
        f"| Agent | Resolved | Unresolved | Empty patch | Error |",
        "|---|---:|---:|---:|---:|",
        (
            f"| `{left_label}` | {_count(left, 'resolved_instances')} | "
            f"{_count(left, 'unresolved_instances')} | {_count(left, 'empty_patch_instances')} | "
            f"{_count(left, 'error_instances')} |"
        ),
        (
            f"| `{right_label}` | {_count(right, 'resolved_instances')} | "
            f"{_count(right, 'unresolved_instances')} | {_count(right, 'empty_patch_instances')} | "
            f"{_count(right, 'error_instances')} |"
        ),
        "",
        f"- Both solved: {len(both)}",
        f"- Only `{left_label}` solved: {len(only_left)}",
        f"- Only `{right_label}` solved: {len(only_right)}",
        f"- Neither solved: {len(neither)}",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--left", required=True, type=Path)
    parser.add_argument("--right", required=True, type=Path)
    parser.add_argument("--left-label", default="left")
    parser.add_argument("--right-label", default="right")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    report = _render(_load(args.left), _load(args.right), args.left_label, args.right_label)
    print(report)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
