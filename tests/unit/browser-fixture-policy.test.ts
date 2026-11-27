import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('M3-PH3-TC17 browser fixture policy', () => {
  it('keeps TMP-02 assigned-fixture helpers and direct parcel writes out of browser specs', () => {
    const directory = path.resolve('tests/e2e');
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.spec.ts'));
    const source = files.map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n');
    expect(source).not.toMatch(/seedRiderParcel(?:s|Profile)/);
    expect(source).not.toMatch(/INSERT\s+INTO\s+app\.parcel/i);
    expect(source).not.toMatch(/SET\s+(?:LOCAL\s+)?ROLE\s+domain_writer/i);
  });
});
