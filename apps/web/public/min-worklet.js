class TestProcessor extends AudioWorkletProcessor {
  process() {
    return true;
  }
}
registerProcessor("daw-audio-processor", TestProcessor);
