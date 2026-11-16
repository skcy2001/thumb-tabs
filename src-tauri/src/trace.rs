//! Opt-in timing trace for diagnosing layout and resize behaviour.
//!
//! Off unless the app is started with the `TABBAR_TRACE` environment variable
//! set; then every `trace!` line is appended, with milliseconds since the first
//! line and the thread name, to `%TEMP%\tabbar-trace.log`.
use std::{
    fs::OpenOptions,
    io::Write,
    sync::{Mutex, OnceLock},
    time::Instant,
};

struct Sink {
    start: Instant,
    file: Mutex<std::fs::File>,
}

fn sink() -> Option<&'static Sink> {
    static SINK: OnceLock<Option<Sink>> = OnceLock::new();
    SINK.get_or_init(|| {
        std::env::var_os("TABBAR_TRACE")?;
        let path = std::env::temp_dir().join("tabbar-trace.log");
        let file = OpenOptions::new().create(true).append(true).open(path).ok()?;
        Some(Sink { start: Instant::now(), file: Mutex::new(file) })
    })
    .as_ref()
}

pub fn enabled() -> bool {
    sink().is_some()
}

pub fn line(message: std::fmt::Arguments) {
    if let Some(sink) = sink() {
        let ms = sink.start.elapsed().as_secs_f64() * 1000.0;
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("?");
        if let Ok(mut file) = sink.file.lock() {
            let _ = writeln!(file, "{ms:10.2} [{name}] {message}");
        }
    }
}

macro_rules! trace {
    ($($arg:tt)*) => {
        if $crate::trace::enabled() {
            $crate::trace::line(format_args!($($arg)*));
        }
    };
}
pub(crate) use trace;
