export interface UnsavedFormGuard {
  label: string;
  isDirty: () => boolean;
  save: () => boolean | Promise<boolean>;
  discard: () => void;
}
