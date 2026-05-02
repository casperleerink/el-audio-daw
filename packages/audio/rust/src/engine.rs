use crate::assets::AssetStore;
use crate::dsp::gain::{db_to_gain, SmoothedGain};
use crate::mixer::{RenderTrack, Track};
use crate::timeline::Clip;
use crate::transport::Transport;

pub struct Project {
    pub sample_rate: f32,
    pub tracks: Vec<Track>,
    pub clips: Vec<Clip>,
    pub master_gain_db: f32,
}

pub enum ProjectUpdate {
    Replace(Project),
    SetTrack(Track),
    RemoveTrack(String),
    SetClip(Clip),
    RemoveClip(String),
}

#[derive(Default)]
struct ProjectState {
    sample_rate: f32,
    tracks: Vec<Track>,
    clips: Vec<Clip>,
}

pub struct Engine {
    sample_rate: f32,
    project: ProjectState,
    transport: Transport,
    tracks: Vec<RenderTrack>,
    assets: AssetStore,
    master_gain: SmoothedGain,
    master_gain_scratch: Vec<f32>,
}

impl Engine {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            project: ProjectState { sample_rate, tracks: Vec::new(), clips: Vec::new() },
            transport: Transport::new(sample_rate),
            tracks: Vec::new(),
            assets: AssetStore::default(),
            master_gain: SmoothedGain::new(0.0, sample_rate),
            master_gain_scratch: Vec::new(),
        }
    }

    pub fn assets_mut(&mut self) -> &mut AssetStore { &mut self.assets }
    pub fn play(&mut self) { self.transport.play(); }
    pub fn pause(&mut self) { self.transport.pause(); }
    pub fn stop(&mut self) { self.transport.stop(); }
    pub fn seek_seconds(&mut self, seconds: f64) { self.transport.seek_seconds(seconds); }
    pub fn set_master_gain(&mut self, gain_db: f32) { self.master_gain.set_target(gain_db); }
    pub fn set_track_gain(&mut self, track_id: &str, gain_db: f32) {
        if let Some(track) = self.tracks.iter_mut().find(|track| track.id == track_id) {
            track.gain.set_target(gain_db);
        }
    }
    pub fn set_track_pan(&mut self, track_id: &str, pan: f32) {
        if let Some(track) = self.tracks.iter_mut().find(|track| track.id == track_id) {
            track.pan.set_target(pan);
        }
    }

    pub fn load_project(&mut self, project: Project) {
        self.master_gain = SmoothedGain::new(project.master_gain_db, self.sample_rate);
        self.project = ProjectState {
            sample_rate: project.sample_rate,
            tracks: project.tracks,
            clips: project.clips,
        };
        self.rebuild_render_graph();
    }

    pub fn apply_update(&mut self, update: ProjectUpdate) {
        match update {
            ProjectUpdate::Replace(project) => self.load_project(project),
            ProjectUpdate::SetTrack(track) => {
                if let Some(existing) = self.project.tracks.iter_mut().find(|item| item.id == track.id) {
                    *existing = track.clone();
                } else {
                    self.project.tracks.push(track.clone());
                }
                if let Some(existing) = self.tracks.iter_mut().find(|item| item.id == track.id) {
                    existing.update_from(&track);
                } else {
                    self.tracks.push(RenderTrack::new(track, self.sample_rate));
                }
            }
            ProjectUpdate::RemoveTrack(track_id) => {
                self.project.tracks.retain(|track| track.id != track_id);
                self.project.clips.retain(|clip| clip.track_id != track_id);
                self.tracks.retain(|track| track.id != track_id);
            }
            ProjectUpdate::SetClip(clip) => {
                if let Some(existing) = self.project.clips.iter_mut().find(|item| item.id == clip.id) {
                    *existing = clip;
                } else {
                    self.project.clips.push(clip);
                }
                self.rebuild_render_graph();
            }
            ProjectUpdate::RemoveClip(clip_id) => {
                self.project.clips.retain(|clip| clip.id != clip_id);
                for track in &mut self.tracks { track.clips.retain(|clip| clip.id != clip_id); }
            }
        }
    }

    fn rebuild_render_graph(&mut self) {
        self.tracks = build_render_tracks(self.project.tracks.clone(), self.project.clips.clone(), self.sample_rate);
    }

    pub fn process(&mut self, left: &mut [f32], right: &mut [f32]) {
        left.fill(0.0);
        right.fill(0.0);
        if !self.transport.is_playing() { return; }

        let any_solo = self.tracks.iter().any(|track| track.solo);
        let render_to_project = self.project.sample_rate as f64 / self.sample_rate as f64;
        let start = self.transport.position_samples();

        self.master_gain_scratch.resize(left.len(), 0.0);
        for gain in &mut self.master_gain_scratch {
            *gain = self.master_gain.next_gain();
        }

        for track in &mut self.tracks {
            let audible = if any_solo { track.solo } else { !track.muted };
            if !audible {
                track.advance_parameters(left.len());
                continue;
            }

            for frame in 0..left.len() {
                let project_sample = ((start + frame as u64) as f64 * render_to_project).floor() as u64;
                let track_gain = track.gain.next_gain();
                let (left_pan, right_pan) = track.pan.next_gains();
                let master_gain = self.master_gain_scratch[frame];

                for clip in &track.clips {
                    if project_sample < clip.start_samples { break; }
                    let clip_offset = project_sample - clip.start_samples;
                    if clip_offset >= clip.duration_samples { continue; }
                    let Some(asset) = self.assets.get(&clip.asset_id) else { continue; };
                    let source_project_sample = clip.source_start_samples + clip_offset;
                    let source_sample = ((source_project_sample as f64 * asset.sample_rate as f64) / self.project.sample_rate as f64).floor() as u64;
                    if source_sample >= asset.length_samples { continue; }
                    let index = source_sample as usize;
                    let sample_left = asset.channels.get(0).and_then(|c| c.get(index)).copied().unwrap_or(0.0);
                    let sample_right = asset.channels.get(1).and_then(|c| c.get(index)).copied().unwrap_or(sample_left);
                    let clip_gain = db_to_gain(clip.gain_db);
                    left[frame] += sample_left * clip_gain * track_gain * left_pan * master_gain;
                    right[frame] += sample_right * clip_gain * track_gain * right_pan * master_gain;
                }
            }
        }
        self.transport.advance(left.len() as u64);
    }
}

fn build_render_tracks(tracks: Vec<Track>, clips: Vec<Clip>, sample_rate: f32) -> Vec<RenderTrack> {
    let mut render_tracks: Vec<_> = tracks.into_iter().map(|track| RenderTrack::new(track, sample_rate)).collect();
    for clip in clips {
        if let Some(track) = render_tracks.iter_mut().find(|track| track.id == clip.track_id) {
            track.clips.push(clip.into());
        }
    }
    for track in &mut render_tracks { track.clips.sort_by_key(|clip| clip.start_samples); }
    render_tracks
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::Asset;

    fn track(id: &str) -> Track {
        Track { id: id.to_owned(), muted: false, solo: false, gain_db: 0.0, pan: 0.0 }
    }

    fn clip(track_id: &str, start_samples: u64) -> Clip {
        Clip {
            id: format!("clip-{start_samples}"),
            track_id: track_id.to_owned(),
            asset_id: "asset".to_owned(),
            start_samples,
            duration_samples: 4,
            source_start_samples: 0,
            gain_db: 0.0,
        }
    }

    #[test]
    fn load_project_groups_and_sorts_clips_by_track() {
        let mut engine = Engine::new(48_000.0);
        engine.load_project(Project {
            sample_rate: 48_000.0,
            tracks: vec![track("a"), track("b")],
            clips: vec![clip("b", 20), clip("a", 10), clip("a", 5)],
            master_gain_db: 0.0,
        });

        assert_eq!(engine.tracks[0].clips.iter().map(|clip| clip.start_samples).collect::<Vec<_>>(), vec![5, 10]);
        assert_eq!(engine.tracks[1].clips.iter().map(|clip| clip.start_samples).collect::<Vec<_>>(), vec![20]);
    }

    #[test]
    fn muted_track_does_not_render() {
        let mut engine = Engine::new(48_000.0);
        let mut muted = track("a");
        muted.muted = true;
        engine.load_project(Project { sample_rate: 48_000.0, tracks: vec![muted], clips: vec![clip("a", 0)], master_gain_db: 0.0 });
        engine.assets_mut().insert("asset".to_owned(), Asset { sample_rate: 48_000.0, channels: vec![vec![1.0; 4]], length_samples: 4 });
        engine.play();

        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        engine.process(&mut left, &mut right);

        assert_eq!(left, [0.0; 4]);
        assert_eq!(right, [0.0; 4]);
    }

    #[test]
    fn solo_track_takes_precedence_over_mute_state() {
        let mut engine = Engine::new(48_000.0);
        let mut muted = track("a");
        muted.muted = true;
        let mut solo = track("b");
        solo.solo = true;
        engine.load_project(Project {
            sample_rate: 48_000.0,
            tracks: vec![muted, solo],
            clips: vec![clip("a", 0), Clip { id: "solo".to_owned(), track_id: "b".to_owned(), asset_id: "asset".to_owned(), start_samples: 0, duration_samples: 4, source_start_samples: 0, gain_db: 0.0 }],
            master_gain_db: 0.0,
        });
        engine.assets_mut().insert("asset".to_owned(), Asset { sample_rate: 48_000.0, channels: vec![vec![1.0; 4]], length_samples: 4 });
        engine.play();

        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        engine.process(&mut left, &mut right);

        for sample in left {
            assert_approx(sample, std::f32::consts::FRAC_1_SQRT_2);
        }
    }

    #[test]
    fn source_offset_reads_from_offset_inside_asset() {
        let mut engine = Engine::new(48_000.0);
        engine.load_project(Project {
            sample_rate: 48_000.0,
            tracks: vec![track("a")],
            clips: vec![Clip { id: "offset".to_owned(), track_id: "a".to_owned(), asset_id: "asset".to_owned(), start_samples: 0, duration_samples: 2, source_start_samples: 2, gain_db: 0.0 }],
            master_gain_db: 0.0,
        });
        engine.assets_mut().insert("asset".to_owned(), Asset { sample_rate: 48_000.0, channels: vec![vec![0.0, 0.0, 0.5, 1.0]], length_samples: 4 });
        engine.play();

        let mut left = [0.0; 2];
        let mut right = [0.0; 2];
        engine.process(&mut left, &mut right);

        assert_approx(left[0], 0.5 * std::f32::consts::FRAC_1_SQRT_2);
        assert_approx(left[1], std::f32::consts::FRAC_1_SQRT_2);
    }

    #[test]
    fn seek_starts_rendering_at_requested_position() {
        let mut engine = Engine::new(48_000.0);
        engine.load_project(Project { sample_rate: 48_000.0, tracks: vec![track("a")], clips: vec![clip("a", 48_000)], master_gain_db: 0.0 });
        engine.assets_mut().insert("asset".to_owned(), Asset { sample_rate: 48_000.0, channels: vec![vec![1.0; 4]], length_samples: 4 });
        engine.seek_seconds(1.0);
        engine.play();

        let mut left = [0.0; 1];
        let mut right = [0.0; 1];
        engine.process(&mut left, &mut right);

        assert_approx(left[0], std::f32::consts::FRAC_1_SQRT_2);
    }

    fn assert_approx(actual: f32, expected: f32) {
        assert!((actual - expected).abs() < 0.0001, "expected {expected}, got {actual}");
    }
}
