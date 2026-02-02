import { useCallback, useEffect, useMemo } from "react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";
import { useEffectReorder } from "@/hooks/useEffectReorder";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectData } from "./useProjectData";

type FilterEffectData = {
  type: "filter";
  cutoff: number;
  resonance: number;
  filterType: "lowpass" | "highpass" | "bandpass" | "notch";
};

/**
 * Hook for effect operations in the project editor.
 * Provides CRUD operations and reorder for track effects.
 */
export function useProjectEffects() {
  const z = useZero();
  const { tracks } = useProjectData();

  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const selectedEffectId = useEditorStore((s) => s.selectedEffectId);
  const { selectEffect } = useEditorStore();

  // Effects for selected track (from the already-loaded tracks data)
  const effects = useMemo(() => {
    if (!selectedTrackId) return [];
    const track = tracks.find((t) => t.id === selectedTrackId);
    return track?.effects ?? [];
  }, [tracks, selectedTrackId]);

  // All effects for audio engine (flattened from all tracks)
  const allProjectEffects = useMemo(() => {
    return tracks.flatMap((t) => t.effects ?? []);
  }, [tracks]);

  // Transform effects for audio engine
  const effectsForEngine = useMemo(
    () =>
      allProjectEffects.map((e) => ({
        id: e.id,
        trackId: e.trackId,
        order: e.order,
        enabled: e.enabled ?? true,
        effectData: e.effectData,
      })),
    [allProjectEffects],
  );

  // Handle adding an effect
  const addEffect = useCallback(
    async (type: "filter") => {
      if (!selectedTrackId) return;

      const defaultEffectData: FilterEffectData | null =
        type === "filter"
          ? {
              type: "filter" as const,
              cutoff: 1000,
              resonance: 0.5,
              filterType: "lowpass" as const,
            }
          : null;

      if (!defaultEffectData) return;

      // Get current effect count for order
      const currentEffects = effects ?? [];
      const order = currentEffects.length;

      await z.mutate(
        mutators.trackEffects.create({
          id: crypto.randomUUID(),
          trackId: selectedTrackId,
          order,
          enabled: true,
          effectData: defaultEffectData,
        }),
      );
    },
    [selectedTrackId, effects, z],
  );

  // Handle effect parameter commit (to server)
  const updateEffectParam = useCallback(
    async (effectId: string, effectData: FilterEffectData) => {
      await z.mutate(mutators.trackEffects.update({ id: effectId, effectData }));
    },
    [z],
  );

  // Handle effect enabled toggle
  const toggleEffectEnabled = useCallback(
    async (effectId: string, enabled: boolean) => {
      await z.mutate(mutators.trackEffects.update({ id: effectId, enabled }));
    },
    [z],
  );

  // Handle effect deletion
  const deleteEffect = useCallback(
    async (effectId: string) => {
      await z.mutate(mutators.trackEffects.delete({ id: effectId }));
      if (selectedEffectId === effectId) {
        selectEffect(null);
      }
    },
    [z, selectedEffectId, selectEffect],
  );

  // Handle effect deletion via keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEffectId && selectedTrackId) {
        // Don't delete effect if we're in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        e.preventDefault();
        void deleteEffect(selectedEffectId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEffectId, selectedTrackId, deleteEffect]);

  // Effect reorder hook
  const { handleDragStart: handleEffectDragStart, handleDragEnd: handleEffectDragEnd } =
    useEffectReorder({
      effects: effects.map((e) => ({ ...e, _id: e.id })),
      onReorder: (effectId, newOrder) => {
        if (!selectedTrackId) return;
        // Get all effect IDs in the new order
        const currentEffects = [...effects].sort((a, b) => a.order - b.order);
        const effectIds = currentEffects.map((e) => e.id);
        // Move the effect to its new position
        const oldIndex = effectIds.indexOf(effectId);
        if (oldIndex !== -1) {
          effectIds.splice(oldIndex, 1);
          effectIds.splice(newOrder, 0, effectId);
        }
        void z.mutate(
          mutators.trackEffects.reorder({
            trackId: selectedTrackId,
            effectIds,
          }),
        );
      },
    });

  return {
    effects,
    effectsForEngine,
    addEffect,
    updateEffectParam,
    toggleEffectEnabled,
    deleteEffect,
    handleEffectDragStart,
    handleEffectDragEnd,
  };
}
