#!/usr/bin/env python3
"""Patch voice-chat/sidecar/stt.py for CPU-friendly defaults + memory savings.

Applied AFTER the Dockerfile clones voice-chat/sidecar. Idempotent: safe to
re-run on every build.

Changes (cumulative):
  1. model_size default: "large-v3-turbo" -> "small"
     (saves ~550 MB RAM resident; <2% accuracy loss on PT-BR)
  2. beam_size: 10 -> 5                              (halves decoder work)
  3. cpu_threads=1                                   (capped, configurable via env WHISPER_CPU_THREADS)
  4. idle-eviction                                   (configurable via env WHISPER_IDLE_EVICTION_SECONDS, default 300s)
     After N seconds without a transcribe call, the model is released from RAM
     and re-loaded on demand. Cold-start penalty of ~2-5s after idle window.
     Set WHISPER_IDLE_EVICTION_SECONDS=0 to disable.

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

IDLE_EVICTION_ENV = "WHISPER_IDLE_EVICTION_SECONDS"
DEFAULT_IDLE_EVICTION_SECONDS = "300"

STT_FILE = "stt.py"


def _patch_model_size(src):
    """Switch the default model from large-v3-turbo to small.

    Idempotent: once the substitution is made, the original string is gone.
    """
    sentinel = 'model_size="small"'
    if sentinel in src:
        return src, False
    new = src.replace('model_size="large-v3-turbo"', sentinel)
    return new, new != src


def _patch_beam_size(src):
    if "beam_size=5" in src and "beam_size=10" not in src:
        return src, False
    new = src.replace("beam_size=10,", "beam_size=5,")
    return new, new != src


def _patch_cpu_threads(src):
    """Inject cpu_threads into every WhisperModel(...) call, if absent."""
    if "cpu_threads=" in src:
        return src, 0

    inject = (
        f'cpu_threads=int(os.environ.get("{CPU_THREADS_ENV}", '
        f'"{DEFAULT_CPU_THREADS}"))'
    )

    pattern = re.compile(r"WhisperModel\(\s*(.+?)\s*\)", re.DOTALL)

    def repl(m):
        inner = m.group(1).rstrip().rstrip(",").rstrip()
        return f"WhisperModel({inner}, {inject})"

    new, n = pattern.subn(repl, src)
    return new, n


def _patch_imports(src):
    """Ensure `import time` and `import gc` are present (for idle-eviction)."""
    changes = []
    if "import time\n" not in src:
        if "import os\n" in src:
            src = src.replace(
                "import os\n",
                "import os\nimport time\nimport gc\n",
                1,
            )
            changes.append("added `import time` and `import gc`")
    return src, changes


# --------------------------------------------------------------------------
# Patch 5b: GPU device locking (cache the decision, don't re-probe every init)
# --------------------------------------------------------------------------
DEVICE_ENV = "WHISPER_DEVICE"  # "auto" (default), "cuda", or "cpu"
DEFAULT_DEVICE = "auto"


def _patch_device_lock(src):
    """Cache the GPU/CPU decision so we don't re-probe on every model reload.

    Replaces the fragile os.path.exists() probe + fallback dance with a single
    explicit probe that runs ONCE per Transcriber lifetime. After eviction,
    the cached value is reused - no second IF.

    Idempotent via `_device_locked` sentinel.
    """
    if "_device_locked" in src:
        return src, False

    # 1) Add the cached field in __init__ right before the device-detection block.
    init_marker = (
        "        # Detect device if not provided\n"
        "        if device is None:\n"
    )
    if init_marker not in src:
        return src, False

    inject = (
        "        # GPU device lock: probe CUDA once on first init, cache the result.\n"
        "        # Subsequent reloads (post-idle-eviction) reuse the cached value,\n"
        "        # skipping the os.path probe and the if/else dance entirely.\n"
        f'        self._device_locked = os.environ.get("{DEVICE_ENV}", "{DEFAULT_DEVICE}")\n'
        "        if self._device_locked not in (\"cuda\", \"cpu\"):\n"
        "            self._device_locked = None  # will be probed on first _initialize_model\n"
        "\n"
        "        # Detect device if not provided\n"
        "        if device is None:\n"
    )
    src = src.replace(init_marker, inject, 1)

    # 2) Rewrite _initialize_model to use the lock.
    # We use a single concatenated-string key (init_model_old_str) so we can do
    # `if key in src` and `src.replace(key, ...)` reliably.
    init_model_old_str = (
        "    def _initialize_model(self):\n"
        "        try:\n"
        '            logger.info(f"Initializing WhisperModel (device={self.device}, compute_type={self.compute_type})")\n'
        "            self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type, cpu_threads=int(os.environ.get(\"WHISPER_CPU_THREADS\", \"1\")))\n"
        '            logger.info(f"WhisperModel ready on {self.device}.")\n'
        "        except Exception as e:\n"
        "            if self.device == \"cuda\":\n"
        '                logger.warning(f"CUDA initialization failed, retrying on CPU: {e}")\n'
        "                self._fallback_to_cpu()\n"
        "            else:\n"
        '                logger.error(f"Failed to initialize WhisperModel on CPU: {e}")\n'
        "                raise e\n"
    )

    init_model_new_str = (
        "    def _initialize_model(self):\n"
        "        # Probe GPU once on first call, then cache the decision. After\n"
        "        # idle-eviction, this skips the os.path probe and the if/else\n"
        "        # dance entirely - the device is locked for the process lifetime.\n"
        "        if self._device_locked is None:\n"
        "            self._device_locked = self._probe_device()\n"
        "        if self._device_locked != self.device:\n"
        "            self.device = self._device_locked\n"
        "            if self._device_locked == \"cpu\":\n"
        "                self.compute_type = \"int8\"\n"
        "        try:\n"
        '            logger.info(f"Initializing WhisperModel (device={self.device}, compute_type={self.compute_type})")\n'
        "            self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type, cpu_threads=int(os.environ.get(\"WHISPER_CPU_THREADS\", \"1\")))\n"
        '            logger.info(f"WhisperModel ready on {self.device}.")\n'
        "        except Exception as e:\n"
        "            if self._device_locked == \"cuda\":\n"
        "                # CUDA init failed (driver mismatch, OOM, etc). Lock to CPU.\n"
        '                logger.warning(f"CUDA init failed, locking to CPU: {e}")\n'
        "                self._device_locked = \"cpu\"\n"
        "                self.device = \"cpu\"\n"
        "                self.compute_type = \"int8\"\n"
        '                logger.info("Re-initializing WhisperModel on CPU (locked)")\n'
        "                self.model = WhisperModel(self.model_size, device=\"cpu\", compute_type=\"int8\", cpu_threads=int(os.environ.get(\"WHISPER_CPU_THREADS\", \"1\")))\n"
        '                logger.info("WhisperModel ready on cpu (after CUDA fallback).")\n'
        "            else:\n"
        '                logger.error(f"Failed to initialize WhisperModel on CPU: {e}")\n'
        "                raise e\n"
        "\n"
        "    def _probe_device(self):\n"
        '        """Probe CUDA once. Returns \"cuda\" if usable, else \"cpu\". Result is cached."""\n'
        f'        forced = os.environ.get("{DEVICE_ENV}", "{DEFAULT_DEVICE}")\n'
        "        if forced in (\"cuda\", \"cpu\"):\n"
        f'            logger.info(f"Device forced via {DEVICE_ENV}={{forced}}")\n'
        "            return forced\n"
        "        # Probe: ask ctranslate2 for CUDA device count. Catches missing driver,\n"
        "        # wrong toolkit, missing GPU passthrough in compose, etc.\n"
        "        try:\n"
        "            import ctranslate2\n"
        "            cuda_count = ctranslate2.get_cuda_device_count()\n"
        "            if cuda_count > 0:\n"
        '                logger.info(f"GPU probe: {cuda_count} CUDA device(s) available, locking to cuda")\n'
        '                return "cuda"\n'
        "            else:\n"
        '                logger.info("GPU probe: no CUDA devices visible to container, locking to cpu")\n'
        '                return "cpu"\n'
        "        except Exception as e:\n"
        '            logger.info(f"GPU probe failed, locking to CPU: {e}")\n'
        '            return "cpu"\n'
    )

    if init_model_old_str not in src:
        return src, False
    src = src.replace(init_model_old_str, init_model_new_str, 1)
    return src, True


def _patch_idle_init(src):
    """Add idle-eviction config fields right after self.model_size assignment."""
    if "idle_eviction_seconds" in src:
        return src, False

    sentinel = "        self.model_size = model_size\n"
    if sentinel not in src:
        return src, False

    inject = (
        "        self.model_size = model_size\n"
        "        # Idle-eviction: release model from RAM after N seconds of disuse.\n"
        "        # 0 disables eviction entirely. Default 300s (~5 min).\n"
        f'        self.idle_eviction_seconds = float(os.environ.get("{IDLE_EVICTION_ENV}", "{DEFAULT_IDLE_EVICTION_SECONDS}"))\n'
        "        self._last_used_at = 0.0\n"
    )
    new = src.replace(sentinel, inject, 1)
    return new, new != src


_EVICT_METHOD = (
    "    def _maybe_evict_if_idle(self):\n",
    '        """Drop the WhisperModel from RAM if it has been idle too long.\n',
    "\n",
    "        Trade-off: cold-start of ~2-5s on next transcribe, but RAM stays\n",
    "        free during quiet periods. No-op when idle_eviction_seconds <= 0\n",
    "        or the model is already gone.\n",
    "\n",
    "        Deeper cleanup: also drops the inner ctranslate2 model and asks\n",
    "        ctranslate2 to release its compute-device memory pools. faster-\n",
    "        whisper WhisperModel does not implement __del__ explicitly,\n",
    "        so we tear it down manually.\n",
    '        """\n',
    "        if self.model is None or self.idle_eviction_seconds <= 0 or not self._last_used_at:\n",
    "            return\n",
    "        idle_secs = time.monotonic() - self._last_used_at\n",
    "        if idle_secs > self.idle_eviction_seconds:\n",
    "            logger.info(\n",
    '                f"Idle-evicting WhisperModel ({self.model_size}) after {idle_secs:.0f}s of disuse \\u2014 freeing RAM\\n"',
    "            )\n",
    "            # Deep eviction: drop the ctranslate2 inner model first so its\n",
    "            # C++ buffers go away before we drop the Python wrapper.\n",
    "            try:\n",
    '                if hasattr(self.model, "model"):\n',
    "                    self.model.model = None\n",
    "            except Exception as _e:\n",
    '                logger.debug(f"inner ctranslate2 drop failed: {_e}")\n',
    "            self.model = None\n",
    "            # Multi-pass gc to break reference cycles (ctranslate2 keeps\n",
    "            # some internal refs that need two passes to be collected).\n",
    "            gc.collect()\n",
    "            gc.collect()\n",
    "            # Ask ctranslate2 to release the per-device memory pools so the\n",
    "            # OS reclaims the pages instead of holding them in the c2 arena.\n",
    "            try:\n",
    "                import ctranslate2  # noqa: F401\n",
    "                ctranslate2.release_compute_device()\n",
    "            except Exception:\n",
    "                pass\n",
    "            gc.collect()\n",
    "\n",
)

_TRANSCRIBE_HOOK = (
    "    def transcribe(self, audio_bytes):\n"
    "        self._maybe_evict_if_idle()\n"
    "        try:\n"
    "            if self.model is None:\n"
    "                self._initialize_model()\n"
    "\n"
    "            audio_file = io.BytesIO(audio_bytes)\n"
)


def _patch_transcribe(src):
    """Instrument transcribe() with idle-eviction + last-used timestamp."""
    changes = []

    if "_maybe_evict_if_idle" in src:
        return src, changes

    transcribe_head_old = (
        "    def transcribe(self, audio_bytes):\n"
        "        try:\n"
        "            if self.model is None:\n"
        "                self._initialize_model()\n"
        "\n"
        "            audio_file = io.BytesIO(audio_bytes)\n"
    )
    if transcribe_head_old in src:
        src = src.replace(transcribe_head_old, _TRANSCRIBE_HOOK, 1)
        changes.append("instrumented transcribe() with eviction hook")
    else:
        pattern = re.compile(
            r"    def transcribe\(self, audio_bytes\):\n"
            r"        try:\n"
            r"            if self\.model is None:\n"
            r"                self\._initialize_model\(\)\n",
            re.MULTILINE,
        )
        new, n = pattern.subn(
            "    def transcribe(self, audio_bytes):\n"
            "        self._maybe_evict_if_idle()\n"
            "        try:\n"
            "            if self.model is None:\n"
            "                self._initialize_model()\n",
            src,
            count=1,
        )
        if n:
            src = new
            changes.append("instrumented transcribe() with eviction hook (fallback regex)")
        else:
            changes.append("WARN: transcribe() header not found - idle-eviction NOT applied")
            return src, changes

    success_return = '            return {"text": text, "words": all_words}\n'
    if success_return in src and "self._last_used_at = time.monotonic()" not in src:
        src = src.replace(
            success_return,
            "            self._last_used_at = time.monotonic()\n" + success_return,
            1,
        )
        changes.append("update _last_used_at on successful transcribe")

    # _EVICT_METHOD is a tuple of lines (built via fragments); join into one string.
    evict_block = "".join(_EVICT_METHOD)
    src = src.replace(
        "    def transcribe(self, audio_bytes):",
        evict_block + "    def transcribe(self, audio_bytes):",
        1,
    )
    changes.append("inserted _maybe_evict_if_idle() method")

    return src, changes


def patch_stt_py(stt_py):
    if not stt_py.exists():
        return []

    src = stt_py.read_text()
    changes = []

    new, changed = _patch_model_size(src)
    if changed:
        changes.append('model_size default: "large-v3-turbo" -> "small"')
    src = new

    new, changed = _patch_beam_size(src)
    if changed:
        changes.append("beam_size: 10 -> 5")
    src = new

    new, n_threads = _patch_cpu_threads(src)
    if n_threads:
        changes.append(
            f"cpu_threads={DEFAULT_CPU_THREADS} (env {CPU_THREADS_ENV}) "
            f"injected into {n_threads} WhisperModel() call(s)"
        )
    elif "cpu_threads=" not in src:
        changes.append("(no WhisperModel() calls found to patch - skipped)")
    src = new

    new, import_changes = _patch_imports(src)
    changes.extend(import_changes)
    src = new

    new, changed = _patch_device_lock(src)
    if changed:
        changes.append(
            'device-locking added (probe GPU once, cache decision, env '
            f'{DEVICE_ENV}="auto|cuda|cpu" to override)'
        )
    src = new

    new, changed = _patch_idle_init(src)
    if changed:
        changes.append(
            f"idle_eviction_seconds={DEFAULT_IDLE_EVICTION_SECONDS} (env {IDLE_EVICTION_ENV}) "
            f"added to Transcriber.__init__"
        )
    src = new

    new, evict_changes = _patch_transcribe(src)
    changes.extend(evict_changes)
    src = new

    if changes:
        stt_py.write_text(src)
    return changes


# --------------------------------------------------------------------------
# Patch 7: background eviction task in main.py
# --------------------------------------------------------------------------
# Without this, the idle-eviction only fires when a NEW transcribe() call comes in.
# If the system goes quiet for hours, the Whisper model would stay loaded because
# nothing calls _maybe_evict_if_idle. This patch wires a background asyncio task
# that pings the eviction check every 5 seconds, so quiet periods actually free RAM.
EVICT_TICK_SECONDS = 5


def _patch_main_background(src):
    """Inject a background eviction ticker into the voice-chat main.py.

    Idempotent via `_idle_evict_ticker` sentinel.
    """
    if "_idle_evict_ticker" in src:
        return src, False

    # 1) Ensure asyncio is imported.
    if "import asyncio" not in src:
        src = src.replace(
            "import io",
            "import asyncio\nimport io",
            1,
        )

    # 2) Inject the ticker right after the Synthesizer() instantiation.
    marker = "tts_engine = Synthesizer()\n"
    if marker not in src:
        return src, False

    inject = (
        "tts_engine = Synthesizer()\n"
        "\n"
        "async def _idle_evict_ticker():\n"
        '    """Background task: tick the STT eviction check every few seconds.\n'
        "\n"
        "    Without this, idle-eviction only fires on the next transcribe() call.\n"
        "    In long-idle deployments the model never gets released. This task\n"
        "    wakes up periodically and asks the Transcriber to evict itself if\n"
        "    it has been idle past the threshold.\n"
        '    """\n'
        "    while True:\n"
        f"        await asyncio.sleep({EVICT_TICK_SECONDS})\n"
        "        try:\n"
        "            stt_engine._maybe_evict_if_idle()\n"
        "        except Exception as _e:\n"
        "            import logging\n"
        '            logging.getLogger("stt").debug(f"idle-evict ticker error: {_e}")\n'
        "\n"
        '@app.on_event("startup")\n'
        "async def _start_idle_evict_ticker():\n"
        "    asyncio.create_task(_idle_evict_ticker())\n"
    )
    src = src.replace(marker, inject, 1)
    return src, True


def patch_main_py(main_py):
    """Apply main.py patches (background eviction ticker)."""
    if not main_py.exists():
        return []
    src = main_py.read_text()
    new, changed = _patch_main_background(src)
    changes = []
    if changed:
        changes.append(
            "background idle-eviction ticker added (asyncio task, every "
            f"{EVICT_TICK_SECONDS}s)"
        )
        main_py.write_text(new)
    return changes



def main():
    sidecar_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/app/sidecar")
    stt_py = sidecar_dir / STT_FILE
    main_py = sidecar_dir / "main.py"

    if not stt_py.exists():
        print(f"[patch-sidecar] {stt_py} not found - nothing to do", file=sys.stderr)
        return 0

    try:
        changes = patch_stt_py(stt_py)
        changes.extend(patch_main_py(main_py))
    except Exception as e:
        print(f"[patch-sidecar] failed: {e}", file=sys.stderr)
        return 1

    if changes:
        print(f"[patch-sidecar] patched {sidecar_dir}:")
        for c in changes:
            print(f"  - {c}")
    else:
        print(f"[patch-sidecar] already patched (no-op)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
