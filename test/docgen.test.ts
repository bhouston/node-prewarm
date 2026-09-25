import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDocgen } from '../src/docgen.ts';

describe('runDocgen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a valid OpenCLI document describing the CLI to stdout', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runDocgen(['docgen']);

    expect(write).toHaveBeenCalledTimes(1);
    const document = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(document.info.binary).toBe('node-prewarm');
    expect(document.commands['node-prewarm']).toBeDefined();
    expect(document.commands['node-prewarm docgen']).toBeDefined();
  });

  it('writes the document to a file when --output is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'node-prewarm-docgen-'));
    try {
      const outputFile = join(dir, 'opencli.json');
      await runDocgen(['docgen', '--output', outputFile]);

      const document = JSON.parse(await readFile(outputFile, 'utf8'));
      expect(document.info.binary).toBe('node-prewarm');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
