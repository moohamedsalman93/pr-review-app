import os
import shutil
import subprocess
import sys

# Paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
# Assuming directory structure:
# /root
#   /backend
#   /frontend/src-tauri
FRONTEND_TAURI_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "..", "frontend", "src-tauri"))
DIST_DIR = os.path.join(BACKEND_DIR, "dist")
EXE_NAME = "PR-Review-Agent.exe"
# Target name required by Tauri sidecar configuration
SIDECAR_NAME = "PR-Review-Agent-x86_64-pc-windows-msvc.exe"

def build_and_move():
    print(f"--- Starting Backend Build ---")
    print(f"Backend Directory: {BACKEND_DIR}")
    
    # 1. Run PyInstaller via Poetry
    cmd = ["poetry", "run", "pyinstaller", "PR-Review-App.spec", "--clean", "--noconfirm"]
    print(f"Running: {' '.join(cmd)}")
    try:
        subprocess.check_call(cmd, cwd=BACKEND_DIR)
    except subprocess.CalledProcessError as e:
        print(f"Error during PyInstaller build: {e}")
        sys.exit(1)

    # 2. Check Artifact
    source_path = os.path.join(DIST_DIR, EXE_NAME)
    if not os.path.exists(source_path):
        print(f"Error: Build artifact not found at {source_path}")
        sys.exit(1)

    # 3. Move/Copy to Tauri Sidecar Location
    dest_path = os.path.join(FRONTEND_TAURI_DIR, SIDECAR_NAME)
    print(f"Copying artifact to: {dest_path}")
    
    try:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        shutil.copy2(source_path, dest_path)
        print("--- Backend Build & Setup Complete ---")
    except Exception as e:
        print(f"Error moving file: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build_and_move()
