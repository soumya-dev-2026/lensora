// Keep one output track for the entire recording: adding/removing tracks after
// MediaRecorder starts can interrupt it. A silent source keeps muted audio valid.
export class RecordingAudio {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private silence: ConstantSourceNode | null = null;
  private microphone: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private generation = 0;
  private noiseUpdates: Promise<boolean> = Promise.resolve(true);

  constructor(private noiseCancellation = true) {}

  setNoiseCancellation(enabled: boolean): Promise<boolean> {
    this.noiseCancellation = enabled;
    // Serialize updates so a slower earlier request cannot override the last choice.
    this.noiseUpdates = this.noiseUpdates.then(async () => {
      const track = this.microphone?.getAudioTracks()[0];
      if (!track) return true;
      if (!track.applyConstraints) return false;
      try {
        await track.applyConstraints({ ...track.getConstraints?.(), noiseSuppression: { ideal: enabled } });
        return track.getSettings?.().noiseSuppression === enabled;
      } catch { return false; }
    });
    return this.noiseUpdates;
  }

  private prepare(): AudioContext {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.destination = context.createMediaStreamDestination();
      this.silence = context.createConstantSource();
      this.silence.offset.value = 0;
      this.silence.connect(this.destination);
      this.silence.start();
    }
    return this.context;
  }

  async resume(): Promise<void> {
    await this.prepare().resume();
  }

  recordingTrack(): MediaStreamTrack {
    this.prepare();
    return this.destination!.stream.getAudioTracks()[0].clone();
  }

  async unmute(): Promise<boolean> {
    const generation = ++this.generation;
    if (!this.microphone) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: { ideal: this.noiseCancellation } } });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.microphone = stream;
      await this.setNoiseCancellation(this.noiseCancellation);
      if (generation !== this.generation) return false;
      try { await this.resume(); }
      catch (error) { if (generation === this.generation) this.mute(); throw error; }
      if (generation !== this.generation) return false;
      this.source = this.context!.createMediaStreamSource(stream);
      this.source.connect(this.destination!);
    }
    this.microphone.getAudioTracks().forEach((track) => { track.enabled = true; });
    return true;
  }

  mute(): void {
    this.generation++;
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.samples = null;
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
  }

  // A monitoring branch only: it never changes the recording destination/track.
  level(): number | null {
    if (!this.source || !this.context || !this.microphone) return 0;
    try {
      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        this.samples = new Float32Array(this.analyser.fftSize);
        this.source.connect(this.analyser);
      }
      this.analyser.getFloatTimeDomainData(this.samples!);
      const rms = Math.sqrt(this.samples!.reduce((sum, sample) => sum + sample * sample, 0) / this.samples!.length);
      return Math.min(1, rms * 4);
    } catch { return null; }
  }

  dispose(): void {
    this.mute();
    this.silence?.stop();
    this.silence?.disconnect();
    this.destination?.stream.getTracks().forEach((track) => track.stop());
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.destination = null;
    this.silence = null;
  }
}
