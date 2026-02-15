use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            // Spawn the Python backend (skip if TAURI_NO_SIDECAR is set)
            if std::env::var("TAURI_NO_SIDECAR").is_ok() {
                println!("TAURI_NO_SIDECAR is set — skipping sidecar, expecting manual backend on port 47685");
            } else {
                tauri::async_runtime::spawn(async move {
                    let sidecar_result = handle
                        .shell()
                        .sidecar("PR-Review-Agent")
                        .map(|cmd| cmd.args(["--sidecar"]));

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
