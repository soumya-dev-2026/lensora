export function getMp4MimeType(isSupported: (type: string) => boolean): string {
  const mimeType = ['video/mp4;codecs=avc1.424028', 'video/mp4;codecs=avc1', 'video/mp4']
    .find(isSupported);
  if (!mimeType) {
    throw new Error('This browser cannot record MP4. Please use a browser with MP4 recording support.');
  }
  return mimeType;
}
