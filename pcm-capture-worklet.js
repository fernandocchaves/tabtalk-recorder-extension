class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input[0] && input[0].length > 0) {
      const samples = new Float32Array(input[0]);
      this.port.postMessage({ type: "pcm", samples }, [samples.buffer]);
    }

    // Keep output silent while keeping the node in the render graph.
    if (output) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
