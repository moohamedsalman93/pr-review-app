"""
In-memory ring buffer of recent log records for display in About / diagnostics.
"""
import logging
from collections import deque
from datetime import datetime

# Keep last 500 log entries
MAX_LOG_ENTRIES = 500
_log_buffer: deque = deque(maxlen=MAX_LOG_ENTRIES)


class BufferHandler(logging.Handler):
    """Logging handler that appends records to the in-memory buffer."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            _log_buffer.append({
                "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                "level": record.levelname.lower(),
                "message": msg,
                "logger": record.name,
            })
        except Exception:
            self.handleError(record)


def get_recent_logs(limit: int = 200) -> list:
    """Return the most recent log entries (newest last)."""
    items = list(_log_buffer)
    return items[-limit:] if limit else items


def install_buffer_handler() -> None:
    """Attach the buffer handler to the root logger so all loggers feed into it."""
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, BufferHandler):
            return
    handler = BufferHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)
