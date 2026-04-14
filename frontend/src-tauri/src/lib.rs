use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_shell::ShellExt;

const BACKEND_PORT: u16 = 47685;

fn is_backend_running() -> bool {
    std::net::TcpStream::connect(("127.0.0.1", BACKEND_PORT)).is_ok()
}

/// Kill backend sidecar processes before respawning.
/// On Windows we terminate the full process tree because onefile bundles can spawn children.
fn kill_backend_processes() {
    #[cfg(target_os = "windows")]
    {
        use std::process::{Command, Stdio};
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "PR-Review-Agent.exe", "/T"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::{Command, Stdio};
        let _ = Command::new("pkill")
            .args(["-f", "PR-Review-Agent"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
                kill_backend_processes();
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            // Get app data directory and pass it to the sidecar
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
                // Fallback to current directory if app data dir is unavailable
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });
            
            // Ensure the app data directory exists
            if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
                eprintln!("Warning: Could not create app data directory: {}", e);
            }

            // Spawn the Python backend (skip if TAURI_NO_SIDECAR is set)
            if std::env::var("TAURI_NO_SIDECAR").is_ok() {
                println!("TAURI_NO_SIDECAR is set — skipping sidecar, expecting manual backend on port 47685");
            } else {
                let app_data_dir_str = app_data_dir.to_string_lossy().to_string();
                tauri::async_runtime::spawn(async move {
                    if is_backend_running() {
                        println!(
                            "Backend already running on port {}. Killing stale processes before respawn...",
                            BACKEND_PORT
                        );
                        kill_backend_processes();
                        std::thread::sleep(std::time::Duration::from_millis(150));
                    }

                    let sidecar_result = handle
                        .shell()
                        .sidecar("PR-Review-Agent")
                        .map(|cmd| {
                            cmd.args(["--sidecar"])
                                .env("PR_REVIEW_APP_DATA_DIR", &app_data_dir_str)
                        });

                    match sidecar_result {
                        Ok(sidecar_command) => {
                            match sidecar_command.spawn() {
                                Ok((mut rx, mut _child)) => {
                                    use tauri_plugin_shell::process::CommandEvent;
                                    while let Some(event) = rx.recv().await {
                                        match event {
                                            CommandEvent::Stdout(line) => {
                                                println!("Backend: {}", String::from_utf8_lossy(&line));
                                            }
                                            CommandEvent::Stderr(line) => {
                                                eprintln!("Backend Error: {}", String::from_utf8_lossy(&line));
                                            }
                                            CommandEvent::Error(err) => {
                                                eprintln!("Backend Process Error: {}", err);
                                            }
                                            CommandEvent::Terminated(payload) => {
                                                eprintln!("Backend Terminated: {:?}", payload);
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("Sidecar not spawned (manual backend mode): {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Sidecar binary not found (manual backend mode): {}", e);
                        }
                    }
                });
            }

            let open_item = MenuItem::with_id(app, "open", "Open App", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let window = app.get_webview_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "quit" => {
                        kill_backend_processes();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
