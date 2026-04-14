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
APP_BASENAME = "PR-Review-Agent"


def get_target_triple():
    explicit_target = os.environ.get("TAURI_TARGET") or os.environ.get("RUST_TARGET")
    if explicit_target:
        return explicit_target

    system_name = sys.platform
    machine = os.uname().machine if hasattr(os, "uname") else ""

    if system_name.startswith("win"):
        return "x86_64-pc-windows-msvc"
    if system_name == "darwin":
        if machine in ("arm64", "aarch64"):
            return "aarch64-apple-darwin"
        if machine in ("x86_64", "amd64"):
            return "x86_64-apple-darwin"

    raise RuntimeError(
        f"Unsupported platform for sidecar copy: platform={system_name}, machine={machine}. "
        "Set TAURI_TARGET explicitly."
    )


def get_source_binary_name(target_triple):
    if "windows" in target_triple:
        return f"{APP_BASENAME}.exe"
    return APP_BASENAME


def get_sidecar_name(target_triple):
    if "windows" in target_triple:
        return f"{APP_BASENAME}-{target_triple}.exe"
    return f"{APP_BASENAME}-{target_triple}"

def build_and_move():
    print(f"--- Starting Backend Build ---")
    print(f"Backend Directory: {BACKEND_DIR}")
    target_triple = get_target_triple()
    print(f"Tauri target triple: {target_triple}")
    
    # 1. Run PyInstaller via Poetry
    cmd = ["poetry", "run", "pyinstaller", "PR-Review-App.spec", "--clean", "--noconfirm"]
    print(f"Running: {' '.join(cmd)}")
    try:
        subprocess.check_call(cmd, cwd=BACKEND_DIR)
    except subprocess.CalledProcessError as e:
        print(f"Error during PyInstaller build: {e}")
        sys.exit(1)

    # 2. Check Artifact
    source_binary_name = get_source_binary_name(target_triple)
    source_path = os.path.join(DIST_DIR, source_binary_name)
    if not os.path.exists(source_path):
        print(f"Error: Build artifact not found at {source_path}")
        sys.exit(1)

    # 3. Move/Copy to Tauri Sidecar Location
    sidecar_name = get_sidecar_name(target_triple)
    print(f"Resolved sidecar name: {sidecar_name}")
    dest_path = os.path.join(FRONTEND_TAURI_DIR, sidecar_name)
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
