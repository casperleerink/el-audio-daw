#[derive(Clone, Debug)]
pub struct Transport {
    position_samples: u64,
    playing: bool,
    sample_rate: f32,
}

impl Transport {
    pub fn new(sample_rate: f32) -> Self {
        Self { position_samples: 0, playing: false, sample_rate }
    }

    pub fn play(&mut self) { self.playing = true; }
    pub fn pause(&mut self) { self.playing = false; }
    pub fn stop(&mut self) { self.playing = false; self.position_samples = 0; }
    pub fn seek_seconds(&mut self, seconds: f64) {
        self.position_samples = (seconds.max(0.0) * self.sample_rate as f64) as u64;
    }
    pub fn advance(&mut self, samples: u64) { self.position_samples += samples; }
    pub fn position_samples(&self) -> u64 { self.position_samples }
    pub fn is_playing(&self) -> bool { self.playing }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_resets_position() {
        let mut transport = Transport::new(48_000.0);
        transport.seek_seconds(1.0);
        transport.play();
        transport.stop();
        assert_eq!(transport.position_samples(), 0);
        assert!(!transport.is_playing());
    }
}
