#!/usr/bin/env python3
"""Patch voice-chat/sidecar/stt.py for CPU-friendly defaults.

Applied AFTER the Dockerfile clones voice-chat/sidecar. Idempotent: safe to
re-run on every build.

Changes:
  1. beam_size: 10 -> 5        (halves decoder work)
  2. cpu_threads: 1            (capped, configurable via env WHISPER_CPU_THREADS)

Usage:
  python patch-sidecar.py [path-to-sidecar]
  # default path: /app/sidecar
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path


CPU_THREADS_ENV = "WHISPER_CPU_THREADS"
DEFAULT_CPU_THREADS = "1"
STT_FILE = "stt.py"


def _patch_beam_size(src: str) -> tuple[str, bool]:
    if "beam_size=5" in src and "beam_size=10" not in src:
        return src, False
    new = src.replace("beam_size=10,", "beam_size=5,")
    return new, new != src


def _patch_cpu_threads(src: str) -> tuple[str, int]:
    """Inject cpu_threads into every WhisperModel(...) call, if absent."""
    if "cpu_threads=" in src:
        return src, 0

    inject = (
        f'cpu_threads=int(os.environ.get("{CPU_THREADS_ENV}", '
        f'"{DEFAULT_CPU_THREADS}"))'
    )

    # Greedy match across newlines so we catch multi-line WhisperModel() calls.
    pattern = re.compile(r"WhisperModel\(\s*(.+?)\s*\)", re.DOTALL)

    def repl(m: re.Match) -> str:
        inner = m.group(1).rstrip().rstrip(",").rstrip()
        return f"WhisperModel({inner}, {inject})"

    new, n = pattern.subn(repl, src)
    return new, n


def patch_stt_py(stt_py: Path) -> list[str]:
    if not stt_py.exists():
        return []

    src = stt_py.read_text()
    changes: list[str] = []

    src, beam_changed = _patch_beam_size(src)
    if beam_changed:
        changes.append("beam_size: 10 -> 5")

    src, n_threads = _patch_cpu_threads(src)
    if n_threads:
        changes.append(
            f"cpu_threads={DEFAULT_CPU_THREADS} (env {CPU_THREADS_ENV}) "
            f"injected into {n_threads} WhisperModel() call(s)"
        )
    elif "cpu_threads=" not in src:
        changes.append("(no WhisperModel() calls found to patch - skipped)")

    if changes:
        stt_py.write_text(src)
    return changes


def main() -> int:
    sidecar_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/app/sidecar")
    stt_py = sidecar_dir / STT_FILE

    if not stt_py.exists():
        print(f"[patch-sidecar] {stt_py} not found - nothing to do", file=sys.stderr)
        return 0  # graceful: voice-chat may add more files in the future

    try:
        changes = patch_stt_py(stt_py)
    except Exception as e:  # pragma: no cover
        print(f"[patch-sidecar] failed: {e}", file=sys.stderr)
        return 1

    if changes:
        print(f"[patch-sidecar] patched {stt_py}:")
        for c in changes:
            print(f"  - {c}")
    else:
        print(f"[patch-sidecar] {stt_py} already patched (no-op)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
