/**
 * Audio file upload validation constants
 * These are shared between frontend (client-side validation) and backend (server-side validation)
 */

/**
 * Supported audio MIME types for file uploads (FR-5)
 */
export const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/x-aiff",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/vorbis",
] as const;

export type SupportedAudioType = (typeof SUPPORTED_AUDIO_TYPES)[number];

/**
 * Maximum file size for audio uploads: 100MB (FR-6)
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Check if a MIME type is a supported audio format
 */
export function isSupportedAudioType(mimeType: string): mimeType is SupportedAudioType {
  return (SUPPORTED_AUDIO_TYPES as readonly string[]).includes(mimeType);
}
