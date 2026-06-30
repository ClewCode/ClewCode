# SWE-bench Verified Evaluation

This directory contains the Clew Code side of a
[SWE-bench Verified](https://www.swebench.com/) run. It follows the same shape
as the public ClawCodex workflow:

- `clew_api_server.py` exposes `/health` and `/generate` around `clew -p`.
- `run_swebench.py prepare` builds the SWE-bench text dataset.
- `run_swebench.py run` starts the API server, calls `eval/run_custom_api.py`,
  writes `predictions.jsonl`, and can invoke the Docker harness.
- `compare_results.py` compares two harness summary JSON files.

This repository does not claim an official score until a full 499-instance run
is published with the generated artifacts.

## Prerequisites

1. Docker is installed and `docker ps` works.
2. Clew Code is built from this repository:

   ```bash
   bun install
   bun run build
   ```

3. At least one provider is configured for non-interactive runs. For example:

   ```bash
   export OPENAI_API_KEY=sk-...
   ```

4. The SWE-bench repository is available locally and includes
   `scripts/run_custom_api.py`:

   ```bash
   git clone https://github.com/swe-bench/SWE-bench.git SWE-bench-dev
   cd SWE-bench-dev
   python -m venv .venv
   source .venv/bin/activate
   pip install -U pip
   pip install -e .
   pip install fastapi uvicorn tiktoken transformers
   ```

On Windows, prefer WSL2 for the Docker harness. Dataset preparation may work in
PowerShell, but the official harness expects a Unix-like environment in several
places.

## Command Shape

Clew Code's one-shot mode is the agent entrypoint for each task:

```bash
clew -p "Fix the issue described below..."
```

When evaluating from source, call the built artifact directly so the harness uses
the code under test:

```bash
bun run build
bun ./dist/main.js -p "Fix the issue described below..."
```

If the benchmark wrapper invokes the package binary, make sure the binary points
at this checkout, not a globally installed older release.

You can override the command used by the API server:

```bash
export CLEW_EVAL_COMMAND="bun /path/to/ClewCode/dist/main.js"
```

Other useful environment variables:

- `SWEBENCH_REPO`: path to the SWE-bench checkout.
- `SWEBENCH_PYTHON`: Python interpreter that can import `swebench`.
- `CLEW_EVAL_TIMEOUT`: per-request timeout in seconds.
- `CLEW_EVAL_WORKDIR`: default working directory for `clew -p` requests.

## Minimal local smoke test

Before running SWE-bench, check that a non-interactive prompt can complete in a
temporary repository:

```bash
mkdir -p /tmp/clew-swebench-smoke
cd /tmp/clew-swebench-smoke
git init
printf 'def add(a, b):\n    return a - b\n' > calc.py
printf 'from calc import add\n\ndef test_add():\n    assert add(2, 3) == 5\n' > test_calc.py

cd /path/to/ClewCode
bun ./dist/main.js -p "Fix the failing pytest test in /tmp/clew-swebench-smoke. Keep the change minimal."
```

The smoke test should edit the target workspace and leave a normal git diff
there.

## Prepare The Dataset

From the Clew Code checkout:

```bash
python eval/run_swebench.py prepare --swebench-repo /path/to/SWE-bench-dev
```

Defaults target the full `SWE-bench/SWE-bench_Verified` split using `style-3`
prompts with oracle file context. Override them if your comparison needs a
different split or prompt style:

```bash
python eval/run_swebench.py \
  --dataset-name SWE-bench/SWE-bench_Lite \
  --dataset-local datasets/SWE-bench__SWE-bench_Lite__style-3__fs-oracle \
  prepare
```

## Run A Smoke Batch

Use one or two known instance IDs first:

```bash
python eval/run_swebench.py run \
  --swebench-repo /path/to/SWE-bench-dev \
  --model deepseek-v4-flash \
  --dangerously-skip-permissions \
  --instance-ids astropy__astropy-12907 \
  --skip-harness \
  --capture-traces
```

This starts `eval/clew_api_server.py`, calls `eval/run_custom_api.py`, and writes:

```text
eval/runs/swebench-verified-YYYYMMDD-HHMMSS/
  clew_preds.jsonl
  clew_server.log
  traces/
```

Remove `--skip-harness` to run Docker evaluation too:

```bash
python eval/run_swebench.py run \
  --swebench-repo /path/to/SWE-bench-dev \
  --model deepseek-v4-flash \
  --dangerously-skip-permissions \
  --instance-ids astropy__astropy-12907
```

## Run The Full Verified Split

```bash
python eval/run_swebench.py run \
  --swebench-repo /path/to/SWE-bench-dev \
  --model deepseek-v4-flash \
  --dangerously-skip-permissions \
  --predict-workers 1 \
  --harness-workers 8 \
  --capture-traces
```

Full Verified runs are expensive and slow. Keep `--predict-workers 1` until the
provider, rate limits, and local machine behavior are known.

## How The Runner Works

The SWE-bench harness expects a prediction file with one JSON object per task.
Each object must include at least:

```json
{"instance_id":"django__django-11099","model_name_or_path":"clew-code/<model>","model_patch":"diff --git ..."}
```

The custom API runner does this per instance:

1. Read the prompt from the SWE-bench text dataset (`text` by default).
2. POST the prompt to `eval/clew_api_server.py` at `/generate`.
3. Extract a unified diff beginning with `diff --git` from the agent output.
4. Write that diff as `model_patch` for the `instance_id`.
5. Invoke `python -m swebench.harness.run_evaluation` against the predictions,
   unless `--skip-harness` is set.

For DeepSeek in the current Clew build, set the provider through the environment
instead of the CLI provider flag:

```bash
export AI_PROVIDER=deepseek
export DEEPSEEK_API_KEY=...
```

For a direct comparison with `clawcodex` or `openclaude`, keep these variables
the same across agents:

- SWE-bench split and instance list
- backing model and provider endpoint
- prompt template
- max turns or timeout
- tool permissions
- Docker harness version

## Run Layout

```text
eval/runs/
  swebench-verified-YYYYMMDD-HHMMSS/
    clew_preds.jsonl
    clew_server.log
    clew_harness.log
    traces/
```

`eval/runs/` is ignored by git. Publish selected artifacts separately when
announcing a score.

## Compare Two Harness Summaries

```bash
python eval/compare_results.py \
  --left /path/to/clew-code-local.swebench-verified-run.json \
  --left-label clew-code \
  --right /path/to/other-agent-local.swebench-verified-run.json \
  --right-label other-agent \
  --out eval/runs/manual/comparison.md
```

## Reporting results

Report a Clew Code SWE-bench Verified result only when the run includes:

- the exact Clew Code commit
- the exact SWE-bench commit or package version
- the model/provider name
- the number of instances attempted
- resolved, unresolved, and errored counts
- links or paths to `predictions.jsonl` and harness summary artifacts

Until those artifacts exist, describe the status as "SWE-bench Verified
compatible" or "SWE-bench Verified evaluation workflow", not as a benchmark
score.
