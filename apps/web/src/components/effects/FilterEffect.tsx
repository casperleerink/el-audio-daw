import { useOptimisticControl } from "@/hooks/useOptimisticControl";
import { Knob } from "@/components/ui/knob";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";

interface FilterEffectProps {
  cutoff: number;
  resonance: number;
  filterType: FilterType;
  onCutoffChange: (value: number) => void;
  onCutoffCommit: (value: number) => void;
  onResonanceChange: (value: number) => void;
  onResonanceCommit: (value: number) => void;
  onFilterTypeChange: (type: FilterType) => void;
}

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(1)}k`;
  }
  return `${Math.round(hz)}`;
}

export function FilterEffect({
  cutoff,
  resonance,
  filterType,
  onCutoffChange,
  onCutoffCommit,
  onResonanceChange,
  onResonanceCommit,
  onFilterTypeChange,
}: FilterEffectProps) {
  // Optimistic control for cutoff
  const {
    localValue: localCutoff,
    handleChange: handleCutoffChange,
    handleCommit: handleCutoffCommit,
  } = useOptimisticControl({
    serverValue: cutoff,
    onChange: onCutoffChange,
    onCommit: onCutoffCommit,
  });

  // Optimistic control for resonance
  const {
    localValue: localResonance,
    handleChange: handleResonanceChange,
    handleCommit: handleResonanceCommit,
  } = useOptimisticControl({
    serverValue: resonance,
    onChange: onResonanceChange,
    onCommit: onResonanceCommit,
  });

  return (
    <div className="flex flex-col gap-1.5">
      {/* Filter Type Selector */}
      <Select value={filterType} onValueChange={(v) => onFilterTypeChange(v as FilterType)}>
        <SelectTrigger size="sm" className="h-6 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="lowpass">Lowpass</SelectItem>
          <SelectItem value="highpass">Highpass</SelectItem>
          <SelectItem value="bandpass">Bandpass</SelectItem>
          <SelectItem value="notch">Notch</SelectItem>
        </SelectContent>
      </Select>

      {/* Knobs Row */}
      <div className="flex items-center justify-around">
        <div className="flex flex-col items-center gap-0.5">
          <Knob
            value={localCutoff}
            min={20}
            max={20000}
            step={1}
            size={28}
            onChange={handleCutoffChange}
            onCommit={handleCutoffCommit}
          />
          <span className="text-[9px] text-muted-foreground">{formatFrequency(localCutoff)}</span>
          <span className="text-[8px] text-muted-foreground/70">Freq</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Knob
            value={localResonance}
            min={0}
            max={1}
            step={0.01}
            size={28}
            onChange={handleResonanceChange}
            onCommit={handleResonanceCommit}
          />
          <span className="text-[9px] text-muted-foreground">{localResonance.toFixed(2)}</span>
          <span className="text-[8px] text-muted-foreground/70">Res</span>
        </div>
      </div>
    </div>
  );
}
