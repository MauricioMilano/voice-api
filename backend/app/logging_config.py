"""Centralized logging configuration.

Honors env vars:
  LOG_LEVEL   = DEBUG | INFO | WARNING | ERROR   (default: INFO)
  LOG_FORMAT  = json | text                       (default: text)
  LOG_FILE    = path to write logs to             (default: stdout only)

In addition to the root logger, every module can `log = logging.getLogger(__name__)`
and use the standard logging API.
"""
from __future__ import annotations
import json
import logging
import os
import sys
import time
from logging.handlers import RotatingFileHandler
from typing import Any


_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "WARN": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


class _JsonFormatter(logging.Formatter):
    """Structured JSON line per log record — easy to grep / ship to Loki / etc."""

    # Standard LogRecord attributes we don't want to dump as "extra"
    _STD = {
        "args", "asctime", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "module", "msecs",
        "message", "msg", "name", "pathname", "process", "processName",
        "relativeCreated", "stack_info", "thread", "threadName", "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                 + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Promote any extra= fields
        for k, v in record.__dict__.items():
            if k not in self._STD and not k.startswith("_"):
                try:
                    json.dumps(v)
                    payload[k] = v
                except (TypeError, ValueError):
                    payload[k] = repr(v)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _TextFormatter(logging.Formatter):
    """Human-friendly single-line format."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s.%(msecs)03d %(levelname)-5s [%(name)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        # Append any extra= fields inline as key=value
        extras = []
        for k, v in record.__dict__.items():
            if k in {
                "args", "asctime", "created", "exc_info", "exc_text", "filename",
                "funcName", "levelname", "levelno", "lineno", "module", "msecs",
                "message", "msg", "name", "pathname", "process", "processName",
                "relativeCreated", "stack_info", "thread", "threadName", "taskName",
            } or k.startswith("_"):
                continue
            extras.append(f"{k}={v!r}")
        if extras:
            base += "  " + " ".join(extras)
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


_configured = False


def configure_logging(
    level: str | None = None,
    fmt: str | None = None,
    log_file: str | None = None,
    silence_uvicorn: bool = True,
) -> None:
    """Configure the root logger + uvicorn loggers. Idempotent."""
    global _configured
    if _configured:
        return
    _configured = True

    lvl = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    fmt_name = (fmt or os.getenv("LOG_FORMAT", "text")).lower()
    log_file = log_file or os.getenv("LOG_FILE")

    numeric = _LEVELS.get(lvl, logging.INFO)
    handler_formatter: logging.Formatter = _JsonFormatter() if fmt_name == "json" else _TextFormatter()

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(numeric)

    # Stream handler — always stdout so `docker logs` works
    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(handler_formatter)
    root.addHandler(stream)

    # Optional file handler with rotation
    if log_file:
        try:
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=20 * 1024 * 1024,   # 20 MB
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setFormatter(handler_formatter)
            root.addHandler(file_handler)
        except OSError as e:
            root.warning("could not open log file %s: %s", log_file, e)

    if silence_uvicorn:
        # Make uvicorn/access logs use the same handlers
        for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
            lg = logging.getLogger(name)
            lg.handlers.clear()
            lg.propagate = True
            lg.setLevel(numeric)

    logging.getLogger(__name__).info(
        "logging configured",
        extra={"level": lvl, "format": fmt_name, "file": log_file or "-"},
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)