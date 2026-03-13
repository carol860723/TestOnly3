/***********************
 *  代碼分庫 + 狀態
 ************************/
let currentKey = null;
let fullQuestions = [];   // 此代碼完整題庫
let questions = [];       // 本次練習題目
let wrongQuestions = [];  // 錯題本
let index = 0, score = 0;

let userChoices = [];   // 記錄每題使用者選了哪個選項（index），沒答過=undefined
let shownFeedback = []; // 記錄每題是否已顯示回饋（true/false），用來決定要不要鎖選項+顯示詳解

/* LocalStorage key helpers */
const bankKeyStore = 'quiz_bank_key';
const qKey = () => `myQuestions_${currentKey}`;
const wKey = () => `wrongList_${currentKey}`;

/* 啟動 */
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem(bankKeyStore);
  if (savedKey) { currentKey = savedKey; initByKey(); }
  else { showOnly('login'); }
});

/* 登入 / 切換代碼 */
function setBankKey() {
  const v = (document.getElementById('bankKey').value || '').trim();
  if (!v) return alert('請先輸入題庫代碼');
  currentKey = v;
  localStorage.setItem(bankKeyStore, currentKey);
  initByKey();
}
function switchBank() {
  currentKey = null; localStorage.removeItem(bankKeyStore);
  index = 0; score = 0; showOnly('login');
}

/* 依代碼初始化 */
function initByKey() {
  updateKeyChips();
  try { fullQuestions = JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch { fullQuestions = []; }
  try { wrongQuestions = JSON.parse(localStorage.getItem(wKey()) || '[]'); } catch { wrongQuestions = []; }

  if (fullQuestions.length === 0) showOnly('setup');
  else startQuiz();
}
function updateKeyChips() {
  ['keyLabel_setup','keyLabel_quiz','keyLabel_wrong'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = currentKey || '-';
  });
}
function showOnly(which) {
  ['login','setup','quiz','wrongBox'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = (id === which) ? 'block' : 'none';
  });
  updateKeyChips();
}

/* 儲存題庫 */
function saveQuestions() {
  if (!currentKey) return alert('請先輸入題庫代碼');
  try {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) return alert('請貼上題庫 JSON');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return alert('需為陣列且至少一題');

    for (let i=0;i<parsed.length;i++) {
      const t = parsed[i];
      if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
        return alert(`第 ${i+1} 題格式須含 q / options[] / answer`);
      }
      if (t.answer < 0 || t.answer >= t.options.length) {
        return alert(`第 ${i+1} 題 answer 超出選項範圍`);
      }
    }

    fullQuestions = parsed;
    wrongQuestions = [];
    localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
    alert('題庫已儲存！'); startQuiz();
  } catch(e){ console.error(e); alert('JSON 解析失敗'); }
}

/* 開始練習 */
function startQuiz() {
  showOnly('quiz');
  applyQuestionCount(false); // 依下拉抽題
  shuffle(questions);
  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  loadQuestion();
}
function applyQuestionCount(fromUser) {
  const sel = document.getElementById('questionCount');
  const v = sel ? sel.value : 'all';
  const pool = [...fullQuestions];
  shuffle(pool);
  if (v === 'all') questions = pool;
  else questions = pool.slice(0, Math.min(parseInt(v,10), pool.length));

  if (fromUser) {
    index = 0; score = 0;
    document.getElementById('total').textContent = questions.length;
    document.getElementById('score').textContent = score;
    loadQuestion();
  } else {
    document.getElementById('total').textContent = questions.length;
  }
}

/* 出題 / 作答 */
function loadQuestion() {
  if (!questions.length) { alert('目前題庫為空，請先貼題'); showOnly('setup'); return; }
  const q = questions[index];

  document.getElementById('progress').style.width = `${(index / questions.length) * 100}%`;
  document.getElementById('current').textContent = index + 1;
  document.getElementById('question').textContent = q.q;

  const box = document.getElementById('options'); box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(i);
    box.appendChild(btn);
  });

  const fb = document.getElementById('feedback');
  fb.textContent = ''; fb.className = '';
}
function checkAnswer(choice) {
  const q = questions[index];
  const fb = document.getElementById('feedback');

// 1) 先記錄本題的選擇與「已顯示回饋」
  if (typeof userChoices !== 'undefined')   userChoices[index]   = choice;
  if (typeof shownFeedback !== 'undefined') shownFeedback[index] = true;

  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    score++; document.getElementById('score').textContent = score;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    addWrong(q);
  }
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

function prevQuestion() {
  if (index <= 0) return;        // 已經是第一題就不動
  index--;
  loadQuestion();                // 重新渲染上一題（會根據紀錄決定是否禁用選項/顯示詳解）
}
function nextQuestion() {
  index++;
  if (index >= questions.length) {
    document.getElementById('progress').style.width = '100%';
    setTimeout(() => {
      alert(`練習結束！得分：${score}/${questions.length}`);

      // 重新依題數設定，從完整題庫抽一批新題
      applyQuestionCount(false);      // 重抽題目集合（會依下拉的題數）
      shuffle(questions);             // 再洗牌一次

      // 歸零狀態
      index = 0;
      score = 0;
      document.getElementById('score').textContent = score;

      // （可選）若 applyQuestionCount 沒有幫你更新 #total，就開這行
      // document.getElementById('total').textContent = questions.length;

      // 進度條歸零、清空回饋
      document.getElementById('progress').style.width = '0%';
      const fb = document.getElementById('feedback');
      if (fb) { fb.textContent = ''; fb.className = ''; }
      
      //重製作達紀錄
      userChoices = new Array(questions.length).fill(undefined);
      shownFeedback = new Array(questions.length).fill(false);
      loadQuestion();
    }, 80);
    return;
  }
  loadQuestion();
}

function reshuffleNewSet() {
  applyQuestionCount(false);  // 依目前題數設定重抽
  shuffle(questions);
  index = 0;
  score = 0;
  document.getElementById('score').textContent = score;

  // （可選）若 applyQuestionCount 沒有幫你更新 #total，就開這行
  // document.getElementById('total').textContent = questions.length;

  document.getElementById('progress').style.width = '0%';
  const fb = document.getElementById('feedback');
  if (fb) { fb.textContent = ''; fb.className = ''; }

  //重製作達紀錄
  userChoices = new Array(questions.length).fill(undefined);
  shownFeedback = new Array(questions.length).fill(false);
  
  loadQuestion();
}
/* 錯題本 */
function addWrong(q) {
  const id = getQid(q);
  const set = new Set(wrongQuestions.map(x=>getQid(x)));
  if (!set.has(id)) {
    wrongQuestions.push(q);
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
  }
}
function showWrong() {
  showOnly('wrongBox');
  const list = document.getElementById('wrongList'); list.innerHTML = '';
  if (!wrongQuestions.length) {
    const li = document.createElement('li'); li.textContent = '目前沒有錯題 🎉';
    list.appendChild(li); return;
  }
  wrongQuestions.forEach((w, i) => {
    const li = document.createElement('li');
    li.innerHTML = `【${i+1}】${w.q}<br>正解：${w.options[w.answer]}<br>詳解：${w.explain || '無'}`;
    list.appendChild(li);
  });
}
function backToQuiz(){ showOnly('quiz'); }

/* 重置（只清此代碼） */
function resetAll() {
  if (!currentKey) return;
  if (!confirm(`確定清除「${currentKey}」代碼下的題庫與錯題？`)) return;
  localStorage.removeItem(qKey());
  localStorage.removeItem(wKey());
  fullQuestions = []; questions = []; wrongQuestions = [];
  index = 0; score = 0;
  alert('已清除。請貼上新的題庫 JSON。');
  showOnly('setup');
}

/* 小工具 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function getQid(q) {
  const sig = q.q + '||' + (q.options || []).join('|');
  let h=0; for (let i=0;i<sig.length;i++) h = (h*31 + sig.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
