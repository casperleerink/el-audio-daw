use crate::dsp::{gain::SmoothedGain, node::EffectChain, pan::SmoothedPan};
use crate::timeline::RenderClip;

#[derive(Clone, Debug)]
pub struct Track {
    pub id: String,
    pub muted: bool,
    pub solo: bool,
    pub gain_db: f32,
    pub pan: f32,
}

pub struct RenderTrack {
    pub id: String,
    pub muted: bool,
    pub solo: bool,
    pub gain: SmoothedGain,
    pub pan: SmoothedPan,
    pub clips: Vec<RenderClip>,
    #[allow(dead_code)]
    pub effects: EffectChain,
}

impl RenderTrack {
    pub fn new(track: Track, sample_rate: f32) -> Self {
        Self {
            id: track.id,
            muted: track.muted,
            solo: track.solo,
            gain: SmoothedGain::new(track.gain_db, sample_rate),
            pan: SmoothedPan::new(track.pan, sample_rate),
            clips: Vec::new(),
            effects: EffectChain::default(),
        }
    }

    pub fn update_from(&mut self, track: &Track) {
        self.muted = track.muted;
        self.solo = track.solo;
        self.gain.set_target(track.gain_db);
        self.pan.set_target(track.pan);
    }

    pub fn advance_parameters(&mut self, samples: usize) {
        for _ in 0..samples {
            self.gain.advance();
            self.pan.advance();
        }
    }
}
