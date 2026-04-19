import os
import sys

# Tiktoken cache fix for PyInstaller - MUST BE DONE BEFORE ANY OTHER IMPORTS
if getattr(sys, 'frozen', False):
    # Set the cache dir
    os.environ["TIKTOKEN_CACHE_DIR"] = os.path.join(sys._MEIPASS, "tiktoken_cache")

import uvicorn


def _load_bundled_dotenv():
    """PyInstaller one-file extracts data to sys._MEIPASS; load bundled .env before chdir."""
    if not getattr(sys, "frozen", False):
        return
    path = os.path.join(sys._MEIPASS, ".env")
    if not os.path.isfile(path):
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(path, override=False)
    except OSError:
        pass


if __name__ == "__main__":
    _load_bundled_dotenv()

    # Get the directory where the launcher is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Add the base directory to sys.path so 'app' and 'pr_agent' can be found
    sys.path.insert(0, base_dir)
    
    # If app data directory is set (from Tauri), change working directory to it
    # This ensures relative paths work correctly
    app_data_dir = os.environ.get("PR_REVIEW_APP_DATA_DIR")
    if app_data_dir and os.path.exists(app_data_dir):
        os.chdir(app_data_dir)

    # Import app directly
    try:
        from app.main import app
    except ImportError as e:
        print(f"Error importing app: {e}")
        app = "app.main:app"
    
    # Get a fixed port for Tauri integration
    port = 47685
    
    print(f"Starting PR Review Backend Sidecar on port {port}...")
    
    # Start FastAPI server
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=port, 
        log_level="info", 
        reload=False
    )
