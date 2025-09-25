// public/audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() { return []; }

  constructor({ processorOptions: { bufferSize } }) {
    super();
    this.size = bufferSize;
    this.buffers = [new Float32Array(this.size), new Float32Array(this.size)];
    this.active = 0;
    this.offset = 0;
    this.mix = null; // temp mix buffer per render quantum
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') this.flush();
    };
  }

  flush() {
    if (this.offset === 0) return;
    const view = this.buffers[this.active].subarray(0, this.offset);
    this.port.postMessage(view, [view.buffer]); // zero-copy
    this.buffers[this.active] = new Float32Array(this.size); // re-alloc
    this.active ^= 1;
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input; // [Float32Array, ...]
    const numCh = channels.length;
    const frames = channels[0]?.length || 0;
    if (!frames) return true;
    // ensure temp mix buffer
    if (!this.mix || this.mix.length !== frames) this.mix = new Float32Array(frames);
    // downmix to mono (avg all channels)
    this.mix.fill(0);
    for (let ch = 0; ch < numCh; ch++) {
      const c = channels[ch];
      for (let i = 0; i < frames; i++) this.mix[i] += c[i];
    }
    const inv = 1 / numCh;
    for (let i = 0; i < frames; i++) this.mix[i] *= inv;
    // write into our ring buffer
    let i = 0;
    while (i < frames) {
      const room = this.size - this.offset;
      const copyLen = Math.min(room, frames - i);
      this.buffers[this.active].set(this.mix.subarray(i, i + copyLen), this.offset);
      this.offset += copyLen;
      i += copyLen;
      if (this.offset === this.size) this.flush();
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);