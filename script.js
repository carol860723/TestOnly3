/***********************
 *  代碼分庫 + 狀態（全域）
 ************************/
let currentKey = null;
let fullQuestions = [];   // 此代碼完整題庫
let questions = [];       // 本次練習題目
let wrongQuestions = [];  // 錯題本
let index = 0, score = 0;

/* 作答紀錄（回上一題需要） */
let userChoices   = [];   // 每題使用者選了哪個選項（index），沒答過 = undefined
let shownFeedback = [];   // 每題是否已顯示回饋（true/false）

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
  const v = (document.getElementById('bankKey')?.value || '').trim();
  if (!v) { alert('請先輸入題庫代碼'); return; }
  currentKey = v;
  localStorage.setItem(bankKeyStore, currentKey);
  initByKey();
}
function switchBank() {
  currentKey = null;
  localStorage.removeItem(bankKeyStore);
  index = 0; score = 0;
  showOnly('login');
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
  if (!currentKey) { alert('請先輸入題庫代碼'); return; }
  try {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) { alert('請貼上題庫 JSON'); return; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) { alert('需為陣列且至少一題'); return; }

    for (let i=0;i<parsed.length;i++) {
      const t = parsed[i];
      if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
        alert(`第 ${i+1} 題格式須含 q / options[] / answer`); return;
      }
      if (t.answer < 0 || t.answer >= t.options.length) {
        alert(`第 ${i+1} 題 answer 超出選項範圍`); return;
      }
    }

    fullQuestions = parsed;
    wrongQuestions = [];
    localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));

    alert('題庫已儲存！');
    startQuiz();
  } catch(e){ console.error(e); alert('JSON 解析失敗'); }
}

/* 開始練習 */
function startQuiz() {
  showOnly('quiz');

  applyQuestionCount(false);  // 依下拉抽題（從完整題庫）
  shuffle(questions);

  // 重置作答紀錄
  userChoices   = new Array(questions.length).fill(undefined);
  shownFeedback = new Array(questions.length).fill(false);

  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  document.getElementById('progress').style.width = '0%';
  const fb = document.getElementById('feedback'); if (fb){ fb.textContent=''; fb.className=''; }

  loadQuestion();
}

/* 題數控制：永遠以完整題庫為母體重抽 */
function applyQuestionCount(fromUser = false) {
  const sel = document.getElementById('questionCount');
  const v = sel ? sel.value : 'all';

  const pool = [...fullQuestions];
  shuffle(pool);

  if (v === 'all') {
    questions = pool;
  } else {
    const n = Math.min(parseInt(v, 10), pool.length);
    questions = pool.slice(0, n);
  }

  // 畫面同步
  if (fromUser) {
    index = 0; score = 0;
    // 當使用者改題數 → 重置作答紀錄
    userChoices   = new Array(questions.length).fill(undefined);
    shownFeedback = new Array(questions.length).fill(false);

    document.getElementById('score').textContent = score;
    document.getElementById('progress').style.width = '0%';
    const fb = document.getElementById('feedback'); if (fb){ fb.textContent=''; fb.className=''; }
    document.getElementById('total').textContent = questions.length;
    loadQuestion();
  } else {
    document.getElementById('total').textContent = questions.length;
  }
}

/* 出題 / 作答 */
function loadQuestion() {
  if (!questions.length) { alert('目前題庫為空，請先貼題'); showOnly('setup'); return; }
  const q = questions[index];

  // 進度 / 題幹
  document.getElementById('progress').style.width = `${(index / questions.length) * 100}%`;
  document.getElementById('current').textContent = index + 1;
  document.getElementById('question').textContent = q.q;

  // 選項
  const box = document.getElementById('options'); box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(i);
    box.appendChild(btn);
  });

  // 還原或清空回饋
  const fb = document.getElementById('feedback');
  const btns = document.querySelectorAll('.option-btn');

  if (shownFeedback[index]) {
    const chosen = userChoices[index];

    if (chosen === q.answer) {
      fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'correct';
    } else {
      fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'incorrect';
    }

    // 鎖定 + 還原樣式（若你在 CSS 有為 correct/incorrect/chosen/locked 設樣式就會生效）
    btns.forEach((b, i) => {
      b.disabled = true;
      b.classList.remove('correct','incorrect','chosen','locked');
      b.classList.add('locked');
      if (i === q.answer) b.classList.add('correct');
    });
    if (typeof chosen === 'number' && btns[chosen]) {
      btns[chosen].classList.add('chosen');
      if (chosen !== q.answer) btns[chosen].classList.add('incorrect');
    }
  } else {
    fb.textContent = ''; fb.className = '';
    btns.forEach(b => {
      b.disabled = false;
      b.classList.remove('correct','incorrect','chosen','locked');
    });
  }
}

function checkAnswer(choice) {
  const q  = questions[index];
  const fb = document.getElementById('feedback');
  const btns = document.querySelectorAll('.option-btn');

  // 記錄作答
  userChoices[index]   = choice;
  shownFeedback[index] = true;

  // 顯示回饋
  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    score++; document.getElementById('score').textContent = score;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    addWrong(q);
  }

  // 鎖定並標示狀態
  btns.forEach((b, i) => {
    b.disabled = true;
    b.classList.remove('correct','incorrect','chosen','locked');
    b.classList.add('locked');
    if (i === q.answer) b.classList.add('correct');
  });
  if (btns[choice]) {
    btns[choice].classList.add('chosen');
    if (choice !== q.answer) btns[choice].classList.add('incorrect');
  }
}

/* 上/下一題 */
function prevQuestion() {
  if (index <= 0) return;  // 第一題就不動
  index--;
  loadQuestion();
}
function nextQuestion() {
  index++;
  if (index >= questions.length) {
    document.getElementById('progress').style.width = '100%';
    setTimeout(() => {
      alert(`練習結束！得分：${score}/${questions.length}`);

      // 從完整題庫重抽一批新題
      applyQuestionCount(false);
      shuffle(questions);

      // 重置紀錄
      userChoices   = new Array(questions.length).fill(undefined);
      shownFeedback = new Array(questions.length).fill(false);

      // 歸零狀態
      index = 0;
      score = 0;
