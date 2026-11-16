fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_state",
            "act",
            "query",
        ])),
    )
    .expect("failed to build Tauri resources");
    // Tauri links its Windows manifest only into application binaries by
    // default. The native smoke-test example also needs common controls v6.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!(
            "cargo:rustc-link-arg-examples={}/resource.lib",
            std::env::var("OUT_DIR").unwrap()
        );
    }
}
