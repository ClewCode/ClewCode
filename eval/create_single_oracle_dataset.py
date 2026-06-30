#!/usr/bin/env python3
"""Create a tiny SWE-bench text dataset with oracle files for one instance."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

from datasets import Dataset, load_dataset


def _patch_files(patch: str) -> list[str]:
    files: set[str] = set()
    for line in patch.splitlines():
        match = re.match(r"diff --git a/(.*?) b/(.*)", line)
        if match:
            files.add(match.group(2))
    return sorted(files)


def _read_raw_file(repo: str, commit: str, path: str, timeout: int) -> str:
    url = f"https://raw.githubusercontent.com/{repo}/{commit}/{path}"
    with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310
        return response.read().decode("utf-8", errors="replace")


def _prompt(row: dict[str, Any], files: dict[str, str]) -> str:
    parts = [
        "You are solving a SWE-bench Verified task.",
        "Return only a valid unified git diff beginning with diff --git.",
        "Do not include markdown fences or explanation.",
        f"Instance: {row['instance_id']}",
        f"Repository: {row['repo']}",
        f"Base commit: {row['base_commit']}",
        "Problem statement:\n" + row["problem_statement"],
    ]
    for path, content in files.items():
        parts.append(f"File: {path}\n```\n{content}\n```")
    parts.append("Return only the patch.")
    return "\n\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-name", default="SWE-bench/SWE-bench_Verified")
    parser.add_argument("--split", default="test")
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    row = next(
        dict(candidate)
        for candidate in load_dataset(args.dataset_name, split=args.split)
        if candidate["instance_id"] == args.instance_id
    )
    files: dict[str, str] = {}
    for path in _patch_files(row["patch"]):
        files[path] = _read_raw_file(row["repo"], row["base_commit"], path, args.timeout)

    row["text"] = _prompt(row, files)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    Dataset.from_list([row]).save_to_disk(str(args.output_dir / "dataset"))
    (args.output_dir / "prompt.txt").write_text(row["text"], encoding="utf-8")
    (args.output_dir / "manifest.json").write_text(
        json.dumps(
            {
                "instance_id": row["instance_id"],
                "repo": row["repo"],
                "base_commit": row["base_commit"],
                "files": sorted(files),
                "prompt_chars": len(row["text"]),
                "dataset": str((args.output_dir / "dataset").resolve()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print((args.output_dir / "dataset").resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
