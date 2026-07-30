/**
 * constants.js
 * Default seed data and theme presets.
 * Edit these to change the starting state of a fresh app.
 */

export const STORAGE_KEY = 'mandaybook_v1';

export const DEFAULT_PLAN = [];

/** Suggested activities shown in the Planned Activity picker. Users can still type a custom value. */
export const ACTIVITY_PRESETS = [
  'Kick Off Meeting',
  'Onboarding',
  'Basic Data Config',
  'Business Mapping',
  'Data Migration',
  'Role and Permission Setting',
  'Training - Admin',
  'Onsite System Configuration',
  'Training - User',
  'Setting Income Deduct'
];

export const DEFAULT_ACTUAL = [];

/** Suggested tasks shown in the Actual Work Log picker. Users can still type a custom value. */
export const TASK_PRESETS = [
  'Phone Call 1',
  'Phone Call 2',
  'Phone Call 3',
  'Phone Call 4',
  'Phone Call 5',
  'Onboarding 1',
  'Onboarding 2',
  'Onboarding 3',
  'Migrate Data out',
  'Migrate Data',
  'Migrate Time',
  'Training - User'
];

/** Initial project metadata. */
export const DEFAULT_PROJECT = {
  name: '',
  customer: '',
  mandayPurchased: 10,
  hoursPerManday: 8,
  logo: null,
  docTitle: 'Manday Allocation Report',
  docSubtitle: 'Project budget tracking & utilization summary',
  themeColor: '#2d4a3e'
};

/** Theme color swatches shown in Report Settings. */
export const THEMES = [
  { name: 'Forest',   value: '#2d4a3e' },
  { name: 'Navy',     value: '#1e3a5f' },
  { name: 'Burgundy', value: '#7a2e2e' },
  { name: 'Charcoal', value: '#2c2c2c' },
  { name: 'Ocean',    value: '#1a6b7a' },
  { name: 'Plum',     value: '#5a2d5a' },
  { name: 'Bronze',   value: '#8b5a2b' },
  { name: 'Slate',    value: '#465766' }
];
