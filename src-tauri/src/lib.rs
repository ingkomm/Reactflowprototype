#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // fs MUST be registered before persisted-scope.
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_persisted_scope::init())
    .plugin(tauri_plugin_dialog::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
