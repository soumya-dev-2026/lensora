export function getMp4MimeType(isSupported: (type: string) => boolean, audio = false): string {
  const candidates = audio
    ? ['video/mp4;codecs=avc1.424028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
    : ['video/mp4;codecs=avc1.424028', 'video/mp4;codecs=avc1', 'video/mp4'];
  const mimeType = candidates
    .find(isSupported);
  if (!mimeType) {
    throw new Error('This browser cannot record MP4. Please use a browser with MP4 recording support.');
  }
  return mimeType;
}
