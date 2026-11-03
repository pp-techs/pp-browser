use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::{path::BaseDirectory, AppHandle, Manager, Url};
use tauri_plugin_shell::ShellExt;

/// Mirrors `DaemonInfo` written by the Node daemon at `~/.ppb/daemon.json`.
#[derive(Deserialize)]
struct DaemonInfo {
  host: String,
  port: u16,
}

/// pid of the spawned daemon sidecar, set once in `setup` and read on window close.
/// `None` once shut down, so a repeated close event is a no-op.
struct DaemonPid(Mutex<Option<u32>>);

/// Data lives in `$PPB_HOME` (default `~/.ppb`), matching `packages/core/src/paths.ts`.
fn ppb_home() -> PathBuf {
  if let Ok(custom) = std::env::var("PPB_HOME") {
    return PathBuf::from(custom);
  }
  let home = std::env::var("HOME")
    .or_else(|_| std::env::var("USERPROFILE"))
    .expect("could not resolve home directory");
  PathBuf::from(home).join(".ppb")
}

fn read_daemon_info() -> Option<DaemonInfo> {
  let raw = fs::read_to_string(ppb_home().join("daemon.json")).ok()?;
  serde_json::from_str(&raw).ok()
}

fn read_token() -> Option<String> {
  fs::read_to_string(ppb_home().join("token"))
    .ok()
    .map(|s| s.trim().to_string())
}

/// Sends SIGTERM so the daemon runs its graceful shutdown (closes the HTTP server,
/// removes `daemon.json`) instead of being hard-killed mid-write. `CommandChild::kill()`
/// only sends SIGKILL, so we signal the pid directly instead.
#[cfg(unix)]
fn terminate_pid(pid: u32) {
  let _ = std::process::Command::new("kill")
    .args(["-TERM", &pid.to_string()])
    .status();
}

#[cfg(windows)]
fn terminate_pid(pid: u32) {
  let _ = std::process::Command::new("taskkill")
    .args(["/PID", &pid.to_string()])
    .status();
}

async fn wait_for_daemon_ready() -> Option<DaemonInfo> {
  let deadline = std::time::Instant::now() + Duration::from_secs(30);
  while std::time::Instant::now() < deadline {
    if let (Some(info), Some(_token)) = (read_daemon_info(), read_token()) {
      let addr = format!("{}:{}", info.host, info.port);
      // `daemon.json` is written once the HTTP server is already listening, but
      // probe the socket too in case this read raced a slow machine's fsync.
      if std::net::TcpStream::connect(&addr).is_ok() {
        return Some(info);
      }
    }
    tokio::time::sleep(Duration::from_millis(200)).await;
  }
  None
}

fn spawn_daemon(app: &AppHandle) -> anyhow::Result<u32> {
  let main_mjs = app
    .path()
    .resolve("resources/ppb/dist/main.mjs", BaseDirectory::Resource)?;
  let (mut rx, child) = app
    .shell()
    .sidecar("bun")?
    .args([main_mjs.to_string_lossy().as_ref(), "daemon", "run"])
    .spawn()?;
  let pid = child.pid();
  // Drop the handle without killing: `kill_on_drop` defaults to false, so the sidecar
  // keeps running detached. We track its pid ourselves and SIGTERM it on window close.
  drop(child);
  // `daemon run` logs to its own stdout/stderr (unlike `daemon start`, which writes
  // ~/.ppb/daemon.log); forward it to the same file so crashes are diagnosable.
  let log_path = ppb_home().join("daemon.log");
  tauri::async_runtime::spawn(async move {
    use tauri_plugin_shell::process::CommandEvent;
    while let Some(event) = rx.recv().await {
      let line = match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
          Some(String::from_utf8_lossy(&bytes).into_owned())
        }
        CommandEvent::Error(message) => Some(message),
        CommandEvent::Terminated(_) | _ => None,
      };
      if let Some(line) = line {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
          .create(true)
          .append(true)
          .open(&log_path)
        {
          let _ = writeln!(file, "{line}");
        }
      }
    }
  });
  Ok(pid)
}

fn shutdown_daemon(app: &AppHandle) {
  let state = app.state::<DaemonPid>();
  let mut guard = state.0.lock().unwrap();
  if let Some(pid) = guard.take() {
    terminate_pid(pid);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(DaemonPid(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let handle = app.handle().clone();
      let pid = spawn_daemon(&handle)?;
      *app.state::<DaemonPid>().0.lock().unwrap() = Some(pid);

      let window = handle
        .get_webview_window("main")
        .expect("main window must exist");

      tauri::async_runtime::spawn(async move {
        match wait_for_daemon_ready().await {
          Some(info) => {
            let token = read_token().unwrap_or_default();
            let url = format!("http://{}:{}/#token={}", info.host, info.port, token);
            if let Ok(parsed) = Url::parse(&url) {
              let _ = window.navigate(parsed);
            }
          }
          None => {
            let _ = window.eval(
              "document.body.textContent = 'ppb failed to start. Check ~/.ppb/daemon.log.';",
            );
          }
        }
      });

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        shutdown_daemon(window.app_handle());
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        shutdown_daemon(app_handle);
      }
    });
}
