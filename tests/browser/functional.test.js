// Real Chromium checks with an empty, disposable browser context. No signed-in
// profile, external network, screen recording or human playtesting is involved.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright';
import { LESSONS } from '../../../repos/taaltrainer/js/engine/lessons.js';
import { BOLS } from '../../../repos/taaltrainer/js/engine/bol.js';
import { practicePlan } from '../../../repos/taaltrainer/js/engine/practice.js';
import { CHALLENGES } from '../../../repos/stepcheck/js/challenges.js';

const roots = {
  taaltrainer: fileURLToPath(new URL('../../../repos/taaltrainer/', import.meta.url)),
  stepcheck: fileURLToPath(new URL('../../../repos/stepcheck/', import.meta.url)),
  'grant-bom-workbench': fileURLToPath(new URL('../../artifacts/grant-bom-workbench/', import.meta.url)),
  'build-evidence-kit': fileURLToPath(new URL('../../artifacts/build-evidence-kit/', import.meta.url))
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
let server, browser, origin;

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const segments = pathname.split('/').filter(Boolean);
      const root = roots[segments.shift()];
      if (!root || pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid test path');
      const candidate = resolve(root, segments.join('/') || 'index.html');
      if (!candidate.startsWith(resolve(root) + sep)) throw new Error('Invalid test path');
      const actual = await realpath(candidate);
      if (!actual.startsWith((await realpath(root)) + sep)) throw new Error('Escaping symlink');
      const body = await readFile(actual);
      response.writeHead(200, { 'Content-Type': types[extname(actual)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({
      executablePath: process.env.REWARD_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--mute-audio']
    });
  } catch (error) {
    await new Promise((accept) => server.close(accept));
    throw error;
  }
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((accept) => server.close(accept));
});

async function withPage(name, callback, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', async (route) => {
    if (!route.request().url().startsWith(origin + '/')) {
      external.push(route.request().url()); await route.abort();
    } else await route.continue();
  });
  try {
    const response = await page.goto(`${origin}/${name}/`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, 'the real application loaded');
    await callback(page);
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    assert.deepEqual(external, [], 'no remote requests');
  } finally { await context.close(); }
}

test('real Web Audio worklets produce finite nonzero signal in Chromium', async () => {
  await withPage('taaltrainer', async (page) => {
    await page.locator('#btn-play').click();
    await page.waitForSelector('[data-audio-status][data-ready="true"]');
    await page.locator('#btn-play').click();
    const measurement = await page.evaluate(async () => {
      const { TablaEngine } = await import('./js/audio/engine.js');
      const engine = new TablaEngine();
      await engine.init(); await engine.resume();
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 2048;
      engine.master.connect(analyser);
      engine.trigger('tin');
      await new Promise((accept) => setTimeout(accept, 80));
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      const measured = { finite: [...samples].every(Number.isFinite), peak: Math.max(...samples.map(Math.abs)), state: engine.ctx.state, families: Object.keys(engine.nodes).length };
      engine.panic(); await engine.ctx.close();
      return measured;
    });
    assert.equal(measurement.state, 'running');
    assert.equal(measurement.families, 3);
    assert.equal(measurement.finite, true);
    assert.ok(measurement.peak > 0.001, JSON.stringify(measurement));
  });
});

test('long lesson response is not cut off at 2.5 seconds and exact taps score 100', async () => {
  const lesson = LESSONS.find((item) => item.id === 'l12');
  const plan = practicePlan(lesson);
  await withPage('taaltrainer', async (page) => {
    await page.locator('#btn-play').click();
    await page.waitForSelector('[data-audio-status][data-ready="true"]');
    await page.locator('#btn-play').click();
    await page.clock.install();
    await page.locator('[data-lesson="l12"]').click();
    await page.locator('#btn-call').click();
    await page.clock.runFor(Math.ceil(plan.responseStartMs) + 5);
    assert.equal(await page.locator('#btn-grade').isEnabled(), true);
    await page.clock.runFor(2500);
    assert.equal(await page.locator('#btn-grade').isEnabled(), true);
    await page.locator('#btn-call').click();
    await page.clock.runFor(Math.ceil(plan.responseStartMs));
    const beat = 60000 / lesson.bpm;
    for (const [index, bolId] of lesson.phrase.entries()) {
      const bol = BOLS.find((item) => item.id === bolId);
      await page.dispatchEvent('body', 'keydown', { code: bol.code, key: bol.key, bubbles: true });
      if (index < lesson.phrase.length - 1) await page.clock.runFor(Math.round(beat));
    }
    await page.locator('#btn-grade').click();
    assert.equal(await page.locator('#out-score').evaluate((element) => element.value), '100');
    assert.equal(await page.locator('#score-readout').isVisible(), true);
  });
});

test('changing a lesson cancels queued callbacks and recorder controls work', async () => {
  await withPage('taaltrainer', async (page) => {
    await page.locator('#btn-play').click();
    await page.waitForSelector('[data-audio-status][data-ready="true"]');
    await page.locator('#btn-play').click();
    await page.clock.install();
    await page.locator('#btn-call').click();
    await page.locator('[data-lesson="l05"]').click();
    await page.clock.runFor(30000);
    assert.equal(await page.locator('#btn-grade').isEnabled(), false);
    assert.match(await page.locator('#lesson-status').textContent(), /Play the call/);
    await page.locator('#btn-record').click();
    await page.dispatchEvent('body', 'keydown', { code: 'KeyA', key: 'a', bubbles: true });
    await page.clock.runFor(600);
    await page.dispatchEvent('body', 'keydown', { code: 'KeyD', key: 'd', bubbles: true });
    await page.locator('#btn-record').click();
    assert.equal(await page.locator('#btn-recplay').isEnabled(), true);
    await page.locator('#btn-recplay').click();
    await page.locator('#btn-recclear').click();
    await page.clock.runFor(5000);
    assert.equal(await page.locator('#notation-cells').isVisible(), false);
    assert.equal(await page.locator('#btn-recplay').isEnabled(), false);
  });
});

test('StepCheck actual form completes and undoes the first challenge', async () => {
  await withPage('stepcheck', async (page) => {
    const challenge = CHALLENGES.find((item) => item.id === 'c01');
    await page.locator('[data-id="c01"]').click();
    for (const raw of challenge.path) {
      await page.locator('#step-input').fill(raw);
      await page.locator('#add-step').click();
    }
    assert.equal(await page.locator('#done-note').isVisible(), true);
    assert.equal(await page.locator('#step-input').isEnabled(), false);
    await page.locator('#undo-step').click();
    assert.equal(await page.locator('#done-note').isVisible(), false);
    assert.equal(await page.locator('#step-input').isEnabled(), true);
  });
});

test('StepCheck free practice rejects an invalid root transformation and huge exponent', async () => {
  await withPage('stepcheck', async (page) => {
    for (const raw of ['sqrt(x) = -2', 'x = 4']) {
      await page.locator('#step-input').fill(raw);
      await page.locator('#add-step').click();
    }
    assert.match(await page.locator('#feedback').textContent(), /negative|introduces solutions/);
    assert.equal(await page.locator('#ladder > li').count(), 1);
    await page.locator('#step-input').fill('x^100000000000');
    await page.locator('#add-step').click();
    assert.match(await page.locator('#feedback').textContent(), /between -16 and 16/);
    assert.equal(await page.locator('#ladder > li').count(), 1);
  });
});

test('StepCheck quadratic challenge displays and retains its assumptions', async () => {
  await withPage('stepcheck', async (page) => {
    const challenge = CHALLENGES.find((item) => item.id === 'c15');
    await page.locator('[data-id="c15"]').click();
    assert.match(await page.locator('#panel-given').textContent(), /a != 0/);
    for (const raw of challenge.path) {
      await page.locator('#step-input').fill(raw);
      await page.locator('#add-step').click();
      assert.equal(await page.locator('#feedback.is-error').count(), 0, raw);
    }
    assert.equal(await page.locator('#done-note').isVisible(), true);
    assert.match(await page.locator('#ladder').textContent(), /Retain domain/);
  });
});

test('recording cancels an active lesson while clearing a take leaves a new lesson intact', async () => {
  await withPage('taaltrainer', async (page) => {
    await page.locator('#btn-play').click();
    await page.waitForSelector('[data-audio-status][data-ready="true"]');
    await page.locator('#btn-play').click();
    await page.clock.install();
    await page.locator('#btn-call').click();
    await page.locator('#btn-record').click();
    assert.match(await page.locator('#lesson-status').textContent(), /stopped for recording/);
    await page.dispatchEvent('body', 'keydown', { code: 'KeyA', key: 'a', bubbles: true });
    await page.locator('#btn-record').click();
    await page.clock.runFor(30000);
    assert.equal(await page.locator('#btn-grade').isEnabled(), false);
    await page.evaluate(() => {
      window.testPanics = 0;
      const original = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function(message, ...rest) {
        if (message?.type === 'panic') window.testPanics += 1;
        return original.call(this, message, ...rest);
      };
    });
    await page.locator('#btn-call').click();
    const before = await page.evaluate(() => window.testPanics);
    await page.locator('#btn-recclear').click();
    assert.equal(await page.evaluate(() => window.testPanics), before, 'Clear must not panic the active lesson');
    await page.clock.runFor(5300);
    assert.equal(await page.locator('#btn-grade').isEnabled(), true);
  });
});

test('StepCheck rejects a symbolic absolute-value split and preserves nested-power grouping', async () => {
  await withPage('stepcheck', async (page) => {
    for (const raw of ['|x| = -x', 'x = -x or x = x']) { await page.locator('#step-input').fill(raw); await page.locator('#add-step').click(); }
    assert.equal(await page.locator('#ladder > li').count(), 1);
    assert.match(await page.locator('#feedback').textContent(), /nonnegative|add solutions/);
    await page.locator('#reset-proof').click();
    await page.locator('#step-input').fill('(x^2)^3 = 64');
    await page.locator('#add-step').click();
    assert.equal(await page.locator('#ladder .mparen').count(), 2);
    assert.equal(await page.locator('#step-input').getAttribute('maxlength'), '2048');
  });
});

test('BOM workbench calculates exact synthetic data and downloads validated JSON', async () => {
  await withPage('grant-bom-workbench', async (page) => {
    for (const [id, value] of Object.entries({ 'part-number': 'TEST-PART', description: 'Synthetic test fixture', quantity: '3', 'unit-price': '0.10', 'quote-url': 'https://www.digikey.com/en/products', 'quoted-on': new Date().toISOString().slice(0, 10) })) await page.locator('#' + id).fill(value);
    await page.locator('#row-form button').click();
    await page.locator('#shipping').fill('1.00'); await page.locator('#tax').fill('0');
    await page.locator('#budget-form button').click();
    assert.match(await page.locator('#result').textContent(), /Order USD 1.30/);
    assert.match(await page.locator('#status').textContent(), /not independently verified/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    assert.equal(download.suggestedFilename(), 'bom-budget.json');
    await page.locator('#rows button').click();
    assert.equal(await page.locator('#download').isEnabled(), false);
    assert.equal(await page.locator('style, link[rel="stylesheet"], canvas, [style]').count(), 0);
  });
});

test('evidence kit inspects selected UTF-8 bytes and redacts findings without uploads', async () => {
  await withPage('build-evidence-kit', async (page) => {
    await page.locator('#files').setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
    await page.waitForFunction(() => !document.getElementById('download').disabled);
    assert.match(await page.locator('#manifest').textContent(), /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);
    assert.match(await page.locator('#status').textContent(), /0 findings/);
    const privateText = ['example', 'gmail.com'].join('@');
    await page.locator('#files').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(privateText) });
    await page.waitForFunction(() => document.getElementById('findings').children.length > 0);
    assert.match(await page.locator('#findings').textContent(), /personal-email/);
    assert.equal((await page.locator('body').textContent()).includes(privateText), false);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    assert.equal(download.suggestedFilename(), 'build-evidence.json');
  });
});

for (const name of ['taaltrainer', 'stepcheck']) {
  test(`${name} renders at phone and desktop widths without horizontal overflow`, async () => {
    await withPage(name, async (page) => {
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
        assert.ok(size.scroll <= size.width + 1, JSON.stringify(size));
        assert.equal(await page.locator('h1').count(), 1);
      }
    });
  });
}
