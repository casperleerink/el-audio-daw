mod assets;
mod dsp;
mod engine;
mod mixer;
mod timeline;
mod transport;

use assets::Asset;
use engine::{Engine, Project, ProjectUpdate};
use mixer::Track;
use timeline::Clip;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmEngine {
    engine: Engine,
}

#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self { engine: Engine::new(sample_rate) }
    }

    pub fn process(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.engine.process(left, right);
    }

    pub fn apply_command(&mut self, command: JsValue) {
        match string_prop(&command, "type").as_deref() {
            Some("LoadProject") => {
                if let Some(project) = prop(&command, "project") {
                    self.engine.load_project(parse_project(project, None));
                }
            }
            Some("ApplyProjectUpdate") => {
                if let Some(update) = prop(&command, "update").and_then(parse_project_update) {
                    self.engine.apply_update(update);
                }
            }
            Some("LoadAsset") => {
                if let Some(asset) = prop(&command, "asset") {
                    self.load_asset(asset);
                }
            }
            Some("UnloadAsset") => {
                if let Some(asset_id) = string_prop(&command, "assetId") {
                    self.engine.assets_mut().remove(&asset_id);
                }
            }
            Some("Play") => self.engine.play(),
            Some("Pause") => self.engine.pause(),
            Some("Stop") => self.engine.stop(),
            Some("Seek") => {
                if let Some(seconds) = number_prop(&command, "timeSeconds") {
                    self.engine.seek_seconds(seconds);
                }
            }
            Some("SetTrackGain") => {
                if let (Some(track_id), Some(gain_db)) = (string_prop(&command, "trackId"), number_prop(&command, "gainDb")) {
                    self.engine.set_track_gain(&track_id, gain_db as f32);
                }
            }
            Some("SetTrackPan") => {
                if let (Some(track_id), Some(pan)) = (string_prop(&command, "trackId"), number_prop(&command, "pan")) {
                    self.engine.set_track_pan(&track_id, pan as f32);
                }
            }
            Some("SetMasterGain") => {
                if let Some(gain_db) = number_prop(&command, "gainDb") {
                    self.engine.set_master_gain(gain_db as f32);
                }
            }
            _ => {}
        }
    }
}

impl WasmEngine {
    fn load_asset(&mut self, asset_value: JsValue) {
        let Some(id) = string_prop(&asset_value, "id") else { return; };
        let sample_rate = number_prop(&asset_value, "sampleRate").unwrap_or(44_100.0) as f32;
        let length_samples = number_prop(&asset_value, "lengthSamples").unwrap_or(0.0).max(0.0) as u64;
        let Some(channels_value) = prop(&asset_value, "channels") else { return; };

        let channels_array = js_sys::Array::from(&channels_value);
        let mut channels = Vec::new();
        for channel_value in channels_array.iter() {
            let channel = js_sys::Float32Array::new(&channel_value);
            let mut data = vec![0.0; channel.length() as usize];
            channel.copy_to(&mut data);
            channels.push(data);
        }

        self.engine.assets_mut().insert(id, Asset { sample_rate, channels, length_samples });
    }
}

fn parse_project(value: JsValue, fallback_sample_rate: Option<f32>) -> Project {
    Project {
        sample_rate: number_prop(&value, "sampleRate").unwrap_or(fallback_sample_rate.unwrap_or(44_100.0) as f64) as f32,
        tracks: parse_tracks(prop(&value, "tracks")),
        clips: parse_clips(prop(&value, "clips")),
        master_gain_db: prop(&value, "master").and_then(|master| number_prop(&master, "gainDb")).unwrap_or(0.0) as f32,
    }
}

fn parse_project_update(value: JsValue) -> Option<ProjectUpdate> {
    match string_prop(&value, "type").as_deref() {
        Some("Replace") => prop(&value, "project").map(|project| ProjectUpdate::Replace(parse_project(project, None))),
        Some("SetTrack") => prop(&value, "track").map(parse_track).map(ProjectUpdate::SetTrack),
        Some("RemoveTrack") => string_prop(&value, "trackId").map(ProjectUpdate::RemoveTrack),
        Some("SetClip") => prop(&value, "clip").map(parse_clip).map(ProjectUpdate::SetClip),
        Some("RemoveClip") => string_prop(&value, "clipId").map(ProjectUpdate::RemoveClip),
        _ => None,
    }
}

fn parse_tracks(value: Option<JsValue>) -> Vec<Track> {
    value.map(|value| js_sys::Array::from(&value).iter().map(parse_track).collect()).unwrap_or_default()
}

fn parse_track(value: JsValue) -> Track {
    Track {
        id: string_prop(&value, "id").unwrap_or_default(),
        muted: bool_prop(&value, "muted").unwrap_or(false),
        solo: bool_prop(&value, "solo").unwrap_or(false),
        gain_db: number_prop(&value, "gainDb").unwrap_or(0.0) as f32,
        pan: number_prop(&value, "pan").unwrap_or(0.0) as f32,
    }
}

fn parse_clips(value: Option<JsValue>) -> Vec<Clip> {
    value.map(|value| js_sys::Array::from(&value).iter().map(parse_clip).collect()).unwrap_or_default()
}

fn parse_clip(value: JsValue) -> Clip {
    Clip {
        id: string_prop(&value, "id").unwrap_or_default(),
        track_id: string_prop(&value, "trackId").unwrap_or_default(),
        asset_id: string_prop(&value, "assetId").unwrap_or_default(),
        start_samples: number_prop(&value, "startSamples").unwrap_or(0.0).max(0.0) as u64,
        duration_samples: number_prop(&value, "durationSamples").unwrap_or(0.0).max(0.0) as u64,
        source_start_samples: number_prop(&value, "sourceStartSamples").unwrap_or(0.0).max(0.0) as u64,
        gain_db: number_prop(&value, "gainDb").unwrap_or(0.0) as f32,
    }
}

fn prop(value: &JsValue, name: &str) -> Option<JsValue> {
    js_sys::Reflect::get(value, &JsValue::from_str(name)).ok()
}

fn string_prop(value: &JsValue, name: &str) -> Option<String> { prop(value, name).and_then(|value| value.as_string()) }
fn number_prop(value: &JsValue, name: &str) -> Option<f64> { prop(value, name).and_then(|value| value.as_f64()) }
fn bool_prop(value: &JsValue, name: &str) -> Option<bool> { prop(value, name).and_then(|value| value.as_bool()) }
