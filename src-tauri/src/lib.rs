//! Constellation 데스크톱 앱. 질의는 `constellation-core`가, 창·설정·파일 대화상자는
//! 여기서 맡는다.

mod commands;
mod settings;

use std::path::PathBuf;

use tauri::{Manager, RunEvent};

use commands::AppState;

/// 플러그인·상태·명령을 붙인다. 앱과 테스트(MockRuntime)가 같이 쓴다.
/// `db_path`가 없으면 설정 파일 → 앱 데이터 폴더 순으로 정한다. `pipeline`이 없으면
/// 설정 파일 → 빌드한 저장소의 `.venv` 순이다.
pub fn configure<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    db_path: Option<PathBuf>,
    pipeline: Option<PathBuf>,
) -> tauri::Builder<R> {
    let builder = builder.plugin(tauri_plugin_dialog::init());
    // 경로를 미리 알면(테스트) 빌드 시점에 상태를 둔다. setup은 run()에서야 돈다.
    let builder = match db_path {
        Some(path) => builder.manage(AppState::new(
            path,
            pipeline.clone().unwrap_or_else(settings::default_pipeline),
        )),
        None => builder,
    };
    builder
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            if app.try_state::<AppState>().is_none() {
                let handle = app.handle();
                let saved = settings::load(handle);
                let db_path = saved
                    .db_path
                    .unwrap_or_else(|| settings::default_db_path(handle));
                let pipeline = pipeline
                    .clone()
                    .or(saved.pipeline_path)
                    .unwrap_or_else(settings::default_pipeline);
                log::info!("db: {}, pipeline: {}", db_path.display(), pipeline.display());
                app.manage(AppState::new(db_path, pipeline));
            }
            // 지난 실행에서 끝나지 않은 작업을 정리한다. 남은 프로세스를 기다릴 수 있어
            // 창을 막지 않도록 스레드에서 한다.
            let runner = app.state::<AppState>().runner();
            std::thread::spawn(move || runner.recover());
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
            commands::edges,
            commands::estimate_map,
            commands::search_topics,
            commands::create_map,
            commands::jobs,
            commands::job,
            commands::job_log,
            commands::cancel_job,
            commands::search_papers,
            commands::add_papers,
            commands::remove_papers,
        ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure(tauri::Builder::default(), None, None)
        .build(tauri::generate_context!())
        .expect("Tauri 앱을 시작하지 못했다")
        .run(|app, event| {
            // 앱이 끝나면 실행 중인 작업을 취소하고 만들다 만 코퍼스를 지운다.
            if let RunEvent::Exit = event {
                app.state::<AppState>().runner().shutdown();
            }
        });
}
