import { create } from "zustand";
import { toast } from "sonner";
import type { UndoCommand } from "@/commands/types";

const MAX_STACK_SIZE = 50;

interface UndoState {
  undoStack: UndoCommand[];
  redoStack: UndoCommand[];
}

interface UndoActions {
  push: (cmd: UndoCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

type UndoStore = UndoState & UndoActions;

export const useUndoStore = create<UndoStore>((set, get) => ({
  undoStack: [],
  redoStack: [],

  push: (cmd) => {
    set((state) => {
      const newStack = [...state.undoStack, cmd];
      if (newStack.length > MAX_STACK_SIZE) {
        newStack.shift();
      }
      return { undoStack: newStack, redoStack: [] };
    });
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;

    const cmd = undoStack[undoStack.length - 1]!;
    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
    }));

    try {
      await cmd.undo();
      set((state) => ({
        redoStack: [...state.redoStack, cmd],
      }));
    } catch {
      toast.error("Can't undo — data was modified by another user");
    }
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;

    const cmd = redoStack[redoStack.length - 1]!;
    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
    }));

    try {
      await cmd.execute();
      set((state) => ({
        undoStack: [...state.undoStack, cmd],
      }));
    } catch {
      toast.error("Can't redo — data was modified by another user");
    }
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] });
  },

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,
}));
