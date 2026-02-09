import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  calculateTimeFromX,
  calculateTrackIndexFromY,
  clientToCanvasPosition,
  isInTrackArea,
  secondsToSamples,
} from "@/lib/timelineCalculations";
import { useZero } from "@rocicorp/zero/react";
import { registerUpload, unregisterUpload } from "@/lib/uploadRegistry";
import { generateWaveformBinary } from "@/lib/waveformGenerator";
import { useUndoStore } from "@/stores/undoStore";
import { createClipCommand } from "@/commands/clipCommands";
import { useSyncRef } from "./useSyncRef";
import { useZeroAudioFiles } from "./useZeroAudioFiles";
import { env } from "@el-audio-daw/env/web";

// Audio file constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/aiff",
  "audio/x-aiff",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/vorbis",
];

function isSupportedAudioType(mimeType: string): boolean {
  return SUPPORTED_AUDIO_TYPES.includes(mimeType.toLowerCase());
}

interface Track {
  _id: string;
  name: string;
  order: number;
  muted: boolean;
  solo: boolean;
  gain: number;
}

interface DropTarget {
  trackId: string;
  trackIndex: number;
  dropTimeInSamples: number;
}

interface UseTimelineFileDropOptions {
  /** Canvas element ref for getBoundingClientRect calculations */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Container element ref for drag leave boundary checking */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Array of tracks to calculate drop positions */
  tracks: Track[];
  /** Horizontal scroll position in pixels */
  scrollLeft: number;
  /** Vertical scroll position in pixels */
  scrollTop: number;
  /** Zoom level in pixels per second */
  pixelsPerSecond: number;
  /** Project sample rate */
  sampleRate: number;
  /** Project ID for creating clips */
  projectId: string;
  /** Height of the ruler in pixels */
  rulerHeight: number;
  /** Height of each track in pixels */
  trackHeight: number;
}

interface UseTimelineFileDropReturn {
  /** Whether a file is being dragged over the timeline */
  isDraggingFile: boolean;
  /** Current drop target position */
  dropTarget: DropTarget | null;
  /** Whether a file is currently uploading */
  isUploading: boolean;
  /** Handle drag enter event */
  handleDragEnter: (e: React.DragEvent) => void;
  /** Handle drag over event */
  handleDragOver: (e: React.DragEvent) => void;
  /** Handle drag leave event */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Handle drop event */
  handleDrop: (e: React.DragEvent) => Promise<void>;
}

interface UploadResponse {
  uploadUrl: string;
  storageUrl: string;
  key: string;
}

/**
 * Request a presigned upload URL from the API.
 */
async function requestUploadUrl(
  projectId: string,
  filename: string,
  contentType: string,
): Promise<UploadResponse> {
  const response = await fetch(`${env.VITE_BETTER_AUTH_URL}/api/storage/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ projectId, filename, contentType }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to get upload URL");
  }

  return response.json();
}

/**
 * Hook to manage file drag-and-drop for timeline clip creation.
 * Handles file validation, audio decoding, upload to R2, and clip creation.
 */
export function useTimelineFileDrop({
  canvasRef,
  containerRef,
  tracks,
  scrollLeft,
  scrollTop,
  pixelsPerSecond,
  sampleRate,
  projectId,
  rulerHeight,
  trackHeight,
}: UseTimelineFileDropOptions): UseTimelineFileDropReturn {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Zero mutations for audio files and clips
  const { createAudioFile, updateWaveform } = useZeroAudioFiles(projectId);
  const z = useZero();
  const pushUndo = useUndoStore((s) => s.push);

  // Store current values in refs for stable callbacks
  const scrollLeftRef = useSyncRef(scrollLeft);
  const scrollTopRef = useSyncRef(scrollTop);
  const pixelsPerSecondRef = useSyncRef(pixelsPerSecond);

  // Calculate drop position from mouse coordinates
  const calculateDropPosition = useCallback(
    (clientX: number, clientY: number): DropTarget | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || tracks.length === 0) return null;

      const { canvasX, canvasY } = clientToCanvasPosition(clientX, clientY, rect);

      // Check if in track area (below ruler)
      if (!isInTrackArea(canvasY, rulerHeight)) return null;

      // Calculate track index from Y position
      const layoutParams = {
        rulerHeight,
        trackHeight,
        scrollTop: scrollTopRef.current,
        scrollLeft: scrollLeftRef.current,
        pixelsPerSecond: pixelsPerSecondRef.current,
      };
      const trackIndex = calculateTrackIndexFromY(canvasY, layoutParams);
      if (trackIndex < 0 || trackIndex >= tracks.length) return null;

      const track = tracks[trackIndex];
      if (!track) return null;

      // Calculate time from X position
      const timeInSeconds = calculateTimeFromX(canvasX, layoutParams);
      const dropTimeInSamples = Math.max(0, secondsToSamples(timeInSeconds, sampleRate));

      return {
        trackId: track._id,
        trackIndex,
        dropTimeInSamples,
      };
    },
    [canvasRef, tracks, sampleRate, rulerHeight, trackHeight],
  );

  // Check if file is a supported audio type
  const isAudioFile = useCallback((file: File): boolean => {
    return isSupportedAudioType(file.type);
  }, []);

  // Decode audio file to get duration, channel count, and AudioBuffer for waveform generation
  const decodeAudioFile = useCallback(
    async (
      file: File,
    ): Promise<{
      durationInSamples: number;
      fileSampleRate: number;
      channels: number;
      audioBuffer: AudioBuffer;
    }> => {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate });
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return {
          durationInSamples: audioBuffer.length,
          fileSampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels,
          audioBuffer,
        };
      } finally {
        await audioContext.close();
      }
    },
    [sampleRate],
  );

  // Handle file drop and upload
  const handleFileDrop = useCallback(
    async (file: File, dropPosition: DropTarget) => {
      // Client-side validation
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `File too large. Maximum size is 100MB, got ${Math.round(file.size / 1024 / 1024)}MB`,
        );
        return;
      }

      if (!isAudioFile(file)) {
        toast.error("Unsupported audio format. Supported formats: WAV, MP3, AIFF, FLAC, OGG");
        return;
      }

      const trackId = dropPosition.trackId;

      // Register this upload with the upload registry for cancellation support
      const abortController = registerUpload(trackId, file.name);

      setIsUploading(true);

      try {
        // Decode audio to get duration, channel count, and AudioBuffer for waveform
        const { durationInSamples, fileSampleRate, channels, audioBuffer } =
          await decodeAudioFile(file);

        // Show warning if sample rates differ
        if (fileSampleRate !== sampleRate) {
          toast.warning(
            `Sample rate mismatch: file is ${fileSampleRate}Hz, project is ${sampleRate}Hz. Playback may be affected.`,
          );
        }

        // Check if aborted before starting upload
        if (abortController.signal.aborted) {
          return;
        }

        // Request presigned upload URL from API
        const { uploadUrl, storageUrl } = await requestUploadUrl(projectId, file.name, file.type);

        // Check if aborted before uploading
        if (abortController.signal.aborted) {
          return;
        }

        // Upload file directly to R2 using presigned URL
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
          signal: abortController.signal,
        });

        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }

        // Check if aborted after upload but before audioFile creation
        if (abortController.signal.aborted) {
          return;
        }

        // Create audio file record via Zero
        const clipName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        const audioFileId = await createAudioFile({
          projectId,
          storageUrl,
          name: clipName,
          duration: durationInSamples,
          sampleRate: fileSampleRate,
          channels,
        });

        // Check if aborted after audioFile creation but before clip creation
        if (abortController.signal.aborted) {
          return;
        }

        // Create clip record referencing the audio file
        const clipSnapshot = {
          id: crypto.randomUUID(),
          projectId,
          trackId,
          audioFileId,
          name: clipName,
          startTime: dropPosition.dropTimeInSamples,
          duration: durationInSamples,
          audioStartTime: 0,
          gain: 0,
        };
        const cmd = createClipCommand(z, clipSnapshot);
        await cmd.execute();
        pushUndo(cmd);

        toast.success(`Added "${clipName}" to timeline`);

        // Generate and upload waveform in background (don't await)
        (async () => {
          try {
            // Generate waveform binary from AudioBuffer
            const waveformBinary = generateWaveformBinary(audioBuffer);

            // Request presigned URL for waveform upload
            const waveformFilename = `${clipName}.waveform`;
            const { uploadUrl: waveformUploadUrl, storageUrl: waveformStorageUrl } =
              await requestUploadUrl(projectId, waveformFilename, "application/octet-stream");

            // Upload waveform to R2
            const waveformResponse = await fetch(waveformUploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: waveformBinary,
            });

            if (!waveformResponse.ok) {
              throw new Error("Waveform upload failed");
            }

            // Update audio file with waveform URL via Zero
            await updateWaveform(audioFileId, waveformStorageUrl);
          } catch (error) {
            console.warn("Waveform generation failed:", error);
            // Don't show error to user - waveform is optional
          }
        })();
      } catch (error) {
        // Don't show error toast for intentional cancellation (AbortError)
        if (error instanceof Error && error.name === "AbortError") {
          // Intentional cancellation - no error toast needed
          return;
        }
        console.error("Failed to upload audio file:", error);
        toast.error(error instanceof Error ? error.message : "Failed to upload audio file");
      } finally {
        // Always unregister the upload when done
        unregisterUpload(trackId, abortController);
        setIsUploading(false);
      }
    },
    [
      isAudioFile,
      decodeAudioFile,
      createAudioFile,
      z,
      pushUndo,
      updateWaveform,
      projectId,
      sampleRate,
    ],
  );

  // Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!e.dataTransfer.types.includes("Files")) return;

      e.dataTransfer.dropEffect = "copy";
      setIsDraggingFile(true);

      // Calculate and update drop target
      const target = calculateDropPosition(e.clientX, e.clientY);
      setDropTarget(target);
    },
    [calculateDropPosition],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Only clear if leaving the container entirely
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        setIsDraggingFile(false);
        setDropTarget(null);
      }
    },
    [containerRef],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDraggingFile(false);

      const files = Array.from(e.dataTransfer.files);
      const audioFile = files.find((f) => isAudioFile(f));

      if (!audioFile) {
        toast.error("No supported audio file found. Supported formats: WAV, MP3, AIFF, FLAC, OGG");
        setDropTarget(null);
        return;
      }

      const target = calculateDropPosition(e.clientX, e.clientY);
      setDropTarget(null);

      if (!target) {
        toast.error("Please drop the file on a track lane");
        return;
      }

      await handleFileDrop(audioFile, target);
    },
    [isAudioFile, calculateDropPosition, handleFileDrop],
  );

  return {
    isDraggingFile,
    dropTarget,
    isUploading,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
