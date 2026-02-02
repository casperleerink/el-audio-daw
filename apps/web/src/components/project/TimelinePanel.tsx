import { useEditorStore } from "@/stores/editorStore";
import { useProjectId, useSampleRate } from "@/stores/projectStore";
import { useAudioStore } from "@/stores/audioStore";
import { useProjectData } from "@/hooks/project/useProjectData";
import { useProjectClips } from "@/hooks/project/useProjectClips";
import { TimelineCanvas } from "./TimelineCanvas";

interface TimelinePanelProps {
  scrollTop: number;
  onScrollChange: (scrollTop: number) => void;
}

export function TimelinePanel({ scrollTop, onScrollChange }: TimelinePanelProps) {
  const projectId = useProjectId();
  const sampleRate = useSampleRate();

  const { tracks, waveformUrls } = useProjectData();
  const { clips, getAudioFileDuration } = useProjectClips();
  const seek = useAudioStore((s) => s.seek);

  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const { selectClip, toggleClipSelection, clearClipSelection } = useEditorStore();

  if (!projectId) return null;

  return (
    <div className="flex flex-1 flex-col">
      <TimelineCanvas
        tracks={tracks.map((t) => ({ _id: t.id, name: t.name }))}
        clips={clips.map((clip) => ({
          _id: clip.id,
          trackId: clip.trackId,
          audioFileId: clip.audioFileId,
          name: clip.name,
          startTime: clip.startTime,
          duration: clip.duration,
          audioStartTime: clip.audioStartTime,
          pending: false,
        }))}
        sampleRate={sampleRate}
        scrollTop={scrollTop}
        onScrollChange={onScrollChange}
        onSeek={seek}
        projectId={projectId}
        selectedClipIds={selectedClipIds}
        onSelectClip={selectClip}
        onToggleClipSelection={toggleClipSelection}
        onClearSelection={clearClipSelection}
        getAudioFileDuration={getAudioFileDuration}
        waveformUrls={waveformUrls}
      />
    </div>
  );
}
