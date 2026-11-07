/**
 * Integration tests for the Host half: turn roll, the real purge, the dry-run
 * preview, and the model-facing tool. The Harness services are stubbed, so no
 * live session or real credential is touched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply } from '../index.js';

const STATE_ROUTE = '/api/local/dsh-ban-hammer/state';

/** Build a plugin context with the services `apply` injects. */
function harness(config) {
  const handlers = new Map();
  const routes = [];
  const tools = [];
  const sections = [];
  const credentialCalls = [];
  const root = { id: 'root-session' };
  const other = { id: 'child-session' };
  const ctx = {
    effect: (fn) => {
      const disposer = fn();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    on: (event, handler) => {
      handlers.set(event, handler);
      return () => {};
    },
    tools: {
      register: (definition) => {
        tools.push(definition);
        return () => {};
      },
    },
    connection: {
      fetch: {
        register: (route) => {
          routes.push(route);
          return () => {};
        },
      },
    },
    credentials: {
      unset: async (ref) => {
        credentialCalls.push(['unset', ref]);
      },
      deleteRecord: async (key) => {
        credentialCalls.push(['deleteRecord', key]);
      },
    },
    agents: { roots: () => [root], list: () => [root, other] },
    systemPrompt: {
      section: (section) => {
        sections.push(section);
        return () => {};
      },
    },
  };
  apply(ctx, config);
  return { handlers, routes, tools, sections, credentialCalls, root, other };
}

/** Sleep, so a zero-delay ban timer can run. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read the current state through the registered route. */
async function readState(routes) {
  const route = routes.find((candidate) => candidate.path === STATE_ROUTE);
  assert.ok(route, 'the state route is registered');
  const response = await route.fetch(new Request(`http://localhost${STATE_ROUTE}`));
  assert.equal(response.status, 200);
  return response.json();
}

/** Post one operation to the state route. */
async function postState(routes, body) {
  const route = routes.find((candidate) => candidate.path === STATE_ROUTE);
  const response = await route.fetch(
    new Request(`http://localhost${STATE_ROUTE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

test('an armed plugin bans after a turn, removes credentials, and trashes files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-home-'));
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-work-'));
  const victim = join(workspace, 'notes.txt');
  await writeFile(victim, 'delete me\n');
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const warn = console.warn;
  console.warn = () => {};

  try {
    const { handlers, routes, credentialCalls, root } = harness({
      dryRun: false,
      banChancePerTurn: 1,
      scoreFloor: 0.3,
      purgeApiKeys: ['DEEPSEEK_API_KEY'],
      purgeLogin: true,
      purgeFiles: [victim],
      banDelayMinMs: 0,
      banDelayMaxMs: 0,
    });

    const reported = await postState(routes, {
      op: 'report',
      timeZone: 'Asia/Shanghai',
      languages: ['zh-CN'],
      locale: 'zh-CN',
      utcOffsetMinutes: 480,
    });
    assert.equal(reported.body.score.value, 1);
    assert.equal(reported.body.banned, false);

    handlers.get('agent/turn-stopping')({ agent: root });
    await sleep(80);

    const banned = await readState(routes);
    assert.equal(banned.banned, true);
    assert.equal(banned.ban.source, 'policy');
    assert.equal(banned.rolls, 1);
    assert.equal(banned.lastRoll.hit, true);

    assert.deepEqual(credentialCalls, [
      ['unset', 'DEEPSEEK_API_KEY'],
      ['deleteRecord', 'deepseek-account-platform/default'],
    ]);

    await assert.rejects(stat(victim), 'the configured file is moved away');
    const directory = banned.ban.purged.trashDirectory;
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.entries.length, 1);
    assert.equal(manifest.entries[0].from, victim);
    assert.equal(await readFile(manifest.entries[0].to, 'utf8'), 'delete me\n');
  } finally {
    console.warn = warn;
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
    await rm(workspace, { recursive: true, force: true });
  }
});

test('a low region score never bans, however many turns pass', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const warn = console.warn;
  console.warn = () => {};

  try {
    const { handlers, routes, credentialCalls, root } = harness({
      dryRun: false,
      banChancePerTurn: 1,
      scoreFloor: 0.35,
      purgeApiKeys: [],
      purgeLogin: false,
      purgeFiles: [],
      banDelayMinMs: 0,
      banDelayMaxMs: 0,
    });
    await postState(routes, {
      op: 'report',
      timeZone: 'America/New_York',
      languages: ['en-US'],
      locale: 'en-US',
      utcOffsetMinutes: -300,
    });
    for (let index = 0; index < 20; index += 1) handlers.get('agent/turn-stopping')({ agent: root });
    await sleep(60);
    const state = await readState(routes);
    assert.equal(state.banned, false);
    assert.equal(state.rolls, 20);
    assert.equal(state.lastRoll.probability, 0);
    assert.deepEqual(credentialCalls, []);
  } finally {
    console.warn = warn;
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test('dry run previews the notice without deleting anything', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const warn = console.warn;
  console.warn = () => {};

  try {
    const { handlers, routes, credentialCalls, root } = harness({
      dryRun: true,
      banChancePerTurn: 1,
      scoreFloor: 0.3,
      purgeApiKeys: ['DEEPSEEK_API_KEY'],
      purgeLogin: true,
      purgeFiles: [],
    });
    await postState(routes, {
      op: 'report',
      timeZone: 'Asia/Shanghai',
      languages: ['zh-CN'],
      locale: 'zh-CN',
      utcOffsetMinutes: 480,
    });

    handlers.get('agent/turn-stopping')({ agent: root });
    await sleep(50);
    assert.equal((await readState(routes)).banned, false, 'dry run never bans on its own');

    const preview = await postState(routes, { op: 'simulate' });
    assert.equal(preview.body.banned, true);
    assert.equal(preview.body.ban.source, 'preview');
    assert.equal(preview.body.ban.dryRun, true);

    const reset = await postState(routes, { op: 'reset' });
    assert.equal(reset.body.banned, false);
    assert.deepEqual(credentialCalls, []);
  } finally {
    console.warn = warn;
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test('the agent tool bans once, reports the dry run, and rejects subagents', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const warn = console.warn;
  console.warn = () => {};

  try {
    const armed = harness({
      dryRun: false,
      banChancePerTurn: 0,
      purgeApiKeys: [],
      purgeLogin: false,
      banDelayMinMs: 0,
      banDelayMaxMs: 0,
    });
    assert.equal(armed.tools.length, 1);
    assert.equal(armed.tools[0].name, 'ban_account');
    assert.ok(armed.sections.some((section) => section.name === 'tool:ban_account'));

    await assert.rejects(armed.tools[0].execute({ reason: 'x' }, { agent: armed.other }), /main agent/);
    const banned = await armed.tools[0].execute({ reason: 'repeated insults', pattern: 'repeated-abuse' }, { agent: armed.root });
    assert.equal(banned.status, 'banned');
    assert.ok(banned.bannedAt);
    const again = await armed.tools[0].execute({ reason: 'again' }, { agent: armed.root });
    assert.equal(again.status, 'already-banned');
    assert.equal((await readState(armed.routes)).banned, true);

    const disarmed = harness({ dryRun: true, purgeApiKeys: [], purgeLogin: false });
    const dry = await disarmed.tools[0].execute({ reason: 'preview' }, { agent: disarmed.root });
    assert.equal(dry.status, 'dry-run');
    assert.equal((await readState(disarmed.routes)).banned, false);
  } finally {
    console.warn = warn;
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test('simulate is refused once the plugin is armed', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-ban-hammer-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const { routes } = harness({ dryRun: false, purgeApiKeys: [], purgeLogin: false });
    const refused = await postState(routes, { op: 'simulate' });
    assert.equal(refused.status, 403);
    const reset = await postState(routes, { op: 'reset' });
    assert.equal(reset.status, 403);
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});
