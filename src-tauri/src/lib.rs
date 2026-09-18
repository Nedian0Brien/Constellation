//! Constellation 데스크톱 앱. 질의는 `constellation-core`가, 창·설정·파일 대화상자는
//! 여기서 맡는다.

mod commands;
mod settings;

use std::sync::Mutex;

use tauri::Manager;

use commands::AppState;

/// 플러그인·상태·명령을 붙인다. 앱과 테스트(MockRuntime)가 같이 쓴다.
/// `db_path`가 없으면 설정 파일 → 앱 데이터 폴더 순으로 정한다.
pub fn configure<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    db_path: Option<std::path::PathBuf>,
) -> tauri::Builder<R> {
    let builder = builder.plugin(tauri_plugin_dialog::init());
    // 경로를 미리 알면(테스트) 빌드 시점에 상태를 둔다. setup은 run()에서야 돈다.
    let builder = match db_path {
        Some(path) => builder.manage(AppState {
            db_path: Mutex::new(path),
        }),
        None => builder,
    };
    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            if app.try_state::<AppState>().is_none() {
                let handle = app.handle();
                let db_path = settings::load(handle)
                    .db_path
                    .unwrap_or_else(|| settings::default_db_path(handle));
                log::info!("db: {}", db_path.display());
                app.manage(AppState {
                    db_path: Mutex::new(db_path),
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::runs,
            commands::map,
            commands::clusters,
            commands::cluster_detail,
            commands::tree,
            commands::flow,
            commands::flow_papers,
            commands::lineage,
            commands::works,
            commands::matches,
            commands::work,
            commands::citations,
            commands::db_status,
            commands::choose_database,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure(tauri::Builder::default(), None)
        .run(tauri::generate_context!())
        .expect("Tauri 앱을 시작하지 못했다");
}
