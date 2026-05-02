pub trait AudioNode {
    fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]);
    fn set_enabled(&mut self, enabled: bool);
    fn is_enabled(&self) -> bool;
}

#[derive(Default)]
pub struct EffectChain {
    nodes: Vec<Box<dyn AudioNode>>,
}

impl EffectChain {
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        for node in &mut self.nodes {
            if node.is_enabled() {
                node.process_stereo(left, right);
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}
