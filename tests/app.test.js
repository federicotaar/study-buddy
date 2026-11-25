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
    getElementById: id => (els[id] = els[id] || (id==='taskSearch'?{...makeEl(),value:''}:makeEl())),
    createElement: () => makeEl(),
    addEventListener(type, f) { (this._h = this._h || {})[type] = f; },
    title: '',
  },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null,
  },
  navigator: {},
  window: {},
  confirm: () => true,
  prompt: () => 'x',
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

// weekly totals sum today plus the previous 6 days, ignoring corrupt days
store.clear();
const dayKeyOffset = vm.runInContext('dayKeyOffset', ctx);
store.set('studyBuddy:stats:' + vm.runInContext('todayKey()', ctx), '{"sessions":2,"minutes":50}');
store.set('studyBuddy:stats:' + vm.runInContext('dayKeyOffset(1)', ctx), '{"sessions":1,"minutes":25}');
store.set('studyBuddy:stats:' + vm.runInContext('dayKeyOffset(6)', ctx), '{"sessions":1,"minutes":20}');
store.set('studyBuddy:stats:' + vm.runInContext('dayKeyOffset(7)', ctx), '{"sessions":9,"minutes":999}');
store.set('studyBuddy:stats:' + vm.runInContext('dayKeyOffset(3)', ctx), 'not json');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadWeekStats()', ctx))), { sessions: 4, minutes: 95 });

// streak counts consecutive days with sessions, today or yesterday as anchor
assert.strictEqual(vm.runInContext('computeStreak()', ctx), 2);
store.delete('studyBuddy:stats:' + vm.runInContext('todayKey()', ctx));
assert.strictEqual(vm.runInContext('computeStreak()', ctx), 1);
store.delete('studyBuddy:stats:' + vm.runInContext('dayKeyOffset(1)', ctx));
assert.strictEqual(vm.runInContext('computeStreak()', ctx), 0);

// session log records completed work sessions, newest first, capped at 50
store.clear();
vm.runInContext('appendSessionLog(25); appendSessionLog(30)', ctx);
let log = JSON.parse(JSON.stringify(vm.runInContext('loadSessionLog()', ctx)));
assert.strictEqual(log.length, 2);
assert.strictEqual(log[0].minutes, 30);
assert.strictEqual(log[1].minutes, 25);
store.set('studyBuddy:sessionLog', 'junk');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('loadSessionLog()', ctx))), []);

// CSV export lists stored days oldest first with a header
store.clear();
store.set('studyBuddy:stats:2026-11-19', '{"sessions":2,"minutes":50}');
store.set('studyBuddy:stats:2026-11-17', '{"sessions":1,"minutes":25}');
store.set('studyBuddy:tasks', '[]');
const csv = vm.runInContext('exportStatsCsv()', ctx);
assert.strictEqual(csv, 'day,sessions,minutes\n2026-11-17,1,25\n2026-11-19,2,50');

// session end with no AudioContext and no vibrate still credits the session
store.clear();
vm.runInContext('setMode("work"); startTimer(); onSessionEnd();', ctx);
assert.strictEqual(vm.runInContext('loadStats()', ctx).sessions, 1);
// and a working AudioContext path does not break accounting either
let oscStarted = 0;
ctx.window.AudioContext = function(){ return { currentTime: 0, destination: {},
  createOscillator: () => ({ type: '', frequency: { value: 0 }, connect(){}, start(){ oscStarted++; }, stop(){} }),
  createGain: () => ({ gain: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }) }; };
vm.runInContext('setMode("work"); startTimer(); onSessionEnd();', ctx);
assert.strictEqual(oscStarted, 1);
assert.strictEqual(vm.runInContext('loadStats()', ctx).sessions, 2);

// task edit and reorder validate their input and persist
store.clear();
ctx.prompt = () => 'studia matematica';
vm.runInContext('localStorage.setItem("studyBuddy:tasks", JSON.stringify([{text:"a",done:false},{text:"b",done:true}]))', ctx);
assert.strictEqual(vm.runInContext('editTask(0,"  nuovo testo ")', ctx), true);
assert.strictEqual(vm.runInContext('editTask(5,"x")', ctx), false);
assert.strictEqual(vm.runInContext('editTask(0,"   ")', ctx), false);
assert.strictEqual(vm.runInContext('moveTask(1,-1)', ctx), true);
assert.strictEqual(vm.runInContext('moveTask(0,-1)', ctx), false);
let tasks = JSON.parse(store.get('studyBuddy:tasks'));
assert.strictEqual(tasks[0].text, 'b');
assert.strictEqual(tasks[0].done, true);
assert.strictEqual(tasks[1].text, 'nuovo testo');
store.clear();
vm.runInContext('setMode("work")', ctx);
// a non-positive minutes value is rejected without touching the stored log
store.set('studyBuddy:sessionLog', JSON.stringify([{day:'2026-11-19',minutes:25,endedAt:'x'}]));
vm.runInContext('appendSessionLog(-5)', ctx);
assert.strictEqual(JSON.parse(store.get('studyBuddy:sessionLog')).length, 1);
vm.runInContext('localStorage.removeItem("studyBuddy:sessionLog")', ctx);

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


// Checkboxes expose the task text as their accessible name without interpolating user text into HTML.
store.set('studyBuddy:tasks',JSON.stringify([{text:'<b>read</b>',done:false}]));
vm.runInContext('renderTasks()',ctx);
{
 const row=els.taskList.children.at(-1);
 assert.ok(row.innerHTML.includes("aria-labelledby='task-title-0'"));
 assert.ok(row.innerHTML.includes("id='task-title-0'"));
 assert.ok(!row.innerHTML.includes('<b>read</b>'));
}


// Returning to the tab refreshes daily totals but never resets the active countdown.
store.set('studyBuddy:stats:'+vm.runInContext('todayKey()',ctx),JSON.stringify({sessions:7,minutes:123}));
vm.runInContext('setMode("work");startTimer()',ctx);
ctx.document.hidden=false;ctx.document._h.visibilitychange();
assert.strictEqual(els.sessions.textContent,7);
assert.strictEqual(els.minutes.textContent,123);
assert.strictEqual(vm.runInContext('isRunning',ctx),true);
vm.runInContext('pauseTimer()',ctx);

store.clear();store.set('other-app:secret','private');
store.set('studyBuddy:tasks','[{"text":"saved","done":false}]');
store.set('studyBuddy:stats:2026-11-20','{"sessions":2,"minutes":50}');
const backup=JSON.parse(vm.runInContext('exportBackup()',ctx));
assert.strictEqual(backup.app,'study-buddy');assert.strictEqual(backup.version,1);
assert.strictEqual(Object.keys(backup.entries).length,2);
assert.ok(!JSON.stringify(backup).includes('other-app'));

ctx.backupRaw=JSON.stringify(backup);
assert.strictEqual(Object.keys(vm.runInContext('validateBackup(backupRaw)',ctx)).length,2);
for(const entries of [{'other-app:secret':'"no"'},{'studyBuddy:stats:2026-02-30':'{"sessions":1,"minutes":1}'},{'studyBuddy:tasks':'[{"text":"x","done":"yes"}]'},{'studyBuddy:cycle':'4'}]){
 ctx.badBackup=JSON.stringify({app:'study-buddy',version:1,entries});
 assert.throws(()=>vm.runInContext('validateBackup(badBackup)',ctx));
}
ctx.badBackup=JSON.stringify({app:'study-buddy',version:2,entries:{}});
assert.throws(()=>vm.runInContext('validateBackup(badBackup)',ctx));

store.set('studyBuddy:tasks','[{"text":"temporary","done":true}]');
vm.runInContext('restoreBackup(backupRaw)',ctx);
assert.strictEqual(JSON.parse(store.get('studyBuddy:tasks'))[0].text,'saved');
assert.strictEqual(store.get('other-app:secret'),'private');
assert.strictEqual(vm.runInContext('isRunning',ctx),false);
const originalSet=ctx.localStorage.setItem;
let failOnce=true;ctx.localStorage.setItem=(k,v)=>{if(failOnce){failOnce=false;throw Error('quota');}return originalSet(k,v);};
const beforeRestore=JSON.stringify([...store]);
assert.throws(()=>vm.runInContext('restoreBackup(backupRaw)',ctx));
assert.strictEqual(JSON.stringify([...store]),beforeRestore);
ctx.localStorage.setItem=originalSet;

store.set('studyBuddy:tasks','[{"text":"done","done":true},{"text":"keep","done":false}]');
assert.strictEqual(vm.runInContext('clearCompletedTasks()',ctx),1);
assert.strictEqual(vm.runInContext('loadTasks()[0].text',ctx),'keep');
assert.strictEqual(vm.runInContext('clearCompletedTasks()',ctx),0);
ctx.localStorage.setItem=()=>{throw Error('blocked');};
store.set('studyBuddy:tasks','[{"text":"done","done":true}]');
assert.strictEqual(vm.runInContext('clearCompletedTasks()',ctx),false);
assert.strictEqual(JSON.parse(store.get('studyBuddy:tasks')).length,1);
ctx.localStorage.setItem=originalSet;

store.set('studyBuddy:tasks','[{"text":"Math 50%","done":false},{"text":"English","done":true}]');
els.taskSearch.value='MATH';els.taskList.children=[];vm.runInContext('renderTasks()',ctx);
assert.strictEqual(els.taskList.children.length,1);
assert.ok(els.taskList.children[0].innerHTML.includes("data-idx='0'"));
els.taskSearch.value='english';els.taskList.children=[];vm.runInContext('renderTasks()',ctx);
assert.strictEqual(els.taskList.children.length,1);
assert.ok(els.taskList.children[0].innerHTML.includes("data-idx='1'"));
els.taskSearch.value='';

store.clear();
assert.strictEqual(vm.runInContext('dailyGoal()',ctx),0);
assert.strictEqual(vm.runInContext('setDailyGoal("60")',ctx),true);
store.set('studyBuddy:stats:'+vm.runInContext('todayKey()',ctx),'{"sessions":2,"minutes":50}');
assert.strictEqual(vm.runInContext('goalProgress().remaining',ctx),10);
assert.strictEqual(vm.runInContext('goalProgress().percent',ctx),83);
assert.strictEqual(vm.runInContext('setDailyGoal("25")',ctx),true);
assert.strictEqual(vm.runInContext('goalProgress().percent',ctx),100);
assert.strictEqual(vm.runInContext('goalProgress().remaining',ctx),0);
assert.strictEqual(vm.runInContext('loadStats().minutes',ctx),50);
for(const raw of ['-1','1.5','1441','60min','', '1e2']){
 ctx.goalRaw=raw;assert.strictEqual(vm.runInContext('setDailyGoal(goalRaw)',ctx),false);
}
assert.strictEqual(vm.runInContext('dailyGoal()',ctx),25);
ctx.goalBackup=vm.runInContext('exportBackup()',ctx);
assert.strictEqual(JSON.parse(ctx.goalBackup).entries['studyBuddy:dailyGoal'],'25');
assert.strictEqual(vm.runInContext('validateBackup(goalBackup)[GOAL_KEY]',ctx),'25');

els.dailyGoal.value='100';els.goalForm._h.submit({preventDefault(){}});
assert.strictEqual(vm.runInContext('dailyGoal()',ctx),100);
assert.strictEqual(els.goalProgress.value,50);
assert.ok(els.goalStatus.textContent.includes('ne mancano 50'));
ctx.goalBackup=vm.runInContext('exportBackup()',ctx);
vm.runInContext('setDailyGoal("0");renderGoal()',ctx);
assert.strictEqual(els.goalProgress.hidden,true);
vm.runInContext('restoreBackup(goalBackup)',ctx);
assert.strictEqual(vm.runInContext('dailyGoal()',ctx),100);
assert.strictEqual(els.goalProgress.hidden,false);
assert.strictEqual(els.goalProgress.value,50);
vm.runInContext('saveStats({sessions:4,minutes:120});renderStats()',ctx);
assert.strictEqual(els.goalProgress.value,100);
assert.ok(els.goalStatus.textContent.includes('raggiunto'));

assert.strictEqual(vm.runInContext('formatTime(-5)',ctx),'00:00');
assert.strictEqual(vm.runInContext('formatTime(NaN)',ctx),'00:00');
assert.strictEqual(vm.runInContext('formatTime(61.9)',ctx),'01:01');
assert.strictEqual(vm.runInContext('formatTime(3600)',ctx),'60:00');

store.clear();
els.taskInput.value='x'.repeat(2001);els.taskForm._h.submit({preventDefault(){}});
assert.strictEqual(vm.runInContext('loadTasks().length',ctx),0);
els.taskInput.value='x'.repeat(2000);els.taskForm._h.submit({preventDefault(){}});
assert.strictEqual(vm.runInContext('loadTasks().length',ctx),1);
assert.doesNotThrow(()=>vm.runInContext('validateBackup(exportBackup())',ctx));

assert.strictEqual(vm.runInContext('editTask(0,"   ")',ctx),false);
assert.strictEqual(vm.runInContext('editTask(0,"y".repeat(2001))',ctx),false);
assert.strictEqual(vm.runInContext('editTask(0,"nuovo testo")',ctx),true);
assert.strictEqual(vm.runInContext('loadTasks()[0].text',ctx),'nuovo testo');

store.clear();
els.taskInput.value='Ripassa storia';els.taskForm._h.submit({preventDefault(){}});
els.taskInput.value='  ripassa STORIA ';els.taskForm._h.submit({preventDefault(){}});
assert.strictEqual(vm.runInContext('loadTasks().length',ctx),1);
assert.strictEqual(vm.runInContext('hasTask("RIPASSA storia")',ctx),true);
assert.strictEqual(vm.runInContext('hasTask("")',ctx),false);

store.clear();
for(const d of ['2026-01-01','2026-01-02','2026-01-03','2026-01-05','2026-01-06'])store.set('studyBuddy:stats:'+d,'{"sessions":1,"minutes":25}');
store.set('studyBuddy:stats:2026-01-04','{"sessions":0,"minutes":0}');
assert.strictEqual(vm.runInContext('computeLongestStreak()',ctx),3);
store.clear();
assert.strictEqual(vm.runInContext('computeLongestStreak()',ctx),0);

store.clear();store.set('studyBuddy:stats:2026-02-01','{"sessions":2,"minutes":50}');store.set('studyBuddy:stats:2026-02-02','{"sessions":1,"minutes":25}');
vm.runInContext('renderStats()',ctx);
assert.strictEqual(String(els.bestStreak.textContent),'2');

store.clear();
assert.strictEqual(vm.runInContext('averageSessionMinutes()',ctx),0);
vm.runInContext('saveStats({sessions:2,minutes:45})',ctx);
assert.strictEqual(vm.runInContext('averageSessionMinutes()',ctx),23);

store.clear();
vm.runInContext('saveTasks([{text:"a",done:false},{text:"b",done:true},{text:"c",done:false}])',ctx);
assert.strictEqual(vm.runInContext('setAllTasksDone(true)',ctx),2);
assert.strictEqual(vm.runInContext('loadTasks().every(t=>t.done)',ctx),true);
assert.strictEqual(vm.runInContext('setAllTasksDone(true)',ctx),0);
assert.strictEqual(vm.runInContext('setAllTasksDone(false)',ctx),3);
assert.strictEqual(vm.runInContext('loadTasks().some(t=>t.done)',ctx),false);

store.clear();
vm.runInContext('saveTasks([{text:"a",done:false},{text:"b",done:false}]);renderTasks()',ctx);
assert.strictEqual(els.toggleAll.textContent,'Completa tutti');
els.toggleAll._h.click();
assert.strictEqual(vm.runInContext('loadTasks().every(t=>t.done)',ctx),true);
assert.strictEqual(els.toggleAll.textContent,'Riapri tutti');
els.toggleAll._h.click();
assert.strictEqual(vm.runInContext('loadTasks().some(t=>t.done)',ctx),false);

store.clear();
vm.runInContext('appendSessionLog(25);appendSessionLog(50);appendSessionLog(5)',ctx);
const lines=vm.runInContext('recentSessionLines(2)',ctx);
assert.strictEqual(lines.length,2);
assert.ok(lines[0].endsWith(' - 5 min'));
assert.ok(lines[1].endsWith(' - 50 min'));
assert.strictEqual(vm.runInContext('recentSessionLines(0).length',ctx),0);

store.clear();els.sessionHistory.children=[];
vm.runInContext('appendSessionLog(30);renderStats()',ctx);
assert.strictEqual(els.sessionHistory.children.length,1);
assert.ok(els.sessionHistory.children[0].textContent.endsWith(' - 30 min'));

// formatMinutes shows hours once a total reaches 60 minutes and clamps bad input
assert.strictEqual(vm.runInContext('formatMinutes(0)',ctx),'0 min');
assert.strictEqual(vm.runInContext('formatMinutes(59)',ctx),'59 min');
assert.strictEqual(vm.runInContext('formatMinutes(60)',ctx),'1 h');
assert.strictEqual(vm.runInContext('formatMinutes(125)',ctx),'2 h 5 min');
assert.strictEqual(vm.runInContext('formatMinutes(-5)',ctx),'0 min');
assert.strictEqual(vm.runInContext('formatMinutes(NaN)',ctx),'0 min');
console.log('FORMAT MINUTES PASS');

// taskCounts reports total, done and open tasks and survives corrupted storage
store.set('studyBuddy:tasks','[]');
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('taskCounts()',ctx))),{total:0,done:0,open:0});
store.set('studyBuddy:tasks',JSON.stringify([{text:'a',done:true},{text:'b',done:false},{text:'c'}]));
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('taskCounts()',ctx))),{total:3,done:1,open:2});
store.set('studyBuddy:tasks','not json');
assert.strictEqual(vm.runInContext('taskCounts().total',ctx),0);
store.set('studyBuddy:tasks','[]');
console.log('TASK COUNTS PASS');

// exportTasksText writes one markdown checklist line per task
store.set('studyBuddy:tasks',JSON.stringify([{text:'Leggi cap. 3',done:true},{text:'Esercizi\npag 4',done:false}]));
assert.strictEqual(vm.runInContext('exportTasksText()',ctx),'- [x] Leggi cap. 3\n- [ ] Esercizi pag 4');
store.set('studyBuddy:tasks','[]');
assert.strictEqual(vm.runInContext('exportTasksText()',ctx),'');
console.log('EXPORT TASKS TEXT PASS');

// importTasksFromText strips bullets, skips blanks and duplicates, honours the limits
store.set('studyBuddy:tasks',JSON.stringify([{text:'Matematica',done:false}]));
assert.strictEqual(vm.runInContext('importTasksFromText("- [ ] Storia\\n2) Inglese\\n\\n  matematica  \\n* Fisica\\r\\nStoria")',ctx),3);
assert.deepStrictEqual(JSON.parse(store.get('studyBuddy:tasks')).map(t=>t.text),['Matematica','Storia','Inglese','Fisica']);
assert.strictEqual(vm.runInContext('importTasksFromText(42)',ctx),0);
assert.strictEqual(vm.runInContext('importTasksFromText("x".repeat(2001))',ctx),0);
store.set('studyBuddy:tasks','[]');
console.log('IMPORT TASKS TEXT PASS');

// sortDoneLast moves finished tasks down and keeps the order inside each group
store.set('studyBuddy:tasks',JSON.stringify([{text:'a',done:true},{text:'b',done:false},{text:'c',done:true},{text:'d',done:false}]));
assert.ok(vm.runInContext('sortDoneLast()',ctx)>0);
assert.deepStrictEqual(JSON.parse(store.get('studyBuddy:tasks')).map(t=>t.text),['b','d','a','c']);
assert.strictEqual(vm.runInContext('sortDoneLast()',ctx),0);
store.set('studyBuddy:tasks','[]');
console.log('SORT DONE LAST PASS');

// goalDaysThisWeek counts the last 7 days that reached the goal, and is 0 without a goal
store.set('studyBuddy:dailyGoal','0');
assert.strictEqual(vm.runInContext('goalDaysThisWeek()',ctx),0);
store.set('studyBuddy:dailyGoal','30');
store.set('studyBuddy:stats:'+vm.runInContext('dayKeyOffset(0)',ctx),'{"sessions":2,"minutes":50}');
store.set('studyBuddy:stats:'+vm.runInContext('dayKeyOffset(2)',ctx),'{"sessions":1,"minutes":25}');
store.set('studyBuddy:stats:'+vm.runInContext('dayKeyOffset(3)',ctx),'{"sessions":1,"minutes":30}');
store.set('studyBuddy:stats:'+vm.runInContext('dayKeyOffset(8)',ctx),'{"sessions":9,"minutes":999}');
assert.strictEqual(vm.runInContext('goalDaysThisWeek()',ctx),2);
store.set('studyBuddy:dailyGoal','0');
console.log('GOAL DAYS PASS');

// taskPercentDone is a rounded percentage and 0 when there are no tasks
store.set('studyBuddy:tasks','[]');
assert.strictEqual(vm.runInContext('taskPercentDone()',ctx),0);
store.set('studyBuddy:tasks',JSON.stringify([{text:'a',done:true},{text:'b',done:false},{text:'c',done:false}]));
assert.strictEqual(vm.runInContext('taskPercentDone()',ctx),33);
store.set('studyBuddy:tasks',JSON.stringify([{text:'a',done:true},{text:'b',done:true},{text:'c',done:false}]));
assert.strictEqual(vm.runInContext('taskPercentDone()',ctx),67);
store.set('studyBuddy:tasks','[]');
console.log('TASK PERCENT PASS');

// taskMatches is case-insensitive, trims the query and matches everything when it is blank
assert.strictEqual(vm.runInContext("taskMatches({text:'Studia Matematica'},'  MATE ')",ctx),true);
assert.strictEqual(vm.runInContext("taskMatches({text:'Studia Matematica'},'storia')",ctx),false);
assert.strictEqual(vm.runInContext("taskMatches({text:'x'},'')",ctx),true);
assert.strictEqual(vm.runInContext("taskMatches({text:'x'},null)",ctx),true);
assert.strictEqual(vm.runInContext("taskMatches(null,'a')",ctx),false);
console.log('TASK MATCHES PASS');
