import { z } from "zod";

export const filterEffectSchema = z.object({
  type: z.literal("filter"),
  cutoff: z.number().min(20).max(20000),
  resonance: z.number().min(0).max(1),
  filterType: z.enum(["lowpass", "highpass", "bandpass", "notch"]),
});

export const effectDataSchema = z.discriminatedUnion("type", [
  filterEffectSchema,
]);

export type FilterEffect = z.infer<typeof filterEffectSchema>;
export type EffectData = z.infer<typeof effectDataSchema>;
