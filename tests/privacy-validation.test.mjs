import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const validator = fileURLToPath(new URL('scripts/validate-privacy.py', root));
const run = promisify(execFile);
test('each privacy policy points to the existing localized Coliving contact section', () => {
  for (const locale of ['en', 'zh', 'th']) {
    const directory = locale === 'en' ? '' : locale + '/';
    const policy = readFileSync(new URL(`privacy/${directory}index.html`, root), 'utf8');
    const contactPage = readFileSync(new URL(`coliving-community/${locale}/index.html`, root), 'utf8');
    assert.ok(policy.includes(`href="/coliving-community/${locale}/#contact"`));
    assert.match(contactPage, /id="contact"/);
    assert.doesNotMatch(policy, /mailto:/i);
  }
});

test('privacy validator accepts the exact payload and rejects stale content and missing files', async () => {
  let mode = 'raw';
  const server = createServer((request, response) => {
    const path = request.url.endsWith('/') ? request.url + 'index.html' : request.url;
    if (mode === 'missing' && path === '/privacy/th/index.html') {
      response.writeHead(404).end();
      return;
    }
    if (mode === 'asset' && path === '/privacy/policy-v1.css') {
      response.end('stale CSS');
      return;
    }
    let content = readFileSync(new URL('.' + path, root), 'utf8');
    if (path === '/privacy/index.html' && mode === 'html') {
      content = content.replace('<h1>', '<h1>Stale ');
    }
    response.end(content);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixture = mkdtempSync(join(tmpdir(), '4seas-privacy-'));
  const validate = (source = fileURLToPath(root)) => run('python3', [
    validator, '--root', source, '--base-url', `http://127.0.0.1:${server.address().port}/`,
  ]);
  try {
    const { stdout } = await validate();
    assert.match(stdout, /Verified 5 Privacy pages\/assets/);
    mode = 'html';
    await assert.rejects(validate(), /Content mismatch: privacy\/index\.html/);
    mode = 'asset';
    await assert.rejects(validate(), /Content mismatch: privacy\/policy-v1\.css/);
    mode = 'missing';
    await assert.rejects(validate(), /404/);

    await assert.rejects(validate(fixture), /git.*ls-files/);
    execFileSync('git', ['init', '-q', fixture]);
    await assert.rejects(validate(fixture), /Privacy payload is missing/);
    mkdirSync(join(fixture, 'privacy'));
    const trackedPath = join(fixture, 'privacy', 'index.html');
    writeFileSync(trackedPath, '');
    execFileSync('git', ['-C', fixture, 'add', 'privacy/index.html']);
    rmSync(trackedPath);
    await assert.rejects(validate(fixture), /No such file or directory.*privacy\/index\.html/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
});
