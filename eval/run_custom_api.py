#!/usr/bin/env python3
"""Generate SWE-bench predictions through a local HTTP agent API.

This mirrors the custom-API shape used by the ClawCodex SWE-bench workflow:
load a SWE-bench text dataset, POST each prompt to an agent wrapper, extract a
unified diff from the agent's response, and write predictions JSONL.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from pathlib import Path
from typing import Any, Iterable

from datasets import load_dataset, load_from_disk


DIFF_RE = re.compile(r"(?ms)^diff --git .*?(?=^diff --git |\Z)")
FENCED_DIFF_RE = re.compile(r"(?ms)```(?:diff|patch)?\s*(diff --git .*?)```")


def _load_rows(dataset_name_or_path: str, split: str) -> list[dict[str, Any]]:
    path = Path(dataset_name_or_path)
    if path.exists():
        dataset = load_from_disk(str(path))
        if hasattr(dataset, "keys") and split in dataset:
            dataset = dataset[split]
    else:
        dataset = load_dataset(dataset_name_or_path, split=split)
    return [dict(row) for row in dataset]


def _existing_ids(output_file: Path) -> set[str]:
    if not output_file.exists():
        return set()
    ids: set[str] = set()
    with output_file.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row.get("instance_id"), str):
                ids.add(row["instance_id"])
    return ids


def _prompt(row: dict[str, Any], prompt_field: str) -> str:
    value = row.get(prompt_field) or row.get("text") or row.get("problem_statement")
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"No prompt text found for {row.get('instance_id')}")
    return value


def _select_rows(
    rows: Iterable[dict[str, Any]], instance_ids: str | None, append: bool, output_file: Path
) -> list[dict[str, Any]]:
    selected = list(rows)
    if instance_ids:
        wanted = {item.strip() for item in instance_ids.split(",") if item.strip()}
        selected = [row for row in selected if row.get("instance_id") in wanted]
    if append:
        done = _existing_ids(output_file)
        selected = [row for row in selected if row.get("instance_id") not in done]
    return selected


def _post_json(url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def extract_diff(text: str) -> str:
    fenced = FENCED_DIFF_RE.search(text)
    if fenced:
        text = fenced.group(1)
    matches = DIFF_RE.findall(text)
    patch = "\n".join(match.strip() for match in matches).strip()
    return patch + ("\n" if patch else "")


def is_valid_unified_diff(patch: str) -> bool:
    return patch.startswith("diff --git ") and "\n--- " in patch and "\n+++ " in patch and "\n@@ " in patch


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api_url", required=True)
    parser.add_argument("--dataset_name_or_path", required=True)
    parser.add_argument("--split", default="test")
    parser.add_argument("--prompt_field", default="text")
    parser.add_argument("--model_name_or_path", default="clew-code-local")
    parser.add_argument("--output_file", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--append", action="store_true")
    parser.add_argument("--instance_ids")
    parser.add_argument("--trace_dir", type=Path)
    parser.add_argument("--extra_payload", default="{}")
    parser.add_argument("--max_patch_retries", type=int, default=2)
    parser.add_argument("--patch_retry_backoff_seconds", type=float, default=2.0)
    parser.add_argument("--workers", type=int, default=1, help="Accepted for compatibility; currently runs sequentially.")
    args = parser.parse_args()

    extra_payload = json.loads(args.extra_payload)
    if not isinstance(extra_payload, dict):
        raise SystemExit("--extra_payload must be a JSON object")

    rows = _select_rows(_load_rows(args.dataset_name_or_path, args.split), args.instance_ids, args.append, args.output_file)
    args.output_file.parent.mkdir(parents=True, exist_ok=True)
    if args.trace_dir:
        args.trace_dir.mkdir(parents=True, exist_ok=True)

    with args.output_file.open("a" if args.append else "w", encoding="utf-8") as out:
        for index, row in enumerate(rows, start=1):
            instance_id = str(row["instance_id"])
            started = time.time()
            base_prompt = _prompt(row, args.prompt_field)
            full_output = ""
            patch = ""
            error = None
            response: dict[str, Any] = {}

            for attempt in range(args.max_patch_retries + 1):
                prompt = base_prompt
                if attempt:
                    prompt += (
                        "\n\nYour previous response did not contain a valid unified git diff. "
                        "Return only a valid patch beginning with 'diff --git'."
                    )
                try:
                    response = _post_json(
                        args.api_url,
                        {
                            **extra_payload,
                            "instance_id": instance_id,
                            "prompt": prompt,
                            "timeout": args.timeout,
                        },
                        args.timeout + 30,
                    )
                    full_output = str(
                        response.get("full_output") or response.get("completion") or response.get("output") or ""
                    )
                    patch = extract_diff(full_output) or str(response.get("model_patch") or "")
                    error = response.get("error")
                except Exception as exc:  # noqa: BLE001
                    error = repr(exc)
                    full_output = error
                    patch = ""

                if is_valid_unified_diff(patch) or attempt >= args.max_patch_retries:
                    break
                time.sleep(args.patch_retry_backoff_seconds)

            record = {
                "instance_id": instance_id,
                "model_name_or_path": args.model_name_or_path,
                "model_patch": patch,
                "full_output": full_output,
                "error": error,
                "duration_seconds": round(time.time() - started, 2),
                "response_debug": {
                    "command": response.get("command"),
                    "returncode": response.get("returncode"),
                    "env_debug": response.get("env_debug"),
                },
            }
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            out.flush()
            if args.trace_dir:
                (args.trace_dir / f"{instance_id}.json").write_text(
                    json.dumps(record, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            print(f"[{index}/{len(rows)}] {instance_id}: patch={is_valid_unified_diff(patch)} error={error}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
