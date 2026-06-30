#!/usr/bin/env python3
"""Run Clew Code through a SWE-bench API prediction workflow."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVAL_DIR = ROOT / "eval"
DEFAULT_DATASET_NAME = "SWE-bench/SWE-bench_Verified"
DEFAULT_DATASET_LOCAL = "datasets/SWE-bench__SWE-bench_Verified__style-3__fs-oracle"
DEFAULT_PROMPT_STYLE = "style-3"
DEFAULT_FILE_SOURCE = "oracle"
DEFAULT_SPLIT = "test"
DEFAULT_PORT = 8010


def _info(message: str) -> None:
    print(f"[clew-swebench] {message}", flush=True)


def _python() -> str:
    explicit = os.environ.get("SWEBENCH_PYTHON")
    if explicit:
        return explicit
    return sys.executable or "python"


def _swebench_repo(value: str | None) -> Path:
    candidate = Path(value or os.environ.get("SWEBENCH_REPO") or ROOT / "SWE-bench-dev").expanduser().resolve()
    if not (candidate / "swebench").is_dir():
        raise SystemExit(f"SWE-bench repo not found at {candidate}. Pass --swebench-repo or set SWEBENCH_REPO.")
    return candidate


def _ensure_imports(py: str, repo: Path) -> None:
    try:
        subprocess.run([py, "-c", "import swebench"], cwd=str(repo), check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(
            f"{py!r} cannot import swebench. Install it with:\n"
            f"  {py} -m pip install -e {repo} fastapi uvicorn tiktoken transformers\n\n{exc.stderr}"
        ) from exc


def prepare(args: argparse.Namespace) -> int:
    repo = _swebench_repo(args.swebench_repo)
    py = _python()
    _ensure_imports(py, repo)
    cmd = [
        py,
        "-m",
        "swebench.inference.make_datasets.create_text_dataset",
        "--dataset_name_or_path",
        args.dataset_name,
        "--output_dir",
        str(repo / "datasets"),
        "--prompt_style",
        args.prompt_style,
        "--file_source",
        args.file_source,
    ]
    _info("creating SWE-bench text dataset")
    subprocess.run(cmd, cwd=str(repo), check=True)
    return 0


@contextlib.contextmanager
def _server(repo: Path, py: str, port: int, log_path: Path):
    if shutil.which("uvicorn") is None:
        _info("uvicorn is not on PATH; using python -m uvicorn")
        cmd = [py, "-m", "uvicorn", "eval.clew_api_server:app", "--host", "127.0.0.1", "--port", str(port)]
    else:
        cmd = ["uvicorn", "eval.clew_api_server:app", "--host", "127.0.0.1", "--port", str(port)]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("wb") as log:
        proc = subprocess.Popen(cmd, cwd=str(ROOT), env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline = time.monotonic() + 60
        health_url = f"http://127.0.0.1:{port}/health"
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(health_url, timeout=2) as response:  # noqa: S310
                    if response.status == 200:
                        _info(f"server healthy at {health_url}")
                        break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError(f"Clew API server did not become healthy. See {log_path}")
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


def _run_predictions(args: argparse.Namespace, repo: Path, py: str, run_dir: Path, predictions: Path) -> None:
    runner = Path(args.custom_runner).expanduser().resolve() if args.custom_runner else EVAL_DIR / "run_custom_api.py"
    dataset_source = repo / args.dataset_local
    dataset_name_or_path = str(dataset_source.resolve()) if dataset_source.exists() else args.dataset_local

    extra_payload = json.loads(args.extra_payload)
    if args.provider:
        extra_payload["provider"] = args.provider
    if args.model:
        extra_payload["model"] = args.model
    if args.max_turns:
        extra_payload["max_turns"] = args.max_turns
    if args.dangerously_skip_permissions:
        extra_payload["dangerously_skip_permissions"] = True

    cmd = [
        py,
        str(runner),
        "--api_url",
        f"http://127.0.0.1:{args.port}/generate",
        "--dataset_name_or_path",
        dataset_name_or_path,
        "--split",
        args.split,
        "--prompt_field",
        args.prompt_field,
        "--model_name_or_path",
        args.model_name,
        "--output_file",
        str(predictions),
        "--timeout",
        str(args.request_timeout),
        "--append",
        "--max_patch_retries",
        str(args.max_patch_retries),
        "--patch_retry_backoff_seconds",
        str(args.patch_retry_backoff_seconds),
        "--extra_payload",
        json.dumps(extra_payload),
        "--workers",
        str(args.predict_workers),
    ]
    if args.instance_ids:
        cmd.extend(["--instance_ids", args.instance_ids])
    if args.capture_traces:
        cmd.extend(["--trace_dir", str(run_dir / "traces")])

    _info(f"generating predictions: {predictions}")
    subprocess.run(cmd, cwd=str(repo), check=True)


def _run_harness(args: argparse.Namespace, repo: Path, py: str, predictions: Path, run_id: str, log_path: Path) -> None:
    cmd = [
        py,
        "-m",
        "swebench.harness.run_evaluation",
        "--dataset_name",
        args.dataset_name,
        "--split",
        args.split,
        "--predictions_path",
        str(predictions),
        "--max_workers",
        str(args.harness_workers),
        "--run_id",
        run_id,
    ]
    if args.instance_ids:
        cmd.extend(["--instance_ids", *args.instance_ids.split(",")])
    _info(f"running Docker harness: {log_path}")
    with log_path.open("wb") as log:
        subprocess.run(cmd, cwd=str(repo), check=True, stdout=log, stderr=subprocess.STDOUT)


def run(args: argparse.Namespace) -> int:
    repo = _swebench_repo(args.swebench_repo)
    py = _python()
    if not args.skip_harness:
        _ensure_imports(py, repo)
    run_id = args.run_id or datetime.now().strftime("swebench-verified-%Y%m%d-%H%M%S")
    run_dir = (EVAL_DIR / "runs" / run_id).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    predictions = run_dir / "clew_preds.jsonl"

    local_dataset = repo / args.dataset_local
    if not local_dataset.exists():
        _info(f"local dataset not found at {local_dataset}; loading {args.dataset_name} directly")
        args.dataset_local = args.dataset_name

    with _server(repo, py, args.port, run_dir / "clew_server.log"):
        _run_predictions(args, repo, py, run_dir, predictions)

    if not args.skip_harness:
        _run_harness(args, repo, py, predictions, run_id, run_dir / "clew_harness.log")

    _info(f"run artifacts: {run_dir}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)

    def add_common_options(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "--swebench-repo",
            help="Path to SWE-bench checkout. Defaults to $SWEBENCH_REPO or ./SWE-bench-dev.",
        )
        p.add_argument("--dataset-name", default=DEFAULT_DATASET_NAME)
        p.add_argument("--dataset-local", default=DEFAULT_DATASET_LOCAL)
        p.add_argument("--split", default=DEFAULT_SPLIT)

    add_common_options(parser)
    sub = parser.add_subparsers(dest="command", required=True)

    p_prepare = sub.add_parser("prepare", help="Create the SWE-bench text dataset.")
    add_common_options(p_prepare)
    p_prepare.add_argument("--prompt-style", default=DEFAULT_PROMPT_STYLE)
    p_prepare.add_argument("--file-source", default=DEFAULT_FILE_SOURCE)
    p_prepare.set_defaults(func=prepare)

    p_run = sub.add_parser("run", help="Generate Clew predictions and optionally run the Docker harness.")
    add_common_options(p_run)
    p_run.add_argument("--run-id")
    p_run.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_run.add_argument("--prompt-field", default="text")
    p_run.add_argument("--model-name", default="clew-code-local")
    p_run.add_argument("--provider", help="Provider to pass to the Clew API wrapper.")
    p_run.add_argument("--model", help="Model to pass to the Clew API wrapper.")
    p_run.add_argument("--max-turns", type=int, default=30)
    p_run.add_argument("--dangerously-skip-permissions", action="store_true")
    p_run.add_argument("--extra-payload", default="{}")
    p_run.add_argument("--instance-ids", help="Comma-separated SWE-bench instance IDs.")
    p_run.add_argument("--request-timeout", type=int, default=1800)
    p_run.add_argument("--predict-workers", type=int, default=1, help="Reserved for compatible custom runners.")
    p_run.add_argument("--harness-workers", type=int, default=4)
    p_run.add_argument("--custom-runner", help="Optional replacement for eval/run_custom_api.py.")
    p_run.add_argument("--max-patch-retries", type=int, default=2)
    p_run.add_argument("--patch-retry-backoff-seconds", type=float, default=2.0)
    p_run.add_argument("--capture-traces", action="store_true")
    p_run.add_argument("--skip-harness", action="store_true")
    p_run.set_defaults(func=run)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
