// Keep one output track for the entire recording: adding/removing tracks after
// MediaRecorder starts can interrupt it. A silent source keeps muted audio valid.
export class RecordingAudio {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private silence: ConstantSourceNode | null = null;
  private microphone: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private generation = 0;

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.microphone = stream;
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
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
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
