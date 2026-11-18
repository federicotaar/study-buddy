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
  performance: { now: () => 1000 },
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

// Duration caps agree with the HTML controls.
for(const [field,modeName,max] of [['workMinutes','work',180],['shortMinutes','short',60],['longMinutes','long',120]]){
 els[field].value='999999'; vm.runInContext(`setMode('${modeName}')`,ctx);
 assert.strictEqual(vm.runInContext('remaining',ctx),max*60);
 els[field].value='-8'; vm.runInContext(`setMode('${modeName}')`,ctx);
 assert.strictEqual(vm.runInContext('remaining',ctx),60);
}
els.workMinutes.value='25';els.shortMinutes.value='5';els.longMinutes.value='15';

// Editing settings invalidates an active timer rather than preserving its deadline.
vm.runInContext('setMode("work");startTimer()',ctx);
els.workMinutes.value='12';els.workMinutes._h.change();
assert.strictEqual(vm.runInContext('isRunning',ctx),false);
assert.strictEqual(vm.runInContext('remaining',ctx),720);
assert.strictEqual(ctx.document.title,'Study Buddy');

// A denied vibration API must not lose a completed session.
ctx.navigator.vibrate=()=>{throw Error('denied')};
vm.runInContext('setMode("work");startTimer()',ctx);
const sessionsBefore=vm.runInContext('loadStats().sessions',ctx);
vm.runInContext('onSessionEnd()',ctx);
assert.strictEqual(vm.runInContext('loadStats().sessions',ctx),sessionsBefore+1);
assert.strictEqual(vm.runInContext('isRunning',ctx),false);
delete ctx.navigator.vibrate;

// Corrupt statistics are not displayed or propagated into the next session.
for(const bad of [-1,1.5,'Infinity','NaN']){
 store.set('studyBuddy:stats:'+vm.runInContext('todayKey()',ctx),JSON.stringify({sessions:bad,minutes:bad}));
 assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadStats()',ctx))),{sessions:0,minutes:0});
}
// Keyboard repeat, editable regions and modified shortcuts are not timer controls.
vm.runInContext('pauseTimer()',ctx);
for(const extra of [{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true},{target:{tagName:'DIV',isContentEditable:true}}]){
 ctx.document._h.keydown({code:'Space',target:{tagName:'DIV'},preventDefault(){},...extra});
 assert.strictEqual(vm.runInContext('isRunning',ctx),false);
}
console.log('STORAGE AND TIMER REGRESSIONS PASS');

// Long breaks recur on the fourth completed work session, including wraparound.
vm.runInContext('completedWorkSessions=3;setMode("work");startTimer();onSessionEnd()',ctx);
assert.strictEqual(vm.runInContext('mode',ctx),'long');
assert.strictEqual(vm.runInContext('completedWorkSessions',ctx),0);
assert.strictEqual(store.get('studyBuddy:cycle'),'0');
vm.runInContext('setMode("work");startTimer();onSessionEnd()',ctx);
assert.strictEqual(vm.runInContext('mode',ctx),'short');
assert.strictEqual(vm.runInContext('completedWorkSessions',ctx),1);

// A pause immediately restores the idle tab title and button state.
vm.runInContext('setMode("work");startTimer();updateTime()',ctx);
assert.ok(ctx.document.title.includes('Study Buddy'));
vm.runInContext('pauseTimer()',ctx);
assert.strictEqual(ctx.document.title,'Study Buddy');
assert.strictEqual(els.start.disabled,false);
assert.strictEqual(els.pause.disabled,true);
assert.strictEqual(vm.runInContext('timerInterval',ctx),null);

// Partial saved settings change only valid fields, keeping the others intact.
els.workMinutes.value='25';els.shortMinutes.value='5';els.longMinutes.value='15';
store.set('studyBuddy:settings',JSON.stringify({work:40,short:null,long:999}));
vm.runInContext('loadSettings()',ctx);
assert.strictEqual(els.workMinutes.value,'40');
assert.strictEqual(els.shortMinutes.value,'5');
assert.strictEqual(els.longMinutes.value,'15');

// Clearing data while running must cancel the deadline and reset the cycle.
vm.runInContext('setMode("work");startTimer()',ctx);
ctx.window._studyBuddyResetAll();
assert.strictEqual(vm.runInContext('isRunning',ctx),false);
assert.strictEqual(vm.runInContext('completedWorkSessions',ctx),0);
assert.strictEqual(store.has('studyBuddy:cycle'),false);
assert.strictEqual(vm.runInContext('mode',ctx),'work');
assert.strictEqual(ctx.document.title,'Study Buddy');

// Declining a destructive reset leaves existing task data and timer untouched.
store.set('studyBuddy:tasks',JSON.stringify([{text:'keep me',done:false}]));
vm.runInContext('setMode("work");startTimer()',ctx);
ctx.confirm=()=>false;
ctx.window._studyBuddyResetAll();
assert.strictEqual(vm.runInContext('isRunning',ctx),true);
assert.strictEqual(JSON.parse(store.get('studyBuddy:tasks'))[0].text,'keep me');
ctx.confirm=()=>true;
vm.runInContext('pauseTimer()',ctx);
console.log('POMODORO LIFECYCLE REGRESSIONS PASS');

// Timer timing is monotonic, rounds up and ignores callbacks after pause.
els.workMinutes.value='40';
ctx.performance.now=()=>1000;
vm.runInContext('setMode("work");startTimer()',ctx);
assert.ok(ctx.document.title.startsWith('40:00'));
ctx.performance.now=()=>1501;
vm.runInContext('tick()',ctx);
assert.strictEqual(vm.runInContext('remaining',ctx),2400);
ctx.performance.now=()=>2501;
vm.runInContext('pauseTimer()',ctx);
assert.strictEqual(vm.runInContext('remaining',ctx),2399);
const sessionsAtPause=vm.runInContext('loadStats().sessions',ctx);
ctx.performance.now=()=>10000000;
vm.runInContext('tick()',ctx);
assert.strictEqual(vm.runInContext('loadStats().sessions',ctx),sessionsAtPause);
assert.strictEqual(vm.runInContext('isRunning',ctx),false);
console.log('MONOTONIC TIMER TESTS PASS');

// A denied storage read at startup must not prevent timer initialization.
{
 const fresh={};
 const denied={...ctx,document:{...ctx.document,_h:{},getElementById:id=>(fresh[id]=fresh[id]||makeEl())},localStorage:{getItem(){throw Error('denied')},setItem(){},removeItem(){}},window:{}};
 vm.createContext(denied);
 vm.runInContext(fs.readFileSync(__dirname+'/../app.js','utf8'),denied);
 assert.strictEqual(vm.runInContext('completedWorkSessions',denied),0);
 assert.ok(vm.runInContext('Number.isFinite(remaining)&&remaining>0',denied));
}


// A quota failure must not clear the draft or replace the stored task list.
{
 const save=ctx.localStorage.setItem, notify=ctx.alert;
 let notices=0;ctx.alert=()=>notices++;
 ctx.localStorage.setItem=()=>{throw Error('quota')};
 els.taskInput.value='keep this draft';
 const before=store.get('studyBuddy:tasks');
 els.taskForm._h.submit({preventDefault(){}});
 assert.strictEqual(els.taskInput.value,'keep this draft');
 assert.strictEqual(store.get('studyBuddy:tasks'),before);
 assert.strictEqual(notices,1);
 ctx.localStorage.setItem=save;ctx.alert=notify;
}


// Failed settings persistence still invalidates the old running deadline.
{
 const save=ctx.localStorage.setItem;
 vm.runInContext('setMode("work");startTimer()',ctx);
 ctx.localStorage.setItem=()=>{throw Error('denied')};
 els.workMinutes.value='17';els.workMinutes._h.change();
 assert.strictEqual(vm.runInContext('isRunning',ctx),false);
 assert.strictEqual(vm.runInContext('remaining',ctx),1020);
 ctx.localStorage.setItem=save;
}


// Completing work must stop the interval and advance to a break even if all writes fail.
{
 const save=ctx.localStorage.setItem;
 vm.runInContext('completedWorkSessions=0;setMode("work");startTimer()',ctx);
 ctx.localStorage.setItem=()=>{throw Error('quota')};
 vm.runInContext('onSessionEnd()',ctx);
 assert.strictEqual(vm.runInContext('isRunning',ctx),false);
 assert.strictEqual(vm.runInContext('mode',ctx),'short');
 assert.strictEqual(vm.runInContext('completedWorkSessions',ctx),1);
 ctx.localStorage.setItem=save;
}


// Reset all means default durations too, not just deleting the saved settings key.
els.workMinutes.value='44';els.shortMinutes.value='9';els.longMinutes.value='30';
ctx.window._studyBuddyResetAll();
assert.deepStrictEqual([els.workMinutes.value,els.shortMinutes.value,els.longMinutes.value],['25','5','15']);
assert.strictEqual(vm.runInContext('remaining',ctx),1500);


// A duplicate callback after completion cannot credit a second work session.
vm.runInContext('setMode("work");startTimer();onSessionEnd()',ctx);
{
 const stats=JSON.stringify(vm.runInContext('loadStats()',ctx));
 const nextMode=vm.runInContext('mode',ctx);
 vm.runInContext('onSessionEnd()',ctx);
 assert.strictEqual(JSON.stringify(vm.runInContext('loadStats()',ctx)),stats);
 assert.strictEqual(vm.runInContext('mode',ctx),nextMode);
}
