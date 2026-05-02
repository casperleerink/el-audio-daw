pub fn db_to_gain(db: f32) -> f32 {
    if db <= -60.0 {
        0.0
    } else if db > 0.0 && db <= 2.0 {
        db
    } else {
        10.0_f32.powf(db / 20.0)
    }
}

#[derive(Clone, Debug)]
pub struct SmoothedGain {
    current_db: f32,
    target_db: f32,
    step_db: f32,
    samples_remaining: u32,
    smoothing_samples: u32,
}

impl SmoothedGain {
    pub fn new(db: f32, sample_rate: f32) -> Self {
        let smoothing_samples = (sample_rate * 0.02).max(1.0) as u32;
        Self {
            current_db: db,
            target_db: db,
            step_db: 0.0,
            samples_remaining: 0,
            smoothing_samples,
        }
    }

    pub fn set_target(&mut self, db: f32) {
        self.target_db = db;
        self.samples_remaining = self.smoothing_samples;
        self.step_db = (self.target_db - self.current_db) / self.samples_remaining as f32;
    }

    pub fn next_gain(&mut self) -> f32 {
        self.advance();
        db_to_gain(self.current_db)
    }

    pub fn advance(&mut self) {
        if self.samples_remaining > 0 {
            self.current_db += self.step_db;
            self.samples_remaining -= 1;
            if self.samples_remaining == 0 {
                self.current_db = self.target_db;
            }
        }
    }
}
