import logging
import os
from collections import deque
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Keep last 500 log entries in memory
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


def get_log_file_path() -> str:
    """Determine the path for the log file."""
    app_data_dir = os.environ.get("PR_REVIEW_APP_DATA_DIR")
    if app_data_dir:
        os.makedirs(app_data_dir, exist_ok=True)
        return os.path.join(app_data_dir, "backend.log")
    return "backend.log"


def install_buffer_handler() -> None:
    """Attach the buffer handler and file handler to the root logger."""
    root = logging.getLogger()
    
    # Check if handlers are already installed
    has_buffer = False
    has_file = False
    for h in root.handlers:
        if isinstance(h, BufferHandler):
            has_buffer = True
        if isinstance(h, RotatingFileHandler):
            has_file = True
    
    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    if not has_buffer:
        handler = BufferHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        root.addHandler(handler)
    
    # Ensure root logger level is at least INFO
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)
    
    if not has_file:
        log_file = get_log_file_path()
        try:
            file_handler = RotatingFileHandler(
                log_file, 
                maxBytes=5 * 1024 * 1024,  # 5MB
                backupCount=3,
                encoding="utf-8"
            )
            file_handler.setFormatter(formatter)
            root.addHandler(file_handler)
            logging.info(f"Persistent logging initialized at: {log_file}")
        except Exception as e:
            logging.error(f"Failed to initialize file logging: {e}")

