import type { UndoCommand } from "./types";

export function compoundCommand(label: string, commands: UndoCommand[]): UndoCommand {
  return {
    label,
    execute: async () => {
      for (const cmd of commands) await cmd.execute();
    },
    undo: async () => {
      for (const cmd of [...commands].reverse()) await cmd.undo();
    },
  };
}
