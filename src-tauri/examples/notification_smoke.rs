//! Windows integration check using disposable WebView2 profiles. Run via
//! `node scripts/test-notifications.mjs` from tauri/ (shows one test notification).
use std::{path::PathBuf, time::Duration};
use tabbar_core as model;
use tauri::{AppHandle, Manager, Webview, WebviewUrl};
use windows::Win32::{
    Foundation::{LPARAM, WPARAM},
    UI::WindowsAndMessaging::{FindWindowW, GetDlgItem, GetWindowThreadProcessId, PostMessageW},
};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn report(_: &AppHandle, error: String) {
    eprintln!("{error}");
}
#[path = "../src/notifications.rs"]
mod notifications;

async fn eval(v: &Webview, script: &str) -> Result<serde_json::Value> {
    let (send, recv) = tokio::sync::oneshot::channel();
    let send = std::sync::Mutex::new(Some(send));
    v.eval_with_callback(script, move |value| {
        if let Some(send) = send.lock().unwrap().take() {
            let _ = send.send(value);
        }
    })
    .map_err(err)?;
    let value = tokio::time::timeout(Duration::from_secs(10), recv)
        .await
        .map_err(err)?
        .map_err(err)?;
    serde_json::from_str(&value).map_err(err)
}
async fn until(v: &Webview, script: &str, expected: &str) -> Result<()> {
    let mut last = serde_json::Value::Null;
    for _ in 0..100 {
        last = eval(v, script).await?;
        if last == expected {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(format!(
        "Timed out waiting for {script} == {expected}; last value: {last}"
    ))
}
fn check(name: &str) {
    println!("PASS {name}");
}

async fn answer(v: &Webview, button: usize, expected: &str) -> Result<()> {
    v.eval("window.answer='waiting';Notification.requestPermission().then(v=>window.answer=v)")
        .map_err(err)?;
    let mut clicked = false;
    for _ in 0..100 {
        // Restrict automation to the dialog owned by this disposable test app.
        unsafe {
            if let Ok(hwnd) = FindWindowW(None, windows::core::w!("Tabbar — Website notifications"))
            {
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid == std::process::id() {
                    let button_window = GetDlgItem(Some(hwnd), button as i32).map_err(err)?;
                    PostMessageW(
                        Some(button_window),
                        0x00F5, /* BM_CLICK */
                        WPARAM(0),
                        LPARAM(0),
                    )
                    .map_err(err)?;
                    clicked = true;
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !clicked {
        return Err("Notification permission dialog did not appear".into());
    }
    until(v, "window.answer", expected).await
}

async fn run(app: &AppHandle, root: PathBuf, base: String, persisted: bool) -> Result<()> {
    let v = app
        .get_webview("notification-smoke")
        .ok_or("Missing fixture")?;
    until(&v, "document.readyState", "complete").await?;
    if persisted {
        until(&v, "Notification.permission", "granted").await?;
        check("permission survives an application restart");
        return Ok(());
    }
    until(&v, "Notification.permission", "default").await?;
    // WebView2 declines this request on dismissal, but must leave the saved
    // permission unset so the website can request it again.
    answer(&v, 2, "denied").await?;
    until(&v, "Notification.permission", "default").await?;
    check("cancel leaves notification permission unset");
    answer(&v, 7, "denied").await?;
    v.reload().map_err(err)?;
    until(&v, "Notification.permission", "denied").await?;
    check("block is remembered after reload");

    notifications::set_permission(&v, &base, "ask").await?;
    until(&v, "Notification.permission", "default").await?;
    answer(&v, 6, "granted").await?;
    check("ask resets the choice and allow grants permission");
    v.eval("window.shown='waiting';window.closedNotice='waiting';window.notice=new Notification('Tabbar notification test',{body:'Website notifications are working.',silent:true});notice.onshow=()=>window.shown='yes';notice.onclose=()=>window.closedNotice='yes'").map_err(err)?;
    until(&v, "window.shown", "yes").await?;
    check("WebView2 displays the native notification and delivers onshow");
    v.eval("notice.close()").map_err(err)?;
    until(&v, "window.closedNotice", "yes").await?;
    check("closing the notification delivers onclose");

    let shared = tauri::WebviewWindowBuilder::new(
        app,
        "notification-shared",
        WebviewUrl::External(base.parse().map_err(err)?),
    )
    .data_directory(root.join("shared"))
    .visible(false)
    .build()
    .map_err(err)?;
    until(
        &shared.as_ref().clone(),
        "Notification.permission",
        "granted",
    )
    .await?;
    check("permission is shared by tabs in the same profile");
    let isolated = tauri::WebviewWindowBuilder::new(
        app,
        "notification-isolated",
        WebviewUrl::External(base.parse().map_err(err)?),
    )
    .data_directory(root.join("isolated"))
    .visible(false)
    .build()
    .map_err(err)?;
    until(
        &isolated.as_ref().clone(),
        "Notification.permission",
        "default",
    )
    .await?;
    check("isolated profiles do not inherit permission");

    notifications::set_permission(&v, &base, "block").await?;
    until(&v, "Notification.permission", "denied").await?;
    until(
        &shared.as_ref().clone(),
        "Notification.permission",
        "denied",
    )
    .await?;
    check("menu permission changes revoke access in all shared tabs");
    notifications::set_permission(&v, &base, "allow").await?;
    until(&v, "Notification.permission", "granted").await?;
    check("menu permission changes can allow notifications");
    Ok(())
}

fn main() {
    let root = PathBuf::from(std::env::args().nth(1).expect("test profile directory"));
    let base = std::env::args().nth(2).expect("fixture URL");
    let persisted = std::env::args().nth(3).as_deref() == Some("persisted");
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "com.samya.tabbar.notification-smoke".into();
    tauri::Builder::default()
        .setup(move |app| {
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "notification-smoke",
                WebviewUrl::External(base.parse()?),
            )
            .title("Tabbar notification test")
            .data_directory(root.join("shared"))
            .inner_size(420., 180.)
            .visible(false)
            .build()?;
            let handle = app.handle().clone();
            let owner = window.hwnd()?.0 as isize;
            window.with_webview(move |w| unsafe {
                let result = w.controller().CoreWebView2().and_then(|core| {
                    notifications::install(
                        &handle,
                        &core,
                        "notification-smoke".into(),
                        windows::Win32::Foundation::HWND(owner as _),
                    )
                });
                if let Err(error) = result {
                    eprintln!("{error}");
                    handle.exit(1);
                }
            })?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result = run(&handle, root, base, persisted).await;
                if let Err(error) = &result {
                    eprintln!("FAIL {error}");
                }
                handle.exit(if result.is_ok() { 0 } else { 1 });
            });
            Ok(())
        })
        .run(context)
        .expect("notification smoke app");
}
