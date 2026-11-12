// Single source of truth for size and count limits (spec 5.8).

// Version 2 adds `snapshots` (M7-03, D-063). Version 3 allows number, date and choice items (M8-05, D-072).
// Older profiles are migrated on a copy (src/domain/migrations.js).
export const SCHEMA_VERSION = 3;
export const BACKUP_FORMAT_VERSION = 1;

export const LIMITS = Object.freeze({
  backupFileBytes: 4 * 1024 * 1024,
  items: 2000,
  categories: 200,
  categoryDepth: 3,
  states: 24,
  audiences: 50,
  overrides: 5000,
  views: 50,
  snapshots: 20,
  // All entries across all snapshots together, so history can never grow a profile past what a backup can hold.
  snapshotEntries: 10_000,
  answers: 2000,
  labelLength: 200,
  categoryNameLength: 120,
  stateLabelLength: 60,
  stateDescriptionLength: 300,
  descriptionLength: 500,
  noteLength: 4000,
  textLength: 4000,
  // Choice items (M8-05): a short list of the person's own options.
  optionsPerItem: 12,
  optionLabelLength: 40,
  unitLength: 20,
  titleLength: 120,
  tagsPerItem: 10,
  tagLength: 40,
  jsonDepth: 12,
  undoHistory: 100,
  shareEncodedBytes: 256 * 1024,
  shareDecompressedBytes: 2 * 1024 * 1024,
});
