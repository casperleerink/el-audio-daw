import { useState } from "react";

import { AddEffectDialog } from "@/components/AddEffectDialog";
import { EffectCard } from "@/components/EffectCard";
import { EffectsPanel } from "@/components/EffectsPanel";
import { FilterEffect } from "@/components/effects/FilterEffect";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "@/hooks/project/useProjectData";
import { useProjectEffects } from "@/hooks/project/useProjectEffects";

export function ProjectEffectsPanel() {
  const [addEffectDialogOpen, setAddEffectDialogOpen] = useState(false);

  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const selectedEffectId = useEditorStore((s) => s.selectedEffectId);
  const { selectTrack, selectEffect } = useEditorStore();

  const { tracks } = useProjectData();
  const {
    effects,
    addEffect,
    updateEffectParam,
    toggleEffectEnabled,
    handleEffectDragStart,
    handleEffectDragEnd,
  } = useProjectEffects();

  if (!selectedTrackId) return null;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);

  return (
    <>
      <EffectsPanel
        selectedTrackId={selectedTrackId}
        selectedTrackName={selectedTrack?.name ?? "Track"}
        selectedTrackIndex={tracks.findIndex((t) => t.id === selectedTrackId) ?? 0}
        onClose={() => selectTrack(null)}
        onAddEffect={() => setAddEffectDialogOpen(true)}
      >
        {effects.map((effect) => (
          <EffectCard
            key={effect.id}
            id={effect.id}
            name={effect.effectData.type === "filter" ? "Filter" : "Effect"}
            enabled={effect.enabled ?? true}
            selected={selectedEffectId === effect.id}
            onSelect={() => selectEffect(effect.id)}
            onEnabledChange={(enabled) => toggleEffectEnabled(effect.id, enabled)}
            onDragStart={(e) => handleEffectDragStart(e, effect.id)}
            onDragEnd={handleEffectDragEnd}
          >
            {effect.effectData.type === "filter" && (
              <FilterEffect
                cutoff={effect.effectData.cutoff}
                resonance={effect.effectData.resonance}
                filterType={effect.effectData.filterType}
                onCutoffChange={() => {}}
                onCutoffCommit={(v) =>
                  updateEffectParam(effect.id, {
                    ...effect.effectData,
                    cutoff: v,
                  })
                }
                onResonanceChange={() => {}}
                onResonanceCommit={(v) =>
                  updateEffectParam(effect.id, {
                    ...effect.effectData,
                    resonance: v,
                  })
                }
                onFilterTypeChange={(type) =>
                  updateEffectParam(effect.id, {
                    ...effect.effectData,
                    filterType: type,
                  })
                }
              />
            )}
          </EffectCard>
        ))}
      </EffectsPanel>

      <AddEffectDialog
        open={addEffectDialogOpen}
        onOpenChange={setAddEffectDialogOpen}
        onSelectEffect={addEffect}
      />
    </>
  );
}
