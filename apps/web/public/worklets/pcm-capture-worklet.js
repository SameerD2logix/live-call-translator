/**
 * AudioWorklet: microphone -> 16 kHz mono PCM16 frames for the gateway.
 *
 * Runs on the real-time audio thread: no per-sample allocation, no I/O.
 * Posts { type: "frame", pcm: ArrayBuffer, rms: number } every `frameMs` (default 100 ms).
 * While muted it posts silence (zeros) so the speech service can still close the sentence.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    const targetRate = opts.targetSampleRate || 16000;
    const frameMs = opts.frameMs || 100;

    // `sampleRate` is a global here: the AudioContext's rate (usually 44100 or 48000).
    this.ratio = sampleRate / targetRate;
    this.frameLength = Math.round((targetRate * frameMs) / 1000);
    this.frame = new Int16Array(this.frameLength);
    this.frameIndex = 0;
    this.sumSquares = 0;

    // Resampler state: average the input samples that fall into each output sample.
    this.acc = 0;
    this.accCount = 0;
    this.phase = 0;

    this.muted = false;
    this.failed = sampleRate < targetRate;
    if (this.failed) {
      this.port.postMessage({ type: "error", message: `Input rate ${sampleRate} Hz is below ${targetRate} Hz.` });
    }

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "mute") this.muted = Boolean(event.data.muted);
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (this.failed || !input || input.length === 0) return true;

    const channels = input.length;
    const length = input[0].length;
    for (let i = 0; i < length; i++) {
      // Down-mix to mono.
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += input[c][i];
      sample /= channels;

      // Box-filter decimation (simple low-pass + downsample; good enough for speech).
      this.acc += sample;
      this.accCount += 1;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        this.push(this.muted ? 0 : this.acc / this.accCount);
        this.acc = 0;
        this.accCount = 0;
      }
    }
    return true;
  }

  push(value) {
    const s = value > 1 ? 1 : value < -1 ? -1 : value;
    this.frame[this.frameIndex++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.sumSquares += s * s;

    if (this.frameIndex === this.frameLength) {
      const rms = Math.sqrt(this.sumSquares / this.frameLength);
      const pcm = this.frame.buffer;
      this.port.postMessage({ type: "frame", pcm, rms }, [pcm]); // transfer, no copy
      this.frame = new Int16Array(this.frameLength);
      this.frameIndex = 0;
      this.sumSquares = 0;
    }
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
