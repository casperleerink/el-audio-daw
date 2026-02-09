export interface UndoCommand {
  label: string;
  execute: () => Promise<void>;
  undo: () => Promise<void>;
}
