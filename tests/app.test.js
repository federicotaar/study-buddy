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
    addEventListener(type, f) { (this._h = this._h || {})[type] = f; },
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
// an empty or invalid duration input falls back to the mode default
// instead of breaking the timer with NaN
els.workMinutes.value = '';
vm.runInContext('setMode("work")', ctx);
assert.strictEqual(vm.runInContext('remaining', ctx), 25 * 60);
assert.strictEqual(vm.runInContext('formatTime(remaining)', ctx), '25:00');
els.shortMinutes.value = 'abc';
vm.runInContext('setMode("short")', ctx);
assert.strictEqual(vm.runInContext('remaining', ctx), 5 * 60);
els.workMinutes.value = '25'; els.shortMinutes.value = '5';
// pausing and resuming still credits the full session, not the minutes left at resume
vm.runInContext('setMode("work"); startTimer(); pauseTimer(); startTimer(); onSessionEnd()', ctx);
assert.strictEqual(vm.runInContext('loadStats()', ctx).minutes, 50);
// Space on a focused button must not double-toggle the timer (the button's
// own click already fires); only keys from the page background drive shortcuts
vm.runInContext('pauseTimer();', ctx);
ctx.document._h.keydown({ code: 'Space', target: { tagName: 'BUTTON' }, preventDefault() {} });
assert.strictEqual(vm.runInContext('isRunning', ctx), false);
ctx.document._h.keydown({ code: 'Space', target: { tagName: 'DIV' }, preventDefault() {} });
assert.strictEqual(vm.runInContext('isRunning', ctx), true);
vm.runInContext('pauseTimer();', ctx);

console.log('APP TESTS PASS');

// formatTime handles zero and full hours without dropping padding
assert.strictEqual(vm.runInContext('formatTime(0)', ctx), '00:00');
assert.strictEqual(vm.runInContext('formatTime(600)', ctx), '10:00');
// todayKey is the YYYY-MM-DD key the stats rows are stored under
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(vm.runInContext('todayKey()', ctx)));
// corrupt tasks JSON must not break the list: it falls back to empty
store.set('studyBuddy:tasks', '{not json');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadTasks()', ctx))), []);
// a corrupt settings blob is ignored, not thrown on
store.set('studyBuddy:settings', '][broken');
vm.runInContext('loadSettings()', ctx);

// Valid JSON can still contain unusable task data.
for(const value of ['null','{}','42','[null,{},false]']){
 store.set('studyBuddy:tasks',value);
 assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadTasks()',ctx))),[]);
}
store.set('studyBuddy:tasks','[{"text":"keep","done":true},{"text":"pending","done":"yes"}]');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadTasks()',ctx))),[{text:'keep',done:true},{text:'pending',done:false}]);

// Old DOM events must not mutate the wrong task or throw.
const beforeTasks=store.get('studyBuddy:tasks');
for(const dataset of [{idx:'999'},{idx:'-1'},{idx:'NaN'},{del:'-1'},{del:'999'},{del:'bad'}]){
 els.taskList._h.click({target:{dataset}});
 assert.strictEqual(store.get('studyBuddy:tasks'),beforeTasks);
}
