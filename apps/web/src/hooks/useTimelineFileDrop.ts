import type { Id } from "@el-audio-daw/backend/convex/_generated/dataModel";
import { api } from "@el-audio-daw/backend/convex/_generated/api";
import { isSupportedAudioType, MAX_FILE_SIZE } from "@el-audio-daw/backend/convex/constants";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  calculateTimeFromX,
  calculateTrackIndexFromY,
  clientToCanvasPosition,
  isInTrackArea,
  secondsToSamples,
} from "@/lib/timelineCalculations";
import { registerUpload, unregisterUpload } from "@/lib/uploadRegistry";
import { generateWaveformBinary } from "@/lib/waveformGenerator";
import { useSyncRef } from "./useSyncRef";

interface Track {
  _id: Id<"tracks">;
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
  projectId: Id<"projects">;
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

/**
 * Hook to manage file drag-and-drop for timeline clip creation.
 * Handles file validation, audio decoding, upload, and clip creation.
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

  // Mutations for file upload
  const generateUploadUrl = useMutation(api.clips.generateUploadUrl);
  const validateUploadedFile = useMutation(api.clips.validateUploadedFile);
  const createAudioFile = useMutation(api.audioFiles.createAudioFile);
  const createClip = useMutation(api.clips.createClip);
  const updateWaveformStorageId = useMutation(api.audioFiles.updateWaveformStorageId);

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

      const trackId = dropPosition.trackId as Id<"tracks">;

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

        // Generate upload URL
        const uploadUrl = await generateUploadUrl({ projectId });

        // Check if aborted before starting fetch
        if (abortController.signal.aborted) {
          return;
        }

        // Upload file to Convex storage with AbortController signal
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };

        // Check if aborted after upload but before validation
        if (abortController.signal.aborted) {
          return;
        }

        // Validate uploaded file
        await validateUploadedFile({
          storageId,
          projectId,
          contentType: file.type,
          size: file.size,
        });

        // Check if aborted after validation but before audioFile creation
        if (abortController.signal.aborted) {
          return;
        }

        // Create audio file record
        const clipName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        const audioFileId = await createAudioFile({
          projectId,
          storageId,
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
        await createClip({
          projectId,
          trackId,
          audioFileId,
          name: clipName,
          startTime: dropPosition.dropTimeInSamples,
          duration: durationInSamples,
        });

        toast.success(`Added "${clipName}" to timeline`);

        // Generate and upload waveform in background (don't await)
        (async () => {
          try {
            // Generate waveform binary from AudioBuffer
            const waveformBinary = generateWaveformBinary(audioBuffer);

            // Get upload URL for waveform
            const waveformUploadUrl = await generateUploadUrl({ projectId });

            // Upload waveform to storage
            const waveformResponse = await fetch(waveformUploadUrl, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: waveformBinary,
            });

            if (!waveformResponse.ok) {
              throw new Error("Waveform upload failed");
            }

            const { storageId: waveformStorageId } = (await waveformResponse.json()) as {
              storageId: Id<"_storage">;
            };

            // Update audio file with waveform storage ID
            await updateWaveformStorageId({ audioFileId, waveformStorageId });
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
      generateUploadUrl,
      validateUploadedFile,
      createAudioFile,
      createClip,
      updateWaveformStorageId,
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
