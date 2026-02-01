import { useCallback } from "react";
import { useZero } from "@rocicorp/zero/react";
import { mutators } from "@el-audio-daw/zero/mutators";
import type { EffectData } from "@el-audio-daw/schemas/effects";

type CreateTrackEffectArgs = {
  trackId: string;
  order: number;
  enabled?: boolean;
  effectData: EffectData;
};

type UpdateTrackEffectArgs = {
  id: string;
  enabled?: boolean;
  effectData?: EffectData;
};

/**
 * Hook for managing track effects using Zero sync.
 * Provides track effect mutations with real-time sync.
 * Zero handles optimistic updates automatically.
 *
 * Note: Effects are typically queried via the tracks query with related effects,
 * so this hook focuses on mutations.
 */
export function useZeroTrackEffects() {
  const zero = useZero();

  const createEffect = useCallback(
    async (args: CreateTrackEffectArgs) => {
      const id = crypto.randomUUID();
      await zero.mutate(
        mutators.trackEffects.create({
          id,
          trackId: args.trackId,
          order: args.order,
          enabled: args.enabled ?? true,
          effectData: args.effectData,
        }),
      );
      return id;
    },
    [zero],
  );

  const updateEffect = useCallback(
    async (args: UpdateTrackEffectArgs) => {
      await zero.mutate(mutators.trackEffects.update(args));
    },
    [zero],
  );

  const reorderEffects = useCallback(
    async (trackId: string, effectIds: string[]) => {
      await zero.mutate(mutators.trackEffects.reorder({ trackId, effectIds }));
    },
    [zero],
  );

  const deleteEffect = useCallback(
    async (id: string) => {
      await zero.mutate(mutators.trackEffects.delete({ id }));
    },
    [zero],
  );

  return {
    createEffect,
    updateEffect,
    reorderEffects,
    deleteEffect,
  };
}
