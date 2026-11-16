use serde::{Deserialize, Serialize};
use url::Url;

pub const RIBBON: f64 = 53.0;
pub const TOOLBAR: f64 = 44.0;

/// Notification choices belong to exact secure origins, never host suffixes,
/// page paths, or display titles. Loopback HTTP is a browser secure context.
pub fn notification_origin(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    let local = match url.host()? {
        url::Host::Domain(host) => host == "localhost" || host.ends_with(".localhost"),
        url::Host::Ipv4(ip) => ip.is_loopback(),
        url::Host::Ipv6(ip) => ip.is_loopback(),
    };
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return None;
    }
    Some(url.origin().ascii_serialization())
}

pub struct SlideFrame {
    pub window_x: i32,
    pub content_x: i32,
    pub clip_x: i32,
    pub clip_width: u32,
}

// Keep the native window on its display; move and crop its contents instead.
// This also prevents Windows from changing DPI halfway through an animation.
pub fn slide_frame(x: i32, width: u32, offset: i32, left: i32, monitor_width: u32) -> SlideFrame {
    let desired = x + offset;
    let window_x = desired.clamp(left, left + monitor_width.saturating_sub(width) as i32);
    let content_x = desired - window_x;
    let clip_x = content_x.max(0).min(width as i32);
    let clip_right = (content_x + width as i32)
        .min(left + monitor_width as i32 - window_x)
        .clamp(0, width as i32);
    SlideFrame {
        window_x,
        content_x,
        clip_x,
        clip_width: (clip_right - clip_x).max(0) as u32,
    }
}

#[derive(Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    #[default]
    Right,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pin {
    #[serde(deserialize_with = "string_id")]
    pub id: String,
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub favicon_data_url: Option<String>,
    #[serde(default)]
    pub expanded_width: Option<f64>,
    #[serde(default)]
    pub partition: Option<String>,
    #[serde(default)]
    pub user_agent: Option<String>,
}

fn string_id<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Id {
        Text(String),
        Number(u64),
    }
    Ok(match Id::deserialize(d)? {
        Id::Text(s) => s,
        Id::Number(n) => n.to_string(),
    })
}

pub const THEMES: &[&str] = &["cocoa", "midnight", "graphite", "forest", "light"];
pub const TAB_STYLES: &[&str] = &["binder", "classic", "pill", "chrome"];

/// How the shell looks. Both fields name a style the UI defines; anything
/// else (a newer build's choice, a hand-edited file) falls back to the default.
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    pub theme: String,
    pub tab_style: String,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: THEMES[0].into(),
            tab_style: TAB_STYLES[0].into(),
        }
    }
}

impl Appearance {
    pub fn sanitize(&mut self) {
        let default = Self::default();
        if !THEMES.contains(&self.theme.as_str()) {
            self.theme = default.theme;
        }
        if !TAB_STYLES.contains(&self.tab_style.as_str()) {
            self.tab_style = default.tab_style;
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub side: Side,
    pub pane_width: f64,
    pub pins: Vec<Pin>,
    pub pinned: bool,
    /// Keep the open page expanded when focus moves elsewhere.
    pub keep_open: bool,
    pub collapsed: bool,
    pub monitor: Option<String>,
    pub imported_electron: bool,
    pub appearance: Appearance,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            side: Side::Right,
            pane_width: 364.0,
            pins: vec![],
            pinned: false,
            keep_open: false,
            collapsed: true,
            monitor: None,
            imported_electron: false,
            appearance: Appearance::default(),
        }
    }
}

impl Settings {
    pub fn sanitize(&mut self) {
        self.pane_width = clamp_width(self.pane_width);
        self.appearance.sanitize();
        let mut ids = std::collections::HashSet::new();
        self.pins
            .retain(|p| !p.id.is_empty() && ids.insert(p.id.clone()) && is_web_url(&p.url));
        for p in &mut self.pins {
            p.expanded_width = p.expanded_width.map(clamp_width);
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: u64,
    pub title: String,
    pub url: String,
    pub pin_id: Option<String>,
    pub loading: bool,
    pub favicon_data_url: Option<String>,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub has_media: bool,
    pub is_audio_playing: bool,
    pub unread_count: u32,
    pub unread_dot: bool,
    pub expanded_width: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub tabs: Vec<Tab>,
    pub active: Option<u64>,
    pub collapsed: bool,
    pub settings: Settings,
    pub downloads: Vec<Download>,
    pub player_target: Option<u64>,
    pub fullscreen: bool,
    pub html_fullscreen: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: u64,
    pub filename: String,
    pub url: String,
    pub save_path: String,
    pub state: String,
    pub received_bytes: i64,
    pub total_bytes: i64,
    pub started_at: u64,
}

pub struct Browser {
    pub state: Snapshot,
    next_id: u64,
}

impl Browser {
    pub fn new(settings: Settings) -> Self {
        let next_id = 1;
        Self {
            state: Snapshot {
                tabs: vec![],
                active: None,
                collapsed: settings.collapsed,
                settings,
                downloads: vec![],
                player_target: None,
                fullscreen: false,
                html_fullscreen: false,
            },
            next_id,
        }
    }

    pub fn add(&mut self, url: String, pin_id: Option<String>) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let title = Url::parse(&url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .unwrap_or_else(|| "New tab".into());
        let pin = self
            .state
            .settings
            .pins
            .iter()
            .find(|p| Some(&p.id) == pin_id.as_ref());
        self.state.tabs.push(Tab {
            id,
            title,
            url,
            pin_id,
            loading: false,
            favicon_data_url: pin.and_then(|p| p.favicon_data_url.clone()),
            can_go_back: false,
            can_go_forward: false,
            has_media: false,
            is_audio_playing: false,
            unread_count: 0,
            unread_dot: false,
            expanded_width: pin
                .and_then(|p| p.expanded_width)
                .unwrap_or(self.state.settings.pane_width),
        });
        self.state.active = Some(id);
        id
    }

    pub fn remove(&mut self, id: u64) {
        let index = self.state.tabs.iter().position(|t| t.id == id);
        self.state.tabs.retain(|t| t.id != id);
        if self.state.active == Some(id) {
            self.state.active = self
                .state
                .tabs
                .get(index.unwrap_or(0).saturating_sub(1))
                .or_else(|| self.state.tabs.first())
                .map(|t| t.id);
        }
    }
}

/// Widest the page can be dragged.
pub const MAX_PANE_WIDTH: f64 = 900.0;

pub fn clamp_width(width: f64) -> f64 {
    if width.is_finite() {
        width.clamp(220.0, MAX_PANE_WIDTH).round()
    } else {
        364.0
    }
}

pub fn is_web_url(value: &str) -> bool {
    Url::parse(value)
        .is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
}

pub fn normalize_url(input: &str) -> Result<String, String> {
    let input = input.trim();
    if input.is_empty() || input == "about:blank" {
        return Ok("about:blank".into());
    }
    if is_web_url(input) {
        return Ok(Url::parse(input).unwrap().to_string());
    }
    // Reject executable/local schemes. A host:port is an address, not a scheme.
    let host_port = input.split('/').next().unwrap_or_default();
    let has_port = host_port
        .rsplit_once(':')
        .is_some_and(|(_, p)| p.parse::<u16>().is_ok());
    if !has_port && Url::parse(input).is_ok() {
        return Err("Only http and https addresses are supported".into());
    }
    if !input.chars().any(char::is_whitespace)
        && (input.contains('.') || input.starts_with("localhost") || has_port)
    {
        let scheme = if input.starts_with("localhost") || input.starts_with("127.0.0.1") {
            "http"
        } else {
            "https"
        };
        let value = format!("{scheme}://{input}");
        if is_web_url(&value) {
            return Ok(Url::parse(&value).unwrap().to_string());
        }
    }
    let mut search = Url::parse("https://www.google.com/search").unwrap();
    search.query_pairs_mut().append_pair("q", input);
    Ok(search.into())
}

pub fn launch_url(input: &str) -> Option<String> {
    let value = if let Some(rest) = input
        .strip_prefix("tabbar://")
        .or_else(|| input.strip_prefix("sidebar://"))
    {
        if rest.starts_with("http://") || rest.starts_with("https://") {
            rest.to_owned()
        } else if rest.contains("://") {
            return None;
        } else {
            format!("https://{rest}")
        }
    } else {
        input.to_owned()
    };
    is_web_url(&value).then_some(value)
}

pub fn same_host(a: &str, b: &str) -> bool {
    let host = |s: &str| {
        Url::parse(s).ok().and_then(|u| {
            u.host_str()
                .map(|h| h.trim_start_matches("www.").to_lowercase())
        })
    };
    let a = host(a);
    a.is_some() && a == host(b)
}

/// Reads "N", "N+" or a comma-grouped "1,234" followed by `)` or `]` and
/// returns the count with whatever follows the bracket. Four digits without a
/// comma are rejected: those are almost always years ("(2024) Recap").
fn bracketed_count(s: &str) -> Option<(u32, &str)> {
    let body: String = s
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == ',')
        .collect();
    let groups: Vec<&str> = body.split(',').collect();
    let valid = !groups[0].is_empty()
        && groups[0].len() <= 3
        && groups[1..].iter().all(|g| g.len() == 3);
    if !valid {
        return None;
    }
    let rest = s[body.len()..].trim_start_matches('+');
    let rest = rest.strip_prefix([')', ']'])?;
    Some((groups.concat().parse().ok()?, rest))
}

pub fn unread(title: &str) -> (u32, bool) {
    let t = title.trim();
    if let Some(rest) = t.strip_prefix(['(', '[']) {
        if let Some((n, _)) = bracketed_count(rest) {
            return (n, false);
        }
    }
    // Gmail puts the count after the folder name: "Inbox (3) - me@x.com - Gmail".
    if let Some((head, rest)) = t.split_once(" (") {
        if !head.is_empty() {
            if let Some((n, after)) = bracketed_count(rest) {
                if after.is_empty() || after.starts_with(" - ") || after.starts_with(" | ") {
                    return (n, false);
                }
            }
        }
    }
    (0, t.starts_with(['•', '●', '·', '*']))
}

pub fn reorder<T>(items: &mut Vec<T>, from: usize, to: usize, before: bool) {
    if from == to || from >= items.len() || to >= items.len() {
        return;
    }
    let item = items.remove(from);
    let target = to - usize::from(from < to) + usize::from(!before);
    items.insert(target.min(items.len()), item);
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Create { url: Option<String> },
    Activate { id: u64 },
    Close { id: u64 },
    Navigate { url: String },
    Back,
    Forward,
    Reload,
    ToggleCollapsed,
    ToggleSide,
    SetWidth { width: f64 },
    Pin { id: u64 },
    Unpin { id: String },
    LaunchPin { id: String },
    MovePin { id: String, before: String },
    Menu { id: Option<u64> },
    OpenExternal,
    Hide,
    Quit,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addresses_searches_and_unsafe_schemes() {
        assert_eq!(
            normalize_url(" example.com/a ").unwrap(),
            "https://example.com/a"
        );
        assert_eq!(
            normalize_url("localhost:3000/a").unwrap(),
            "http://localhost:3000/a"
        );
        assert_eq!(
            normalize_url("two words & more").unwrap(),
            "https://www.google.com/search?q=two+words+%26+more"
        );
        for value in [
            "javascript:alert(1)",
            "file:///C:/secrets",
            "data:text/html,x",
            "tauri://localhost",
        ] {
            assert!(normalize_url(value).is_err(), "{value}");
            assert!(!is_web_url(value));
        }
    }

    #[test]
    fn persisted_values_are_bounded_and_pins_validated() {
        let mut settings = Settings {
            pane_width: f64::NAN,
            ..Settings::default()
        };
        settings.pins = vec![
            Pin {
                id: "1".into(),
                title: "A".into(),
                url: "https://example.com".into(),
                favicon_data_url: None,
                expanded_width: None,
                partition: None,
                user_agent: None,
            },
            Pin {
                id: "1".into(),
                title: "Duplicate".into(),
                url: "https://example.org".into(),
                favicon_data_url: None,
                expanded_width: None,
                partition: None,
                user_agent: None,
            },
            Pin {
                id: "2".into(),
                title: "Local".into(),
                url: "file:///x".into(),
                favicon_data_url: None,
                expanded_width: None,
                partition: None,
                user_agent: None,
            },
        ];
        settings.sanitize();
        assert_eq!(settings.pins.len(), 1);
        assert_eq!(settings.pane_width, 364.0);
        assert_eq!(clamp_width(9999.0), 900.0);
    }

    #[test]
    fn appearance_keeps_known_styles_and_defaults_the_rest() {
        let mut settings = Settings::default();
        settings.appearance.theme = "forest".into();
        settings.appearance.tab_style = "sparkles".into();
        settings.sanitize();
        assert_eq!(settings.appearance.theme, "forest");
        assert_eq!(settings.appearance.tab_style, "binder");

        settings.appearance.theme = "neon".into();
        settings.sanitize();
        assert_eq!(settings.appearance, Appearance::default());
    }

    #[test]
    fn closing_tabs_keeps_a_valid_active_selection() {
        let mut b = Browser::new(Settings::default());
        let a = b.add("about:blank".into(), None);
        let c = b.add("about:blank".into(), None);
        b.remove(a);
        assert_eq!(b.state.active, Some(c));
        b.remove(c);
        assert_eq!(b.state.active, None);
    }

    #[test]
    fn deep_links_only_route_web_addresses_and_match_pinned_hosts() {
        assert_eq!(
            launch_url("tabbar://example.com/path").as_deref(),
            Some("https://example.com/path")
        );
        assert_eq!(
            launch_url("tabbar://http://localhost:3000/a").as_deref(),
            Some("http://localhost:3000/a")
        );
        assert_eq!(
            launch_url("sidebar://example.com/path").as_deref(),
            Some("https://example.com/path")
        );
        assert_eq!(
            launch_url("sidebar://http://localhost:3000/a").as_deref(),
            Some("http://localhost:3000/a")
        );
        for value in [
            "file:///C:/test",
            "javascript:alert(1)",
            "sidebar://file:///C:/test",
            "sidebar://javascript:alert(1)",
            "tabbar://file:///C:/test",
            "tabbar://javascript:alert(1)",
        ] {
            assert!(launch_url(value).is_none());
        }
        assert!(same_host(
            "https://www.example.com/a",
            "https://example.com/b"
        ));
        assert!(!same_host(
            "https://example.com",
            "https://example.com.evil.test"
        ));
    }

    #[test]
    fn unread_titles_do_not_treat_years_as_counts() {
        assert_eq!(unread(" (23+) Inbox"), (23, false));
        assert_eq!(unread("[3] Chat"), (3, false));
        assert_eq!(unread("(2024) Recap"), (0, false));
        assert_eq!(unread("(0) Mail"), (0, false));
        assert_eq!(unread("• New message"), (0, true));
        assert_eq!(unread("Inbox (3) - me@example.com - Gmail"), (3, false));
        assert_eq!(unread("Inbox (1,234) - me@example.com - Gmail"), (1234, false));
        assert_eq!(unread("Inbox - me@example.com - Gmail"), (0, false));
        assert_eq!(unread("Recap (2024) - Blog"), (0, false));
        assert_eq!(unread("Song (Remix) - Music"), (0, false));
        assert_eq!(unread("Chapter (3) of the story"), (0, false));
    }

    #[test]
    fn notification_permissions_use_exact_secure_origins() {
        assert_eq!(
            notification_origin("https://EXAMPLE.com:443/inbox?q=1#new").as_deref(),
            Some("https://example.com")
        );
        assert_eq!(
            notification_origin("https://example.com:8443/").as_deref(),
            Some("https://example.com:8443")
        );
        assert_ne!(
            notification_origin("https://example.com"),
            notification_origin("https://sub.example.com")
        );
        assert_eq!(
            notification_origin("https://user:pass@example.com/inbox").as_deref(),
            Some("https://example.com")
        );
        for value in [
            "http://localhost:8100/test",
            "http://127.0.0.1/test",
            "http://[::1]:8100/test",
        ] {
            assert!(notification_origin(value).is_some(), "{value}");
        }
        for value in [
            "http://example.com",
            "http://localhost.evil.test",
            "file:///C:/test",
            "about:blank",
            "javascript:alert(1)",
            "data:text/html,test",
            "not a url",
        ] {
            assert!(notification_origin(value).is_none(), "{value}");
        }
    }

    #[test]
    fn reorder_accounts_for_removing_an_earlier_item() {
        let mut items = vec![1, 2, 3, 4];
        reorder(&mut items, 0, 2, false);
        assert_eq!(items, vec![2, 3, 1, 4]);
        reorder(&mut items, 3, 0, true);
        assert_eq!(items, vec![4, 2, 3, 1]);
        reorder(&mut items, 2, 2, true);
        assert_eq!(items, vec![4, 2, 3, 1]);
    }

    #[test]
    fn slides_stay_on_their_monitor_without_distorting_content() {
        for (left, monitor_width, ribbon, pane) in [(-1920, 1920, 80, 636), (1920, 1080, 53, 424)] {
            for right in [false, true] {
                for width in [ribbon, pane] {
                    let inset = if width == ribbon { 0 } else { ribbon };
                    let x = if right {
                        left + monitor_width - width - inset
                    } else {
                        left + inset
                    };
                    for travel in 0..=ribbon + pane {
                        let offset = if right { travel } else { -travel };
                        let frame =
                            slide_frame(x, width as u32, offset, left, monitor_width as u32);
                        assert!(frame.window_x >= left);
                        assert!(frame.window_x + width <= left + monitor_width);
                        assert_eq!(frame.window_x + frame.content_x, x + offset);
                        assert!(frame.clip_x >= 0);
                        assert!(frame.clip_x + frame.clip_width as i32 <= width);
                        let visible_left = (x + offset).max(left);
                        let visible_right = (x + offset + width).min(left + monitor_width);
                        assert_eq!(
                            frame.clip_width as i32,
                            (visible_right - visible_left).max(0)
                        );
                        if frame.clip_width > 0 {
                            assert_eq!(frame.window_x + frame.clip_x, visible_left);
                            assert_eq!(
                                frame.window_x + frame.clip_x + frame.clip_width as i32,
                                visible_right
                            );
                        }
                    }
                }
            }
        }
    }
}
