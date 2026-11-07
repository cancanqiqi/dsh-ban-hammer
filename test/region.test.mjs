/**
 * Unit tests for the deterministic parts: region scoring, the probability
 * curve, and config normalization.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  banProbability,
  chineseLanguageScore,
  mainlandTimeZoneScore,
  measureRegion,
  normalizeConfig,
  utcOffsetScore,
} from '../index.js';

test('a mainland time zone plus zh-CN scores as a region match', () => {
  const measured = measureRegion({
    timeZone: 'Asia/Shanghai',
    languages: ['zh-CN'],
    locale: 'zh-CN',
    utcOffsetMinutes: 480,
  });
  assert.equal(measured.value, 1);
  assert.equal(measured.timeZone, 'Asia/Shanghai');
  assert.equal(measured.language, 'zh-CN');
});

test('a mainland time zone with an English system language still scores high', () => {
  const measured = measureRegion({
    timeZone: 'Asia/Shanghai',
    languages: ['en-US'],
    locale: 'en-US',
    utcOffsetMinutes: 480,
  });
  // 0.45 (zone) + 0.20 (offset); the language signal is zero.
  assert.equal(measured.value, 0.65);
});

test('an out-of-region signal set scores zero', () => {
  assert.equal(
    measureRegion({ timeZone: 'America/New_York', languages: ['en-US'], utcOffsetMinutes: -300 }).value,
    0,
  );
  assert.equal(measureRegion({}).value, 0);
});

test('the UTC offset alone is weak evidence', () => {
  const measured = measureRegion({ timeZone: 'Asia/Singapore', languages: ['en-SG'], utcOffsetMinutes: 480 });
  assert.equal(measured.value, 0.2);
});

test('a bare zh tag is weaker than zh-CN', () => {
  assert.equal(chineseLanguageScore('zh-CN'), 1);
  assert.equal(chineseLanguageScore('zh-Hans-CN'), 1);
  assert.equal(chineseLanguageScore('zh-Hans'), 0.85);
  assert.equal(chineseLanguageScore('zh'), 0.6);
  assert.equal(chineseLanguageScore('zh-TW'), 0.2);
  assert.equal(chineseLanguageScore('en-US'), 0);
});

test('time zone scoring knows mainland zones and the neighbors', () => {
  assert.equal(mainlandTimeZoneScore('Asia/Urumqi'), 1);
  assert.equal(mainlandTimeZoneScore('Asia/Chongqing'), 1);
  assert.equal(mainlandTimeZoneScore('Asia/Hong_Kong'), 0.15);
  assert.equal(mainlandTimeZoneScore('Asia/Taipei'), 0.1);
  assert.equal(mainlandTimeZoneScore('Europe/Berlin'), 0);
  assert.equal(utcOffsetScore(480), 1);
  assert.equal(utcOffsetScore(60), 0);
});

test('language tags are normalized before scoring', () => {
  const measured = measureRegion({ timeZone: 'Asia/Shanghai', languages: ['zh_CN.UTF-8'], utcOffsetMinutes: 480 });
  assert.equal(measured.language, 'zh-CN');
  assert.equal(measured.value, 1);
});

test('probability is zero at or below the floor and linear above it', () => {
  const config = { scoreFloor: 0.4, banChancePerTurn: 0.5 };
  assert.equal(banProbability(0.4, config), 0);
  assert.equal(banProbability(0.1, config), 0);
  assert.equal(banProbability(1, config), 0.5);
  assert.ok(banProbability(0.7, config) > banProbability(0.6, config));
  assert.ok(banProbability(0.7, config) < banProbability(0.8, config));
});

test('config normalization applies defaults and clamps bad input', () => {
  const defaults = normalizeConfig(undefined);
  assert.equal(defaults.dryRun, true);
  assert.equal(defaults.purgeLogin, true);
  assert.equal(defaults.agentBanTool, true);
  assert.deepEqual(defaults.purgeApiKeys, ['DEEPSEEK_API_KEY']);
  assert.deepEqual(defaults.purgeFiles, []);

  const clamped = normalizeConfig({
    dryRun: false,
    banChancePerTurn: 9,
    scoreFloor: -3,
    purgeApiKeys: ['  A  ', '', 42, 'A', 'B'],
    purgeFiles: 'nope',
    banDelayMinMs: 5000,
    banDelayMaxMs: 100,
  });
  assert.equal(clamped.dryRun, false);
  assert.equal(clamped.banChancePerTurn, 1);
  assert.equal(clamped.scoreFloor, 0);
  assert.deepEqual(clamped.purgeApiKeys, ['A', 'B']);
  assert.deepEqual(clamped.purgeFiles, []);
  assert.equal(clamped.banDelayMinMs, 100);
  assert.equal(clamped.banDelayMaxMs, 5000);
});
