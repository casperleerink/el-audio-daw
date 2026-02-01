import { Slider } from "@/components/ui/slider";
import { formatGain } from "@/lib/formatters";
import { useAudioStore } from "@/stores/audioStore";

export function MasterTrack() {
  const masterGain = useAudioStore((s) => s.masterGain);
  const setMasterGain = useAudioStore((s) => s.setMasterGain);

  return (
    <div className="shrink-0 border-t bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs font-medium">Master</span>
        <Slider
          className="flex-1"
          min={-60}
          max={12}
          step={0.1}
          value={[masterGain]}
          onValueChange={(val) => setMasterGain(Array.isArray(val) ? (val[0] ?? 0) : val)}
        />
        <span className="w-16 text-right font-mono text-xs whitespace-nowrap">
          {formatGain(masterGain)}
        </span>
      </div>
    </div>
  );
}
