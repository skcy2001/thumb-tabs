//! Website notifications use WebView2's native display and profile permissions.
//! Only the permission question is ours; notification content and click/close
//! events remain with WebView2. COM objects never leave the UI thread.
use super::{err, model, report, AppHandle, Result, Webview};
use std::{
    cell::RefCell,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::Manager;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::*, NotificationCloseRequestedEventHandler,
    NotificationReceivedEventHandler, PermissionRequestedEventHandler,
    SetPermissionStateCompletedHandler,
};
use windows::{
    core::{w, Interface, HSTRING, PWSTR},
    Win32::{
        Foundation::HWND,
        System::Com::CoTaskMemFree,
        UI::WindowsAndMessaging::{
            MessageBoxW, IDCANCEL, IDNO, IDYES, MB_DEFBUTTON2, MB_ICONQUESTION, MB_SETFOREGROUND,
            MB_YESNOCANCEL,
        },
    },
};

static PROMPT_OPEN: AtomicBool = AtomicBool::new(false);
thread_local! {
    static PENDING: RefCell<Option<Pending>> = const { RefCell::new(None) };
}
struct Pending {
    label: String,
    top_origin: Option<String>,
    request: ICoreWebView2PermissionRequestedEventArgs3,
    deferral: ICoreWebView2Deferral,
}

unsafe fn uri(get: impl FnOnce(*mut PWSTR) -> windows::core::Result<()>) -> Option<String> {
    let mut raw = PWSTR::null();
    let result = get(&mut raw);
    let text = if result.is_ok() && !raw.is_null() {
        raw.to_string().ok()
    } else {
        None
    };
    CoTaskMemFree(Some(raw.0 as _));
    text
}

fn complete(app: &AppHandle, answer: i32) {
    let pending = PENDING.with(|p| p.borrow_mut().take());
    PROMPT_OPEN.store(false, Ordering::Release);
    let Some(pending) = pending else { return };
    // A closed tab or a navigation to another origin invalidates this question.
    let current = app.get_webview(&pending.label).and_then(|v| v.url().ok());
    let still_open = current
        .as_ref()
        .and_then(|u| model::notification_origin(u.as_str()))
        == pending.top_origin
        && current.is_some();
    let state = if still_open && answer == IDYES.0 {
        COREWEBVIEW2_PERMISSION_STATE_ALLOW
    } else if still_open && answer == IDNO.0 {
        COREWEBVIEW2_PERMISSION_STATE_DENY
    } else {
        COREWEBVIEW2_PERMISSION_STATE_DEFAULT
    };
    unsafe {
        let result = pending
            .request
            .SetSavesInProfile(state != COREWEBVIEW2_PERMISSION_STATE_DEFAULT)
            .and_then(|_| pending.request.SetState(state));
        // Always release the request, including errors and dismissed questions.
        let completed = pending.deferral.Complete();
        if let Err(error) = result.and(completed) {
            if still_open {
                report(app, format!("Website notification permission: {error}"));
            }
        }
    }
}

pub unsafe fn install(
    app: &AppHandle,
    core: &ICoreWebView2,
    label: String,
    owner: HWND,
) -> windows::core::Result<()> {
    install_toasts(app, core, &label)?;
    let app = app.clone();
    let owner = owner.0 as isize;
    let mut token = 0;
    core.add_PermissionRequested(
        &PermissionRequestedEventHandler::create(Box::new(move |sender, args| {
            let (Some(core), Some(args)) = (sender, args) else { return Ok(()) };
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut kind)?;
            if kind != COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS {
                return Ok(());
            }
            let request = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>()?;
            request.SetHandled(true)?;
            request.SetSavesInProfile(false)?;
            let origin = uri(|p| args.Uri(p)).and_then(|u| model::notification_origin(&u));
            let Some(origin) = origin else {
                return request.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY);
            };
            // Avoid overlapping modal questions from background tabs/frames.
            // This temporary refusal is deliberately not saved in the profile.
            if PROMPT_OPEN.load(Ordering::Acquire) {
                return request.SetState(COREWEBVIEW2_PERMISSION_STATE_DEFAULT);
            }
            let deferral = request.GetDeferral()?;
            let top_origin = uri(|p| core.Source(p)).and_then(|u| model::notification_origin(&u));
            PENDING.with(|p| *p.borrow_mut() = Some(Pending {
                label: label.clone(), top_origin, request, deferral,
            }));
            PROMPT_OPEN.store(true, Ordering::Release);
            let prompt_app = app.clone();
            // A deferral keeps the WebView2 thread responsive while the native
            // question runs its own modal message loop on a separate thread.
            let spawn = std::thread::Builder::new().name("notification-permission".into()).spawn(move || {
                let message = HSTRING::from(format!(
                    "Allow notifications from {origin}?\n\nYes — allow notifications\nNo — block notifications\nCancel — decide later\n\nYour choice is saved for this website in this browser profile."
                ));
                let answer = MessageBoxW(
                    Some(HWND(owner as _)), &message, w!("Tabbar — Website notifications"),
                    MB_YESNOCANCEL | MB_ICONQUESTION | MB_DEFBUTTON2 | MB_SETFOREGROUND,
                );
                let completion_app = prompt_app.clone();
                let _ = prompt_app.run_on_main_thread(move || complete(&completion_app, answer.0));
            });
            if let Err(error) = spawn {
                complete(&app, IDCANCEL.0);
                report(&app, format!("Could not ask for notification permission: {error}"));
            }
            Ok(())
        })),
        &mut token,
    )
}

pub async fn set_permission(v: &Webview, origin: &str, choice: &str) -> Result<()> {
    let origin = model::notification_origin(origin).ok_or("Invalid notification origin")?;
    let state = match choice {
        "allow" => COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        "block" => COREWEBVIEW2_PERMISSION_STATE_DENY,
        "ask" => COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
        _ => return Err("Invalid notification permission".into()),
    };
    let (send, recv) = tokio::sync::oneshot::channel();
    v.with_webview(move |w| unsafe {
        let send = std::sync::Arc::new(Mutex::new(Some(send)));
        let reply = send.clone();
        let result = (|| -> windows::core::Result<()> {
            let core = w.controller().CoreWebView2()?;
            let profile = core
                .cast::<ICoreWebView2_13>()?
                .Profile()?
                .cast::<ICoreWebView2Profile4>()?;
            profile.SetPermissionState(
                COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
                &HSTRING::from(origin),
                state,
                &SetPermissionStateCompletedHandler::create(Box::new(move |result| {
                    if let Some(send) = reply.lock().unwrap().take() {
                        let _ = send.send(result.map_err(err));
                    }
                    Ok(())
                })),
            )
        })();
        if let Err(error) = result {
            if let Some(send) = send.lock().unwrap().take() {
                let _ = send.send(Err(err(error)));
            }
        }
    })
    .map_err(err)?;
    tokio::time::timeout(Duration::from_secs(10), recv)
        .await
        .map_err(|_| "Changing notification permission timed out")?
        .map_err(err)?
}

// ---- Standard Windows notifications ----
//
// Sites' notifications are taken from WebView2 (which would otherwise draw its
// own pop-up) and shown as Windows toasts under Tabbar's name and icon, so
// they look like other apps', stay in Notification Centre, and follow Windows
// notification settings. Clicking one brings up the site's tab.

use std::collections::HashMap;
use windows::{
    core::IInspectable,
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{ToastDismissedEventArgs, ToastNotification, ToastNotificationManager},
};

/// Toast group for every site notification, so they can be removed by tag.
const TOAST_GROUP: &str = "sites";

thread_local! {
    /// Notifications on screen, by toast tag, so clicks and dismissals can be
    /// reported back to the site. COM objects stay on the UI thread.
    static SHOWN: RefCell<HashMap<String, ICoreWebView2Notification>> = RefCell::new(HashMap::new());
}
static NEXT_TAG: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// Windows identifies a notification sender by its app user model ID.
fn app_id(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

/// Gives the process an app identity and registers it as a notification
/// sender (name and icon) for the current user. Unpackaged apps do this with
/// an AppUserModelId registry entry; no shortcut is needed.
pub fn register_sender(app: &AppHandle) {
    use windows::Win32::{
        System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ},
        UI::Shell::SetCurrentProcessExplicitAppUserModelID,
    };
    let id = app_id(app);
    let icon = app
        .path()
        .app_local_data_dir()
        .ok()
        .map(|d| d.join("notification-icon.png"))
        .and_then(|path| {
            std::fs::create_dir_all(path.parent()?).ok()?;
            std::fs::write(&path, include_bytes!("../icons/icon.png")).ok()?;
            Some(path)
        });
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(id.as_str()));
        let key = HSTRING::from(format!(r"Software\Classes\AppUserModelId\{id}"));
        let set = |name: &str, value: &str| {
            let name = HSTRING::from(name);
            let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
            let _ = RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &key,
                &name,
                REG_SZ.0,
                Some(wide.as_ptr() as _),
                (wide.len() * 2) as u32,
            );
        };
        set("DisplayName", "Tabbar");
        if let Some(icon) = icon {
            set("IconUri", &icon.to_string_lossy());
        }
    }
}

fn xml_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Shows a site's notification as a Windows toast. `tab` is the tab to bring
/// up when it is clicked.
unsafe fn show_toast(
    app: &AppHandle,
    tab: Option<u64>,
    origin: &str,
    notification: ICoreWebView2Notification,
) -> windows::core::Result<()> {
    let title = uri(|p| notification.Title(p)).unwrap_or_default();
    let body = uri(|p| notification.Body(p)).unwrap_or_default();
    let site = url::Url::parse(origin)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.trim_start_matches("www.").to_owned()))
        .unwrap_or_else(|| origin.to_owned());
    let tag = NEXT_TAG
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        .to_string();

    let doc = XmlDocument::new()?;
    doc.LoadXml(&HSTRING::from(format!(
        r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text><text placement="attribution">{}</text></binding></visual></toast>"#,
        xml_text(if title.is_empty() { &site } else { &title }),
        xml_text(&body),
        xml_text(&site),
    )))?;
    let toast = ToastNotification::CreateToastNotification(&doc)?;
    toast.SetTag(&HSTRING::from(tag.as_str()))?;
    toast.SetGroup(&HSTRING::from(TOAST_GROUP))?;

    // Clicks and dismissals arrive on a Windows thread; hop to the UI thread
    // to report them to the site, and to bring up the tab.
    let clicked = app.clone();
    let click_tag = tag.clone();
    toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(move |_, _| {
        let app = clicked.clone();
        let tag = click_tag.clone();
        let _ = clicked.run_on_main_thread(move || {
            if let Some(n) = SHOWN.with(|s| s.borrow_mut().remove(&tag)) {
                let _ = n.ReportClicked();
            }
            if let Some(id) = tab {
                super::enqueue(app, serde_json::json!({"type":"showTab","id":id}));
            }
        });
        Ok(())
    }))?;
    let dismissed = app.clone();
    let dismiss_tag = tag.clone();
    toast.Dismissed(&TypedEventHandler::<ToastNotification, ToastDismissedEventArgs>::new(move |_, _| {
        let tag = dismiss_tag.clone();
        let _ = dismissed.run_on_main_thread(move || {
            if let Some(n) = SHOWN.with(|s| s.borrow_mut().remove(&tag)) {
                let _ = n.ReportClosed();
            }
        });
        Ok(())
    }))?;

    // The site can withdraw its notification (for example once it is read).
    let withdrawn = app_id(app);
    let close_tag = tag.clone();
    let mut token = 0;
    notification.add_CloseRequested(
        &NotificationCloseRequestedEventHandler::create(Box::new(move |_, _| {
            SHOWN.with(|s| s.borrow_mut().remove(&close_tag));
            if let Ok(history) = ToastNotificationManager::History() {
                let _ = history.RemoveGroupedTagWithId(
                    &HSTRING::from(close_tag.as_str()),
                    &HSTRING::from(TOAST_GROUP),
                    &HSTRING::from(withdrawn.as_str()),
                );
            }
            Ok(())
        })),
        &mut token,
    )?;

    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id(app)))?.Show(&toast)?;
    notification.ReportShown()?;
    SHOWN.with(|s| s.borrow_mut().insert(tag, notification));
    Ok(())
}

/// Routes a page's notifications to Windows toasts instead of WebView2's own
/// pop-up. Older WebView2 runtimes without this event keep their pop-up.
unsafe fn install_toasts(app: &AppHandle, core: &ICoreWebView2, label: &str) -> windows::core::Result<()> {
    let Ok(core) = core.cast::<ICoreWebView2_24>() else { return Ok(()) };
    let app = app.clone();
    let tab = label.strip_prefix("tab-").and_then(|id| id.parse::<u64>().ok());
    let mut token = 0;
    core.add_NotificationReceived(
        &NotificationReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let origin = uri(|p| args.SenderOrigin(p)).unwrap_or_default();
            let notification = args.Notification()?;
            // Only take over once the toast is actually up; otherwise WebView2
            // still shows its own pop-up and nothing is lost.
            match show_toast(&app, tab, &origin, notification) {
                Ok(()) => args.SetHandled(true),
                Err(error) => {
                    report(&app, format!("Windows notification: {error}"));
                    Ok(())
                }
            }
        })),
        &mut token,
    )
}
