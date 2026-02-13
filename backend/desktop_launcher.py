import os
import sys

# Tiktoken cache fix for PyInstaller - MUST BE DONE BEFORE ANY OTHER IMPORTS
if getattr(sys, 'frozen', False):
    # Set the cache dir
    os.environ["TIKTOKEN_CACHE_DIR"] = os.path.join(sys._MEIPASS, "tiktoken_cache")

import uvicorn

if __name__ == "__main__":
    # Get the directory where the launcher is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Add the base directory to sys.path so 'app' and 'pr_agent' can be found
    sys.path.insert(0, base_dir)

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
