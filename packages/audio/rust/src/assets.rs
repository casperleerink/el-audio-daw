use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Asset {
    pub sample_rate: f32,
    pub channels: Vec<Vec<f32>>,
    pub length_samples: u64,
}

#[derive(Default, Debug)]
pub struct AssetStore {
    assets: HashMap<String, Asset>,
}

impl AssetStore {
    pub fn insert(&mut self, id: String, asset: Asset) {
        self.assets.insert(id, asset);
    }

    pub fn remove(&mut self, id: &str) {
        self.assets.remove(id);
    }

    pub fn get(&self, id: &str) -> Option<&Asset> {
        self.assets.get(id)
    }

}
