use tauri::AppHandle;
use tauri::plugin::PermissionState;
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust on Mobile!", name)
}

/// Dispatches a native mobile notification with system sound and vibration
#[tauri::command]
async fn show_mobile_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    // Check & request runtime notification permissions (required for Android 13+ / iOS)
    let state = app.notification().permission_state().map_err(|e| e.to_string())?;
    if state != PermissionState::Granted {
        let _ = app.notification().request_permission().map_err(|e| e.to_string())?;
    }

    // Build and display the notification through native channels
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            show_mobile_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri mobile application");
}