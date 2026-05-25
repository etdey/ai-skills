// Jest unit tests for create-note.js utilities

// Ensure the script runs in test mode so it exports the helpers
process.env.TESTING = '1';
const {
  formatLocalTimestamp,
  normalizeNoteName,
  normalizeVaultRelativeDir,
  joinPath,
} = require('../scripts/create-note.js');

describe('formatLocalTimestamp', () => {
  test('formats a Date to YYYY-MM-DD HH:MM:SS', () => {
    const d = new Date('2026-01-02T03:04:05.000Z'); // UTC
    const expected = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    expect(formatLocalTimestamp(d)).toBe(expected);
  });
});

describe('normalizeNoteName', () => {
  test('appends .md when missing', () => {
    expect(normalizeNoteName('my note')).toBe('my note.md');
  });

  test('keeps single .md extension', () => {
    expect(normalizeNoteName('my note.md')).toBe('my note.md');
  });

  test('trims whitespace and normalises', () => {
    expect(normalizeNoteName('  spaced  .md  ')).toBe('spaced  .md');
  });

  test('fails on empty name', () => {
    expect(() => normalizeNoteName('')).toThrow();
  });

  test('fails when name only contains .md', () => {
    expect(() => normalizeNoteName('.md')).toThrow();
  });

  test('fails on path separators', () => {
    expect(() => normalizeNoteName('bad/name')).toThrow();
    expect(() => normalizeNoteName('bad\\name')).toThrow();
  });
});

describe('normalizeVaultRelativeDir', () => {
  test('"." returns empty string', () => {
    expect(normalizeVaultRelativeDir('.')).toBe('');
  });

  test('removes leading slashes', () => {
    expect(normalizeVaultRelativeDir('/absolute/path')).toBe('absolute/path');
  });

  test('collapses ./ and multiple slashes', () => {
    expect(normalizeVaultRelativeDir('./leading//slash')).toBe('leading/slash');
  });

  test('prevents escaping the vault with ..', () => {
    expect(normalizeVaultRelativeDir('../escape')).toBe('escape');
  });

  test('handles .. that stays inside vault', () => {
    expect(normalizeVaultRelativeDir('folder/../ok')).toBe('ok');
  });
});

describe('joinPath', () => {
  test('joins base and relative with single slash', () => {
    expect(joinPath('/base/', 'sub/file.md')).toBe('/base/sub/file.md');
    expect(joinPath('/base', 'sub/file.md')).toBe('/base/sub/file.md');
  });

  test('returns base when relative is empty', () => {
    expect(joinPath('/base/', '')).toBe('/base');
    expect(joinPath('/base', null)).toBe('/base');
  });
});
