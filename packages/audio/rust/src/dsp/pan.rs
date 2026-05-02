#[derive(Clone, Debug)]
pub struct SmoothedPan {
    current: f32,
    target: f32,
    step: f32,
    samples_remaining: u32,
    smoothing_samples: u32,
}

impl SmoothedPan {
    pub fn new(pan: f32, sample_rate: f32) -> Self {
        let smoothing_samples = (sample_rate * 0.02).max(1.0) as u32;
        Self {
            current: pan.clamp(-1.0, 1.0),
            target: pan.clamp(-1.0, 1.0),
            step: 0.0,
            samples_remaining: 0,
            smoothing_samples,
        }
    }

    pub fn set_target(&mut self, pan: f32) {
        self.target = pan.clamp(-1.0, 1.0);
        self.samples_remaining = self.smoothing_samples;
        self.step = (self.target - self.current) / self.samples_remaining as f32;
    }

    pub fn next_gains(&mut self) -> (f32, f32) {
        self.advance();
        pan_gains(self.current)
    }

    pub fn advance(&mut self) {
        if self.samples_remaining > 0 {
            self.current += self.step;
            self.samples_remaining -= 1;
            if self.samples_remaining == 0 {
                self.current = self.target;
            }
        }
    }
}

pub fn pan_gains(pan: f32) -> (f32, f32) {
    let pan_angle = ((pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::PI) / 4.0;
    (pan_angle.cos(), pan_angle.sin())
}
