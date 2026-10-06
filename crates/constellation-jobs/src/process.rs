//! 파이프라인 프로세스 신호. 자식 프로세스(이름 짓기의 codex CLI 등)까지 함께
//! 끝내도록 파이프라인을 자기 프로세스 그룹에서 띄우고 그룹에 신호를 보낸다.

use std::process::Command;
use std::time::{Duration, Instant};

#[cfg(unix)]
pub fn own_group(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
}

#[cfg(not(unix))]
pub fn own_group(_cmd: &mut Command) {}

#[cfg(unix)]
fn signal(pid: u32, sig: libc::c_int) {
    // 음수 pid = 프로세스 그룹. 그룹이 없으면(이미 끝남) 프로세스 하나에 보낸다.
    // SAFETY: kill은 pid와 신호 번호만 받는다.
    unsafe {
        if libc::kill(-(pid as libc::pid_t), sig) != 0 {
            libc::kill(pid as libc::pid_t, sig);
        }
    }
}

/// 정리할 기회를 주는 종료 요청(SIGTERM). Python은 SystemExit으로 받아 연결을 닫는다.
#[cfg(unix)]
pub fn terminate(pid: u32) {
    signal(pid, libc::SIGTERM);
}

#[cfg(unix)]
pub fn kill(pid: u32) {
    signal(pid, libc::SIGKILL);
}

#[cfg(unix)]
pub fn alive(pid: u32) -> bool {
    // SAFETY: 신호 0은 존재 확인만 한다.
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

#[cfg(not(unix))]
pub fn terminate(pid: u32) {
    kill(pid)
}

#[cfg(not(unix))]
pub fn kill(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(not(unix))]
pub fn alive(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}")])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

/// 끝날 때까지 기다린다. 시간 안에 끝나면 true.
///
/// 자식이 아닌 프로세스(지난 실행에서 남은 것)도 기다릴 수 있도록 waitpid 대신
/// 존재 여부를 본다. 이 실행기의 자식이면 `Child::wait`가 따로 거둔다.
pub fn wait_exit(pid: u32, timeout: Duration) -> bool {
    let start = Instant::now();
    while alive(pid) && !zombie(pid) {
        if start.elapsed() > timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    true
}

/// 끝났지만 아직 거두지 않은 자식. `kill(pid, 0)`은 이 상태에서도 성공한다.
fn zombie(pid: u32) -> bool {
    Command::new("ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim_start().starts_with('Z'))
        .unwrap_or(false)
}

/// 지난 실행이 남긴 pid가 아직 파이프라인인지. pid는 재사용되므로 명령줄을 확인한다.
pub fn is_pipeline(pid: u32) -> bool {
    if !alive(pid) {
        return false;
    }
    Command::new("ps")
        .args(["-o", "command=", "-p", &pid.to_string()])
        .output()
        .map(|o| {
            let cmd = String::from_utf8_lossy(&o.stdout);
            cmd.contains("build") && cmd.contains("--events")
        })
        .unwrap_or(false)
}
