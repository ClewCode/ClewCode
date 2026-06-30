#!/usr/bin/env python3
"""FastAPI wrapper around Clew Code one-shot mode for SWE-bench runners.

The server intentionally accepts a loose request shape because different
SWE-bench helper scripts use slightly different field names. It returns the raw
agent output plus a best-effort patch so callers can either use the returned
``model_patch`` directly or extract a diff from ``completion`` themselves.
"""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("CLEW_EVAL_TIMEOUT", "1800"))

app = FastAPI(title="Clew Code SWE-bench API")


class GenerateRequest(BaseModel):
    prompt: str | None = None
    text: str | None = None
    input: str | None = None
    problem_statement: str | None = None
    instance_id: str | None = None
    cwd: str | None = None
    timeout: int | None = None
    provider: str | None = None
    model: str | None = None
    max_turns: int | None = None
    dangerously_skip_permissions: bool = False
    extra_args: list[str] = Field(default_factory=list)

    class Config:
        extra = "allow"


def _prompt_from_request(req: GenerateRequest) -> str:
    direct = req.prompt or req.text or req.input
    if direct:
        return direct

    parts: list[str] = []
    if req.instance_id:
        parts.append(f"Instance: {req.instance_id}")
    if req.problem_statement:
        parts.append(req.problem_statement)
    extra = req.model_extra or {}
    for key in ("repo", "base_commit", "hints_text", "test_patch"):
        value = extra.get(key)
        if value:
            parts.append(f"{key}:\n{value}")
    prompt = "\n\n".join(parts).strip()
    if prompt:
        return prompt
    raise HTTPException(status_code=400, detail="Request must include prompt, text, input, or problem_statement.")


def _command_prefix() -> list[str]:
    configured = os.environ.get("CLEW_EVAL_COMMAND")
    if configured:
        return [part.strip("\"'") for part in shlex.split(configured, posix=os.name != "nt")]

    built_entrypoint = ROOT / "dist" / "main.js"
    if built_entrypoint.is_file():
        return ["bun", str(built_entrypoint)]
    return ["clew"]


def _eval_env_overrides() -> dict[str, str]:
    raw = os.environ.get("CLEW_EVAL_ENV_JSON")
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("CLEW_EVAL_ENV_JSON must be a JSON object")
    return {str(key): str(value) for key, value in parsed.items() if value is not None}


def _extract_unified_diff(text: str) -> str:
    match = re.search(r"(?ms)^diff --git .*\Z", text)
    if match:
        return match.group(0).strip() + "\n"
    fenced = re.search(r"(?ms)```(?:diff|patch)?\s*(diff --git .*?)```", text)
    if fenced:
        return fenced.group(1).strip() + "\n"
    return ""


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "agent": "clew-code",
        "root": str(ROOT),
        "command": _command_prefix(),
        "env": {
            "AI_PROVIDER": os.environ.get("AI_PROVIDER"),
            "has_DEEPSEEK_API_KEY": bool(os.environ.get("DEEPSEEK_API_KEY")),
            "override_keys": sorted(_eval_env_overrides().keys()),
        },
    }


@app.post("/generate")
def generate(req: GenerateRequest) -> dict[str, Any]:
    prompt = _prompt_from_request(req)
    cwd = Path(req.cwd or os.environ.get("CLEW_EVAL_WORKDIR") or ROOT).expanduser().resolve()
    timeout = req.timeout or DEFAULT_TIMEOUT_SECONDS
    cmd = [*_command_prefix(), *req.extra_args]
    if req.provider:
        cmd.extend(["--provider", req.provider])
    if req.model:
        cmd.extend(["--model", req.model])
    if req.max_turns:
        cmd.extend(["--append-system-prompt", f"Stop after at most {req.max_turns} tool-use turns."])
    if req.dangerously_skip_permissions:
        cmd.append("--dangerously-skip-permissions")
    cmd.extend(["-p", prompt, "--output-format", "json"])

    env = os.environ.copy()
    env.update(_eval_env_overrides())
    env.setdefault("NO_COLOR", "1")
    env.setdefault("CI", "1")

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=f"Could not start Clew Code command: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        output = ((exc.stdout or "") + "\n" + (exc.stderr or "")).strip()
        return {
            "instance_id": req.instance_id,
            "completion": output,
            "output": output,
            "full_output": output,
            "model_patch": "",
            "error": f"timeout after {timeout}s",
            "returncode": None,
        }

    full_output = "\n".join(part for part in (proc.stdout, proc.stderr) if part).strip()
    patch = _extract_unified_diff(full_output)

    return {
        "instance_id": req.instance_id,
        "completion": full_output,
        "output": full_output,
        "full_output": full_output,
        "model_patch": patch,
        "returncode": proc.returncode,
        "command": cmd,
        "cwd": str(cwd),
        "env_debug": {
            "AI_PROVIDER": env.get("AI_PROVIDER"),
            "has_DEEPSEEK_API_KEY": bool(env.get("DEEPSEEK_API_KEY")),
        },
    }
