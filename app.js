// Study Buddy - app.js (minimal, works offline using localStorage)

const $ = id => document.getElementById(id);

// DOM
const timeEl = $('time');
const startBtn = $('start');
const pauseBtn = $('pause');
const resetBtn = $('reset');
const modeEl = $('mode');
const workInput = $('workMinutes');
const shortInput = $('shortMinutes');
const longInput = $('longMinutes');
const taskForm = $('taskForm');
const taskInput = $('taskInput');
const taskList = $('taskList');
const sessionsEl = $('sessions');
const minutesEl = $('minutes');
const resetStatsBtn = $('resetStats');

// Storage keys
const TASKS_KEY = 'studyBuddy:tasks';
const STATS_PREFIX = 'studyBuddy:stats:'; // + YYYY-MM-DD
const GOAL_KEY = 'studyBuddy:dailyGoal';
const MAX_TASK_LENGTH = 2000; // same limit validateBackup enforces, so backups always restore
const MAX_TASKS = 1000;
const CYCLE_KEY = 'studyBuddy:cycle'; // completed work sessions in the current long-break cycle

// Timer state
let timerInterval = null;
let remaining = 25 * 60;
let isRunning = false;
let mode = 'work'; // 'work' | 'short' | 'long'
let sessionMinutes = 25; // minutes credited when a work session ends, captured at start
let storedCycle=0;
try { storedCycle=Number(localStorage.getItem(CYCLE_KEY)); } catch(e) { /* storage can be denied for local files or private sessions */ }
let completedWorkSessions=Number.isSafeInteger(storedCycle)&&storedCycle>=0 ? storedCycle%4 : 0;

// Utilities
function pad(n){return n.toString().padStart(2,'0')}
function formatTime(sec){sec=Number.isFinite(sec)?Math.max(0,Math.floor(sec)):0;return `${pad(Math.floor(sec/60))}:${pad(sec%60)}`}
function formatMinutes(min){min=Number.isFinite(min)?Math.max(0,Math.floor(min)):0;if(min<60)return min+' min';const h=Math.floor(min/60),m=min%60;return m?`${h} h ${m} min`:`${h} h`}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}

// Tasks
function loadTasks(){
 try {
  const tasks=JSON.parse(localStorage.getItem(TASKS_KEY)||'[]');
  return Array.isArray(tasks) ? tasks.filter(t=>t && typeof t.text==='string').map(t=>({text:t.text,done:t.done===true})) : [];
 } catch(e){return []}
}
function hasTask(text){const key=String(text||'').trim().toLocaleLowerCase();return !!key&&loadTasks().some(t=>t.text.trim().toLocaleLowerCase()===key)}
function editTask(idx,text){const tasks=loadTasks();if(!Number.isSafeInteger(idx)||!tasks[idx])return false;const val=(text||'').trim();if(!val||val.length>MAX_TASK_LENGTH)return false;tasks[idx].text=val;return saveTasks(tasks)}
function setAllTasksDone(done){const tasks=loadTasks();if(!tasks.length)return 0;let changed=0;for(const t of tasks){if(t.done!==!!done){t.done=!!done;changed++}}if(!changed)return 0;return saveTasks(tasks)?changed:false}
function moveTask(idx,delta){const tasks=loadTasks();const j=idx+delta;if(!Number.isSafeInteger(idx)||!tasks[idx]||!tasks[j])return false;[tasks[idx],tasks[j]]=[tasks[j],tasks[idx]];return saveTasks(tasks)}
function taskCounts(){const tasks=loadTasks();const done=tasks.filter(t=>t.done).length;return {total:tasks.length,done,open:tasks.length-done}}
function exportTasksText(){return loadTasks().map(t=>(t.done?'- [x] ':'- [ ] ')+t.text.replace(/\s*\n\s*/g,' ')).join('\n')}
function importTasksFromText(text){if(typeof text!=='string')return 0;const tasks=loadTasks();const seen=new Set(tasks.map(t=>t.text.trim().toLocaleLowerCase()));let added=0;for(const raw of text.split(/\r?\n/)){const line=raw.replace(/^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/,'').trim();const key=line.toLocaleLowerCase();if(!line||line.length>MAX_TASK_LENGTH||seen.has(key)||tasks.length>=MAX_TASKS)continue;seen.add(key);tasks.push({text:line,done:false});added++}if(!added)return 0;return saveTasks(tasks)?added:false}
function sortDoneLast(){const tasks=loadTasks();const sorted=[...tasks.filter(t=>!t.done),...tasks.filter(t=>t.done)];if(sorted.every((t,i)=>t===tasks[i]))return 0;let moved=0;sorted.forEach((t,i)=>{if(t!==tasks[i])moved++});return saveTasks(sorted)?moved:false}
function taskPercentDone(){const c=taskCounts();return c.total?Math.round(c.done/c.total*100):0}
function taskMatches(t,query){const q=String(query||'').trim().toLocaleLowerCase();return !q||String(t&&t.text||'').toLocaleLowerCase().includes(q)}
function nextOpenTask(){const t=loadTasks().find(t=>!t.done);return t?t.text:null}
function saveTasks(tasks){
 try {localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));return true;}
 catch(e){alert('Impossibile salvare i task nel browser. I dati non sono stati modificati.');return false;}
}
function renderTasks(){if(typeof updateToggleAll==='function')updateToggleAll();const tasks=loadTasks();const summary=$('taskSummary');if(summary){const c=taskCounts();summary.textContent=c.done+' / '+c.total+' completati'};taskList.innerHTML='';tasks.forEach((t,idx)=>{const search=$('taskSearch');const query=search&&typeof search.value==='string'?search.value.trim().toLocaleLowerCase():'';if(!taskMatches(t,query))return;const li=document.createElement('li');li.className=t.done? 'task-done':'';li.innerHTML=`<input type=checkbox ${t.done? 'checked':''} data-idx='${idx}' aria-labelledby='task-title-${idx}'> <span class='title' id='task-title-${idx}'></span> <button data-up='${idx}' aria-label='Sposta su'>&uarr;</button> <button data-down='${idx}' aria-label='Sposta gi&ugrave;'>&darr;</button> <button data-edit='${idx}'>Modifica</button> <button data-del='${idx}'>Elimina</button>`;li.querySelector('.title').textContent=t.text;taskList.appendChild(li)})}

taskForm.addEventListener('submit',e=>{e.preventDefault();const val=taskInput.value.trim();if(!val) return;if(val.length>MAX_TASK_LENGTH){alert('Il task e\' troppo lungo (massimo '+MAX_TASK_LENGTH+' caratteri).');return;}if(hasTask(val)){taskInput.value='';return;}const tasks=loadTasks();if(tasks.length>=MAX_TASKS){alert('Hai raggiunto il massimo di '+MAX_TASKS+' task.');return;}tasks.push({text:val,done:false});if(!saveTasks(tasks))return;taskInput.value='';renderTasks();})

taskList.addEventListener('click',e=>{const idx=e.target.dataset.idx;const del=e.target.dataset.del;const up=e.target.dataset.up;const down=e.target.dataset.down;const edit=e.target.dataset.edit;const tasks=loadTasks();const valid=v=>/^\d+$/.test(v)&&tasks[Number(v)];if(typeof idx!=='undefined'){if(!valid(idx))return;tasks[Number(idx)].done=!tasks[Number(idx)].done;if(!saveTasks(tasks))return;renderTasks();}else if(typeof del!=='undefined'){if(!valid(del))return;tasks.splice(Number(del),1);if(!saveTasks(tasks))return;renderTasks();}else if(typeof up!=='undefined'){if(!valid(up))return;if(moveTask(Number(up),-1))renderTasks();}else if(typeof down!=='undefined'){if(!valid(down))return;if(moveTask(Number(down),1))renderTasks();}else if(typeof edit!=='undefined'){if(!valid(edit))return;const cur=tasks[Number(edit)].text;const next=prompt('Modifica il task:',cur);if(next===null)return;if(editTask(Number(edit),next))renderTasks();}})

// Stats
function dayKeyOffset(offset){const d=new Date();d.setDate(d.getDate()-offset);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function loadStatsFor(dayKey){try{const s=JSON.parse(localStorage.getItem(STATS_PREFIX+dayKey)||'{}')||{};const clean=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;return {sessions:clean(s.sessions),minutes:clean(s.minutes)}}catch(e){return {sessions:0,minutes:0}}}
// Current streak: consecutive days with at least one completed session, ending today or yesterday
function computeStreak(){let streak=0;let i=loadStatsFor(dayKeyOffset(0)).sessions>0?0:1;while(loadStatsFor(dayKeyOffset(i)).sessions>0){streak++;i++}return streak}
// Longest run of consecutive days with at least one session, over every stored day
function computeLongestStreak(){const days=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf(STATS_PREFIX)===0){const d=k.slice(STATS_PREFIX.length);if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&loadStatsFor(d).sessions>0)days.push(d)}}}catch(e){return 0}days.sort();let best=0,run=0,prev=null;for(const d of days){const t=Date.parse(d+'T00:00:00Z');run=prev!==null&&t-prev===86400000?run+1:1;prev=t;if(run>best)best=run}return best}
function loadWeekStats(){let sessions=0,minutes=0;for(let i=0;i<7;i++){const s=loadStatsFor(dayKeyOffset(i));sessions+=s.sessions;minutes+=s.minutes}return {sessions,minutes}}
function averageSessionMinutes(){const w=loadWeekStats();return w.sessions>0?Math.round(w.minutes/w.sessions):0}
function loadStats(){return loadStatsFor(todayKey())} 
function saveStats(s){
 try {localStorage.setItem(STATS_PREFIX+todayKey(),JSON.stringify(s));return true;}
 catch(e){alert('Impossibile salvare le statistiche di oggi nel browser.');return false;}
}
const streakEl = $('streak');
const weekSessionsEl = $('weekSessions');
const weekMinutesEl = $('weekMinutes');
function renderStats(){const s=loadStats();sessionsEl.textContent=s.sessions;minutesEl.textContent=s.minutes;if(weekSessionsEl&&weekMinutesEl){const w=loadWeekStats();weekSessionsEl.textContent=w.sessions;weekMinutesEl.textContent=w.minutes}if(streakEl)streakEl.textContent=computeStreak();const histEl=$('sessionHistory');if(histEl){histEl.innerHTML='';for(const line of recentSessionLines(5)){const li=document.createElement('li');li.textContent=line;histEl.appendChild(li)}}const avgEl=$('avgSession');if(avgEl)avgEl.textContent=averageSessionMinutes();const bestEl=$('bestStreak');if(bestEl)bestEl.textContent=computeLongestStreak();renderGoal()}

// session history: last 50 completed work sessions, newest first
const LOG_KEY = 'studyBuddy:sessionLog';
function loadSessionLog(){try{const l=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');return Array.isArray(l)?l.filter(e=>e&&typeof e.day==='string'&&Number.isSafeInteger(e.minutes)&&e.minutes>0):[]}catch(e){return []}}
function recentSessionLines(limit){return loadSessionLog().slice(0,Math.max(0,limit|0)).map(e=>e.day+' - '+e.minutes+' min')}
function appendSessionLog(minutes){if(!Number.isSafeInteger(minutes)||minutes<=0)return;const log=loadSessionLog();log.unshift({day:todayKey(),minutes,endedAt:new Date().toISOString()});try{localStorage.setItem(LOG_KEY,JSON.stringify(log.slice(0,50)))}catch(e){ /* history is best-effort */ }}
// CSV export of every stored daily stat, oldest first (for spreadsheets/backups)
function exportStatsCsv(){const rows=['day,sessions,minutes'];const keys=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf(STATS_PREFIX)===0)keys.push(k)}}catch(e){ /* storage listing can be denied */ }keys.sort();for(const k of keys){const day=k.slice(STATS_PREFIX.length);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;const s=loadStatsFor(day);rows.push(`${day},${s.sessions},${s.minutes}`)}return rows.join('\n')}
resetStatsBtn.addEventListener('click',()=>{if(confirm('Resettare le statistiche di oggi?')){saveStats({sessions:0,minutes:0});renderStats()}})

// Timer core
function setMode(m){mode=m;modeEl.textContent = m==='work'? 'Work' : (m==='short'?'Short Break':'Long Break');const raw=(m==='work'? workInput.value : (m==='short'? shortInput.value : longInput.value));let minutes=parseInt(raw,10);if(!Number.isFinite(minutes)) minutes=(m==='work'? 25 : (m==='short'? 5 : 15));minutes=Math.min(m==='work'?180:(m==='short'?60:120),Math.max(1,minutes));remaining=minutes*60;sessionMinutes=minutes;updateTime();}

function updateTime(){timeEl.textContent = formatTime(remaining);document.title = isRunning ? formatTime(remaining)+' · Study Buddy' : 'Study Buddy'}

function tick(){if(!isRunning)return;const left=Math.ceil((endAt-performance.now())/1000);if(left<=0){remaining=0;updateTime();onSessionEnd();return}if(left!==remaining){remaining=left;updateTime()}}

function onSessionEnd(){
 if(!isRunning)return; // a stale completion callback must not credit another session
 pauseTimer(); // clear the old interval before notifications can block or throw
 // vibrate or alert
 // completion signal: short WebAudio beep, falling back to vibration, then alert
 function beep(){try{const AC=window.AudioContext||window.webkitAudioContext;if(typeof AC!=='function')return false;const ac=beep._ctx||(beep._ctx=new AC());const osc=ac.createOscillator();const gain=ac.createGain();osc.type='sine';osc.frequency.value=880;gain.gain.setValueAtTime(0.15,ac.currentTime);gain.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.6);osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+0.6);return true}catch(e){return false}}
 try {if(!beep()){if(typeof navigator.vibrate==='function') navigator.vibrate(400); else alert('Sessione terminata!');}} catch(e) { /* notifications must not prevent accounting or the next mode */ }
 if(mode==='work'){// increment stats
   const s=loadStats(); const added = sessionMinutes; s.sessions = (s.sessions||0) + 1; s.minutes = (s.minutes||0) + added; saveStats(s); renderStats(); appendSessionLog(added); completedWorkSessions=(completedWorkSessions+1)%4; try {localStorage.setItem(CYCLE_KEY,String(completedWorkSessions));} catch(e) { /* current page still keeps the cycle */ }
 }
 // auto switch mode
 if(mode==='work'){ if(completedWorkSessions % 4 === 0) setMode('long'); else setMode('short'); }
 else setMode('work');
 // auto start next session? keep stopped to let user choose
 pauseTimer();}

let endAt = 0;
function startTimer(){if(isRunning) return;isRunning=true;startBtn.disabled=true;pauseBtn.disabled=false;endAt=performance.now()+remaining*1000;updateTime();timerInterval=setInterval(tick,250)}
function pauseTimer(){if(!isRunning) return;remaining=Math.max(0,Math.ceil((endAt-performance.now())/1000));isRunning=false;startBtn.disabled=false;pauseBtn.disabled=true;clearInterval(timerInterval);timerInterval=null;updateTime()}
function resetTimer(){pauseTimer();setMode('work')}

startBtn.addEventListener('click',startTimer);pauseBtn.addEventListener('click',pauseTimer);resetBtn.addEventListener('click',()=>{if(confirm('Reimpostare il timer?')) resetTimer();});
// Keyboard: Space starts/pauses, R resets (ignored while typing in an input)
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||(e.target&&e.target.isContentEditable))return;if(e.target&&/^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();if(isRunning)pauseTimer();else startTimer();}else if(e.key==='r'||e.key==='R'){if(confirm('Reimpostare il timer?')) resetTimer();}});

// Settings persist
[workInput,shortInput,longInput].forEach(inp=>{inp.addEventListener('change',()=>{
 pauseTimer();setMode(mode);
 try {localStorage.setItem('studyBuddy:settings',JSON.stringify({work:workInput.value,short:shortInput.value,long:longInput.value}));}
 catch(e){alert('Impossibile salvare le impostazioni. Restano valide solo per questa pagina.');}
})})

function loadSettings(){let s=null;try{s=JSON.parse(localStorage.getItem('studyBuddy:settings')||'null')}catch(e){s=null}if(s&&typeof s==='object'&&!Array.isArray(s)){for(const [key,input,max] of [['work',workInput,180],['short',shortInput,60],['long',longInput,120]]){const n=Number(s[key]);if(Number.isInteger(n)&&n>=1&&n<=max)input.value=String(n)}}}

// Refresh daily totals after an overnight tab resumes, without disturbing its timer.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderStats();});

// Init
function init(){loadSettings();renderTasks();renderStats();setMode('work');updateTime();}
init();

// Optional: reset data helper (for debugging)
window._studyBuddyResetAll = function(){if(confirm('Cancellare tutti i dati locali dello Study Buddy?')){pauseTimer();localStorage.removeItem(TASKS_KEY);localStorage.removeItem('studyBuddy:settings');workInput.value='25';shortInput.value='5';longInput.value='15';localStorage.removeItem(CYCLE_KEY);localStorage.removeItem(GOAL_KEY);completedWorkSessions=0;localStorage.removeItem(STATS_PREFIX+todayKey());renderTasks();renderStats();setMode('work');updateTime();}}


// Portable backups contain only this app's keys, never another app's storage.
function studyStorageKeys(){
 const keys=[];
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);
  if([TASKS_KEY,CYCLE_KEY,LOG_KEY,GOAL_KEY,'studyBuddy:settings'].includes(key)||
     (typeof key==='string'&&/^studyBuddy:stats:\d{4}-\d{2}-\d{2}$/.test(key)))keys.push(key);
 }
 return keys.sort();
}
function exportBackup(){
 const entries={};for(const key of studyStorageKeys())entries[key]=localStorage.getItem(key);
 return JSON.stringify({app:'study-buddy',version:1,exportedAt:new Date().toISOString(),entries},null,2);
}

function validateBackup(raw){
 if(typeof raw!=='string'||raw.length>2*1024*1024)throw Error('Backup troppo grande.');
 const data=JSON.parse(raw),entries=data&&data.entries;
 if(!data||data.app!=='study-buddy'||data.version!==1||!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>10000)
  throw Error('Formato backup non valido.');
 const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
 for(const [key,value] of Object.entries(entries)){
  if(typeof value!=='string')throw Error('Valore backup non valido.');
  const item=JSON.parse(value);
  let ok=false;
  if(key===TASKS_KEY)ok=Array.isArray(item)&&item.length<=1000&&item.every(t=>t&&typeof t.text==='string'&&t.text.trim()&&t.text.length<=2000&&typeof t.done==='boolean');
  else if(key===GOAL_KEY)ok=Number.isInteger(item)&&item>=0&&item<=1440;
  else if(key===CYCLE_KEY)ok=Number.isInteger(item)&&item>=0&&item<4;
  else if(key==='studyBuddy:settings')ok=item&&typeof item==='object'&&!Array.isArray(item)&&[['work',180],['short',60],['long',120]].every(([k,max])=>Number.isInteger(Number(item[k]))&&Number(item[k])>=1&&Number(item[k])<=max);
  else if(key===LOG_KEY)ok=Array.isArray(item)&&item.length<=50&&item.every(e=>e&&validDay(e.day)&&Number.isInteger(e.minutes)&&e.minutes>0&&e.minutes<=180&&typeof e.endedAt==='string'&&Number.isFinite(Date.parse(e.endedAt)));
  else if(key.startsWith(STATS_PREFIX)&&validDay(key.slice(STATS_PREFIX.length)))ok=item&&nonnegative(item.sessions)&&nonnegative(item.minutes);
  if(!ok)throw Error('Dati non validi nel backup.');
 }
 return entries;
}

function restoreBackup(raw){
 const entries=validateBackup(raw);
 const old=new Map(studyStorageKeys().map(k=>[k,localStorage.getItem(k)]));
 try{
  for(const key of old.keys())localStorage.removeItem(key);
  for(const [key,value] of Object.entries(entries))localStorage.setItem(key,value);
 }catch(error){
  try{for(const key of studyStorageKeys())localStorage.removeItem(key);for(const [key,value] of old)localStorage.setItem(key,value);}
  catch(rollback){throw Error('Ripristino non riuscito. Conserva il file di backup e non chiudere questa pagina.');}
  throw Error('Spazio insufficiente: i dati precedenti sono stati ripristinati.');
 }
 pauseTimer();completedWorkSessions=Number(localStorage.getItem(CYCLE_KEY)||0);
 workInput.value='25';shortInput.value='5';longInput.value='15';
 loadSettings();renderTasks();renderStats();setMode('work');
 return Object.keys(entries).length;
}

function downloadStudyFile(name,text,type){
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const dataStatus=$('dataStatus');
function dataMessage(text){if(dataStatus)dataStatus.textContent=text;}
const backupButton=$('exportBackup');
if(backupButton)backupButton.addEventListener('click',()=>{
 try{downloadStudyFile('study-buddy-'+todayKey()+'.json',exportBackup(),'application/json');dataMessage('Backup scaricato. Conservalo in un posto sicuro.');}
 catch(e){dataMessage('Impossibile creare il backup. I dati non sono stati modificati.');}
});
const csvButton=$('exportCsv');
if(csvButton)csvButton.addEventListener('click',()=>{
 try{downloadStudyFile('study-buddy-statistiche.csv',exportStatsCsv(),'text/csv;charset=utf-8');dataMessage('Statistiche CSV scaricate.');}
 catch(e){dataMessage('Impossibile esportare le statistiche.');}
});
const importInput=$('importBackup');
if(importInput)importInput.addEventListener('change',async()=>{
 const file=importInput.files&&importInput.files[0];if(!file)return;
 try{
  if(file.size>2*1024*1024)throw Error('Backup troppo grande (massimo 2 MB).');
  const raw=await file.text();validateBackup(raw);
  if(!confirm('Sostituire tutti i dati di Study Buddy con questo backup?'))return;
  restoreBackup(raw);dataMessage('Backup ripristinato. Il timer è fermo.');
 }catch(e){dataMessage(e instanceof SyntaxError?'Il file non contiene un backup JSON valido.':e.message);}
 finally{importInput.value='';}
});

function clearCompletedTasks(){
 const tasks=loadTasks(),pending=tasks.filter(t=>!t.done);
 if(tasks.length===pending.length)return 0;
 if(!saveTasks(pending))return false;
 return tasks.length-pending.length;
}

const clearButton=$('clearCompleted');
if(clearButton)clearButton.addEventListener('click',()=>{
 if(!loadTasks().some(t=>t.done)){dataMessage('Nessun task completato da eliminare.');return;}
 if(!confirm('Eliminare tutti i task completati?'))return;
 const removed=clearCompletedTasks();if(removed!==false){renderTasks();dataMessage(removed+' task completati eliminati.');}
});

function updateToggleAll(){const toggleAllButton=$('toggleAll');if(toggleAllButton)toggleAllButton.textContent=loadTasks().length&&loadTasks().every(t=>t.done)?'Riapri tutti':'Completa tutti'}
const toggleAllButton=$('toggleAll');if(toggleAllButton)toggleAllButton.addEventListener('click',()=>{const tasks=loadTasks();if(!tasks.length)return;const result=setAllTasksDone(!tasks.every(t=>t.done));if(result!==false){renderTasks();}});
const taskSearch=$('taskSearch');
if(taskSearch)taskSearch.addEventListener('input',renderTasks);

// A goal is optional. Zero disables it; completed minutes never reset when it changes.
function dailyGoal(){
 try{const n=Number(localStorage.getItem(GOAL_KEY));return Number.isInteger(n)&&n>=0&&n<=1440?n:0;}
 catch(e){return 0;}
}
function setDailyGoal(raw){
 if(typeof raw!=='string'||!/^\d+$/.test(raw.trim()))return false;
 const n=Number(raw.trim());if(!Number.isInteger(n)||n<0||n>1440)return false;
 try{localStorage.setItem(GOAL_KEY,String(n));return true;}catch(e){return false;}
}
function goalProgress(){
 const goal=dailyGoal(),minutes=loadStats().minutes;
 return {goal,minutes,remaining:Math.max(0,goal-minutes),percent:goal?Math.min(100,Math.round(minutes/goal*100)):0};
}

function goalDaysThisWeek(){const goal=dailyGoal();if(!goal)return 0;let days=0;for(let i=0;i<7;i++){if(loadStatsFor(dayKeyOffset(i)).minutes>=goal)days++}return days}

function renderGoal(){
 const input=$('dailyGoal'),bar=$('goalProgress'),status=$('goalStatus');
 if(!input||!bar||!status)return;
 const p=goalProgress();input.value=String(p.goal);bar.value=p.percent;bar.hidden=p.goal===0;
 status.textContent=p.goal===0?'Nessun obiettivo impostato.':p.remaining===0?
  'Obiettivo raggiunto: '+p.minutes+' / '+p.goal+' minuti.':
  p.minutes+' / '+p.goal+' minuti, ne mancano '+p.remaining+'.';
}
const goalForm=$('goalForm');
if(goalForm)goalForm.addEventListener('submit',e=>{
 e.preventDefault();
 if(!setDailyGoal($('dailyGoal').value)){dataMessage('Inserisci un numero intero da 0 a 1440. Se lo spazio è esaurito, libera spazio e riprova.');return;}
 renderGoal();dataMessage('Obiettivo salvato. Le statistiche non sono state modificate.');
});
renderGoal();
