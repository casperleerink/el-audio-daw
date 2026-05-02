#[derive(Clone, Debug)]
pub struct Clip {
    pub id: String,
    pub track_id: String,
    pub asset_id: String,
    pub start_samples: u64,
    pub duration_samples: u64,
    pub source_start_samples: u64,
    pub gain_db: f32,
}

#[derive(Clone, Debug)]
pub struct RenderClip {
    pub id: String,
    pub asset_id: String,
    pub start_samples: u64,
    pub duration_samples: u64,
    pub source_start_samples: u64,
    pub gain_db: f32,
}

impl From<Clip> for RenderClip {
    fn from(clip: Clip) -> Self {
        Self {
            id: clip.id,
            asset_id: clip.asset_id,
            start_samples: clip.start_samples,
            duration_samples: clip.duration_samples,
            source_start_samples: clip.source_start_samples,
            gain_db: clip.gain_db,
        }
    }
}
