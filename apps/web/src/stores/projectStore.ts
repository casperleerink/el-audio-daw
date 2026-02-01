import { create } from "zustand";

interface ProjectState {
  projectId: string | null;
  sampleRate: number;
}

interface ProjectActions {
  setProject: (id: string, sampleRate: number) => void;
  clearProject: () => void;
}

export type ProjectStore = ProjectState & ProjectActions;

export const useProjectStore = create<ProjectStore>((set) => ({
  // Initial state
  projectId: null,
  sampleRate: 44100,

  // Actions
  setProject: (id, sampleRate) => {
    set({ projectId: id, sampleRate });
  },

  clearProject: () => {
    set({ projectId: null, sampleRate: 44100 });
  },
}));

// Selectors
export const useProjectId = () => useProjectStore((s) => s.projectId);
export const useSampleRate = () => useProjectStore((s) => s.sampleRate);
