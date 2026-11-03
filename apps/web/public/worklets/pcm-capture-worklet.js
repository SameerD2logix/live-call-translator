/**
 * AudioWorklet: microphone -> 16 kHz mono PCM16 frames for the gateway.
 *
 * Runs on the real-time audio thread: no per-sample allocation, no I/O.
 * Posts { type: "frame", pcm: ArrayBuffer, rms: number } every `frameMs` (default 100 ms).
 * While muted it posts silence (zeros) so the speech service can still close the sentence.
 *
 * Noise gate (Phase 4, on by default, toggled with { type: "gate", enabled }):
 * audio is judged in 20 ms windows against an adaptive estimate of the room's noise floor.
 * Windows that are only background noise are replaced with true silence, so speech
 * recognition neither "hears" words in the noise nor waits longer to end a sentence.
 * It opens fast (and includes the 20 ms before, so the start of a word isn't cut) and stays
 * open 400 ms after speech, so word endings and short pauses aren't clipped. Adds ~40 ms delay.
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

    // Noise gate state (see header). Windows are 20 ms at the target rate.
    this.gateEnabled = opts.gate !== false;
    this.windowLength = Math.round(targetRate * 0.02);
    this.window = new Float32Array(this.windowLength);
    this.previous = new Float32Array(this.windowLength);
    this.windowIndex = 0;
    this.havePrevious = false;
    this.previousOpen = false;
    this.gateOpen = false;
    this.hangover = 0;
    this.hangoverWindows = 20; // 400 ms
    this.noiseFloor = 0.003;

    this.failed = sampleRate < targetRate;
    if (this.failed) {
      this.port.postMessage({ type: "error", message: `Input rate ${sampleRate} Hz is below ${targetRate} Hz.` });
    }

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "mute") this.muted = Boolean(data.muted);
      if (data.type === "gate") this.gateEnabled = Boolean(data.enabled);
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
        this.gate(this.muted ? 0 : this.acc / this.accCount);
        this.acc = 0;
        this.accCount = 0;
      }
    }
    return true;
  }

  /** Collects 20 ms windows and lets speech through, replacing noise-only windows with silence. */
  gate(value) {
    if (!this.gateEnabled) {
      if (this.havePrevious) this.flushPrevious(true); // don't drop audio held when the gate was switched off
      this.push(value);
      return;
    }
    this.window[this.windowIndex++] = value;
    if (this.windowIndex < this.windowLength) return;
    this.windowIndex = 0;

    let sum = 0;
    for (let i = 0; i < this.windowLength; i++) sum += this.window[i] * this.window[i];
    const rms = Math.sqrt(sum / this.windowLength);

    const openAt = Math.max(this.noiseFloor * 3.5, 0.006);
    const stayOpenAt = Math.max(this.noiseFloor * 2, 0.004);
    const voiced = rms > openAt || (this.gateOpen && rms > stayOpenAt);
    const opening = voiced && !this.gateOpen;
    if (voiced) {
      this.gateOpen = true;
      this.hangover = this.hangoverWindows;
    } else if (this.gateOpen && --this.hangover <= 0) {
      this.gateOpen = false;
    }

    // Track the noise floor: follow quiet moments quickly, rise very slowly (much slower while
    // someone is speaking, so a long sentence doesn't teach the gate that speech is "noise").
    const rise = this.gateOpen ? 0.0005 : 0.01;
    this.noiseFloor += (rms - this.noiseFloor) * (rms < this.noiseFloor ? 0.2 : rise);

    // Emit the PREVIOUS window (one window of look-ahead): when the gate opens now, the window
    // before it is let through too, so the first sound of a word isn't lost.
    if (this.havePrevious) this.flushPrevious(this.previousOpen || opening);
    const swap = this.previous;
    this.previous = this.window;
    this.window = swap;
    this.havePrevious = true;
    this.previousOpen = this.gateOpen;
  }

  flushPrevious(open) {
    for (let i = 0; i < this.windowLength; i++) this.push(open ? this.previous[i] : 0);
    this.havePrevious = false;
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
