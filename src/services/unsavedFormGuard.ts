export interface UnsavedFormGuard {
  label: string;
  isDirty: () => boolean;
  save: () => boolean;
  discard: () => void;
}
