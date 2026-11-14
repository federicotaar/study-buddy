// Smoke test for app.js with a stubbed DOM and localStorage (plain node, no deps).
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function makeEl() {
  return {
    children: [], value: '25', textContent: '', innerHTML: '', disabled: false, dataset: {},
    addEventListener(t, f) { (this._h = this._h || {})[t] = f; },
    appendChild(c) { this.children.push(c); },
    querySelector() { return makeEl(); },
  };
}
const els = {};
const store = new Map();
const ctx = {
  console,
  document: {
    getElementById: id => (els[id] = els[id] || makeEl()),
    createElement: () => makeEl(),
    addEventListener() {},
    title: '',
  },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  navigator: {},
  window: {},
  confirm: () => true,
  alert: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../app.js', 'utf8'), ctx);

// formatTime pads minutes and seconds
assert.strictEqual(vm.runInContext('formatTime(65)', ctx), '01:05');
// stats with a corrupt shape normalize to zeros instead of showing undefined
store.set('studyBuddy:stats:' + vm.runInContext('todayKey()', ctx), '{"sessions":"x"}');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadStats()', ctx))), { sessions: 0, minutes: 0 });
// a completed work session credits the minutes it started with,
// not whatever the settings input says later
vm.runInContext('setMode("work"); startTimer();', ctx);
els.workMinutes.value = '5';
vm.runInContext('onSessionEnd()', ctx);
assert.strictEqual(vm.runInContext('loadStats()', ctx).minutes, 25);
console.log('APP TESTS PASS');
