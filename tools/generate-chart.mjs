#!/usr/bin/env node
import fs from 'node:fs';

const [, , outFile = 'chart.json', bpmArg = '160', lengthArg = '35', seedArg = '11'] = process.argv;
const bpm = Number(bpmArg);
const lengthSec = Number(lengthArg);
let seed = Number(seedArg) | 0;

function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 10000) / 10000;
}

const beat = 60000 / bpm;
let t = 1400;
const notes = [];
while (t < lengthSec * 1000) {
  const lane = Math.floor(rnd() * 6);
  const p = rnd();
  let type = 'tap';
  let duration = 0;
  if (p > 0.76) type = 'flick';
  if (p > 0.86) type = 'drag';
  if (p > 0.92) { type = 'hold'; duration = beat * (1 + rnd() * 1.8); }
  notes.push({ lane, time: Math.round(t), type, duration: Math.round(duration) });
  t += beat * (0.3 + rnd() * 0.95);
}

fs.writeFileSync(outFile, JSON.stringify({ bpm, lengthSec, notes }, null, 2));
console.log(`Generated ${notes.length} notes -> ${outFile}`);
