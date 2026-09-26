#!/usr/bin/env python3
"""CPython bootstrap for the AIMO `code-runtime-docker` backend.

Wire protocol: JSON-lines on stdin (host -> child) and stdout (child -> host).
The host sends ``boot``, ``run``, ``reply``; this side sends ``boot-ack``,
``call``, ``log``, ``done``. The program's own stdout/stderr are captured via
``redirect_stdout``/``redirect_stderr`` and forwarded as ``log`` frames, so fd 1
carries only framed JSON. The model program runs as the body of an async
function (top-level ``await``/``return`` are legal) with host bindings
materialised as ``await``-able globals.
"""

from __future__ import annotations

import asyncio
import json
import os
import resource
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout

OUT_FD = 1
_host_in = sys.stdin.buffer  # fd 0

_call_seq = 0
_pending: dict[int, asyncio.Future] = {}


def send_frame(obj: object) -> None:
    os.write(OUT_FD, (json.dumps(obj, separators=(",", ":")) + "\n").encode("utf-8"))


class _LogCapture:
    """Forwards each program stdout/stderr write as one eager ``log`` frame."""

    def write(self, text: str) -> int:
        if text:
            send_frame({"type": "log", "text": text})
        return len(text)

    def flush(self) -> None:
        pass


async def _read_replies() -> None:
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, _host_in.readline)
        if not line:
            break
        try:
            frame = json.loads(line)
        except (ValueError, TypeError):
            continue
        if frame.get("type") != "reply":
            continue
        fut = _pending.pop(frame.get("id"), None)
        if fut is None or fut.done():
            continue
        if frame.get("ok"):
            fut.set_result(frame.get("value"))
        else:
            fut.set_exception(RuntimeError(str(frame.get("message", "binding call failed"))))


async def _call_binding(global_name: str, name: str, args: object) -> object:
    global _call_seq
    _call_seq += 1
    call_id = _call_seq
    fut = asyncio.get_running_loop().create_future()
    _pending[call_id] = fut
    send_frame({"type": "call", "id": call_id, "global": global_name, "name": name, "args": args})
    return await fut


def _materialize(namespaces: list[dict], scope: dict) -> None:
    for ns in namespaces:
        g = ns["global"]
        obj: dict[str, object] = {}
        for fname in ns["names"]:

            async def _fn(args: object, _g: str = g, _n: str = fname) -> object:
                return await _call_binding(_g, _n, args)

            obj[fname] = _fn
        scope[g] = obj


async def _run_program(program: str, namespaces: list[dict]) -> None:
    scope: dict = {}
    _materialize(namespaces, scope)
    reader = asyncio.create_task(_read_replies())
    try:
        wrapper = "async def __dsh_program__():\n" + "\n".join("  " + ln for ln in program.splitlines())
        exec(compile(wrapper, "<program>", "exec"), scope)
        capture = _LogCapture()
        with redirect_stdout(capture), redirect_stderr(capture):
            value = await scope["__dsh_program__"]()
        try:
            json.dumps(value)
            send_frame({"type": "done", "value": value})
        except (TypeError, ValueError):
            send_frame({"type": "done", "error": {"kind": "invalid-output", "message": "completion value is not lossless JSON"}})
    except BaseException:
        send_frame({"type": "done", "error": {"kind": "exception", "message": traceback.format_exc()}})
    finally:
        reader.cancel()


def main() -> None:
    boot = json.loads(_host_in.readline())
    cpu_seconds = boot.get("cpuSeconds")
    if cpu_seconds:
        # RLIMIT_CPU is the in-container CPU budget: the hard limit SIGKILLs the
        # program when exceeded, which the host observes as substrate death
        # (kind `worker-exit`). Wall-clock expiry is the host-side `timeout`.
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    address_bytes = boot.get("addressSpaceBytes")
    if address_bytes:
        resource.setrlimit(resource.RLIMIT_AS, (address_bytes, address_bytes))
    send_frame({"type": "boot-ack"})

    run = json.loads(_host_in.readline())
    if run.get("type") != "run":
        send_frame({"type": "done", "error": {"kind": "exception", "message": "expected run frame after boot"}})
        return
    asyncio.run(_run_program(run["program"], boot.get("namespaces", [])))


if __name__ == "__main__":
    main()
