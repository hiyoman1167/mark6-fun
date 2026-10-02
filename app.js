import { combinationRank, drawAt, MAX_UNIQUE_DRAWS, parseNumbers, seedWords, UNIT_COST } from './simulation.js';

const $ = (selector) => document.querySelector(selector);
const format = (value) => new Intl.NumberFormat('zh-HK').format(value);
const currency = (value) => `HK$${format(value)}`;
const CHUNK_SIZE = 250_000;
const WELCOME_STORAGE_KEY = 'mark6-welcome-ack-v1';
let activeSearch = null;
let nextJobId = 0;

const sharedParams = new URLSearchParams(location.search);
const sharedSeed = sharedParams.get('seed');
const sharedNumbers = parseNumbers(sharedParams.get('numbers') ?? '');
if (sharedSeed) $('#seed').value = sharedSeed;
if (sharedNumbers) $('#numbers').value = sharedNumbers.join(', ');

const welcomeDialog = $('#welcome-dialog');
let welcomeAcknowledged = false;
try {
  welcomeAcknowledged = localStorage.getItem(WELCOME_STORAGE_KEY) === 'true';
} catch {
  // If storage is unavailable, show the notice on each visit.
}
if (!welcomeAcknowledged) welcomeDialog.showModal();
welcomeDialog.addEventListener('cancel', (event) => event.preventDefault());
$('#welcome-continue').addEventListener('click', () => {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, 'true');
  } catch {
    // The visitor can still continue for this session.
  }
  welcomeDialog.close();
});

function balls(container, numbers) {
  container.replaceChildren(...numbers.map((number) => {
    const ball = document.createElement('span');
    ball.className = 'ball';
    ball.textContent = number;
    return ball;
  }));
}

function error(message = '') {
  $('#error').textContent = message;
  $('#error').hidden = !message;
}

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= MAX_UNIQUE_DRAWS ? number : null;
}

function seed() {
  const value = $('#seed').value.trim();
  if (!value) throw new Error('請先輸入 seed。');
  return value;
}

function resetCopyStatus() {
  $('#copy-seed').textContent = '複製 Seed';
  $('#copy-status').textContent = '';
}

function closeSharePanel() {
  $('#share-panel').hidden = true;
  $('#share-toggle').setAttribute('aria-expanded', 'false');
  $('#share-status').textContent = '';
}

function shareMessage() {
  const target = parseNumbers($('#numbers').value);
  if (!target) throw new Error('請先輸入 6 個有效號碼，先可以分享。');
  const chosenSeed = seed();
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('numbers', target.join(','));
  url.searchParams.set('seed', chosenSeed);
  const result = $('#live-result').dataset.state === 'hit'
    ? `\n我模擬咗 ${$('#draw-count').textContent} 次先首次撞中！`
    : '';
  return `我喺六合彩 Seed Lab 試緊 ${target.join('、')}。\nSeed：${chosenSeed}${result}\n用同一組號碼同 Seed 試吓：${url.href}\n非官方模擬工具｜購買六合彩只限年滿 18 歲人士。`;
}

function clearResults() {
  $('#live-result').hidden = true;
  delete $('#live-result').dataset.state;
  $('#empty-result').hidden = false;
  $('#jump-result').hidden = true;
}

function setBusy(busy) {
  $('#search').disabled = busy;
  $('#jump').disabled = busy;
  $('#cancel').hidden = !busy;
  for (const selector of ['#numbers', '#seed', '#jump-count', '#new-seed']) {
    document.querySelectorAll(selector).forEach((control) => { control.disabled = busy; });
  }
}

function stopSearch() {
  if (!activeSearch) return;
  for (const worker of activeSearch.workers) worker.terminate();
  activeSearch = null;
  setBusy(false);
}

function updateProgress(state) {
  const count = Math.min(state.prefixChunk * CHUNK_SIZE, MAX_UNIQUE_DRAWS);
  $('#draw-count').textContent = format(count);
  $('#cost').textContent = currency(count * UNIT_COST);
  $('#elapsed').textContent = `${((performance.now() - state.startedAt) / 1000).toFixed(1)} 秒`;
}

function finishSearch(state, foundIndex) {
  const elapsed = (performance.now() - state.startedAt) / 1000;
  stopSearch();
  const count = foundIndex ?? MAX_UNIQUE_DRAWS;
  $('#status').textContent = foundIndex === null ? '呢個 seed 嘅完整序列都未出現目標' : '搵到！首次命中目標號碼';
  $('#live-result').dataset.state = foundIndex === null ? 'miss' : 'hit';
  $('#count-label').textContent = foundIndex === null ? '已模擬' : '首次命中於第';
  $('#draw-count').textContent = format(count);
  $('#cost').textContent = currency(count * UNIT_COST);
  $('#elapsed').textContent = `${elapsed.toFixed(1)} 秒`;
  $('.progress-track').classList.remove('is-searching');
  $('#progress-fill').style.width = '100%';
  $('#progress-fill').style.transform = 'none';
  if (foundIndex !== null) {
    balls($('#next-balls'), drawAt(state.seed, foundIndex + 1));
    $('#next-wrap').hidden = false;
  }
}

function assignChunk(state, worker) {
  if (state.nextChunk >= state.totalChunks) return;
  const chunkId = state.nextChunk++;
  const start = chunkId * CHUNK_SIZE + 1;
  if (state.bestIndex !== null && start >= state.bestIndex) return;
  worker.postMessage({
    jobId: state.jobId,
    chunkId,
    start,
    end: Math.min(start + CHUNK_SIZE - 1, MAX_UNIQUE_DRAWS),
    targetRank: state.targetRank,
    words: state.words,
  });
}

function handleChunk(state, worker, data) {
  if (activeSearch !== state || data.jobId !== state.jobId) return;
  state.completed.add(data.chunkId);
  if (data.foundIndex !== null && (state.bestIndex === null || data.foundIndex < state.bestIndex)) {
    state.bestIndex = data.foundIndex;
  }
  while (state.completed.delete(state.prefixChunk)) state.prefixChunk++;

  // A later worker can finish first. Only report a hit after all earlier
  // chunks have finished, so the displayed draw really is the first one.
  if (state.bestIndex !== null && state.prefixChunk > Math.floor((state.bestIndex - 1) / CHUNK_SIZE)) {
    finishSearch(state, state.bestIndex);
    return;
  }
  if (state.prefixChunk === state.totalChunks) {
    finishSearch(state, null);
    return;
  }
  updateProgress(state);
  assignChunk(state, worker);
}

$('#numbers').addEventListener('input', () => {
  balls($('#target-balls'), parseNumbers($('#numbers').value) ?? []);
  clearResults();
  closeSharePanel();
  error();
});
$('#seed').addEventListener('input', () => {
  resetCopyStatus();
  clearResults();
  closeSharePanel();
});
$('#copy-seed').addEventListener('click', async () => {
  try {
    const value = seed();
    await navigator.clipboard.writeText(value);
    $('#copy-seed').textContent = '已複製';
    $('#copy-status').textContent = 'Seed 已複製，可以貼畀其他玩家。';
    error();
  } catch {
    $('#copy-status').textContent = '未能複製，請手動選取 seed。';
  }
});
$('#new-seed').addEventListener('click', () => {
  $('#seed').value = `seed-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join('-')}`;
  resetCopyStatus();
  clearResults();
  closeSharePanel();
});

$('#share-toggle').addEventListener('click', () => {
  if (!$('#share-panel').hidden) {
    closeSharePanel();
    return;
  }
  try {
    $('#share-message').value = shareMessage();
    $('#share-local-warning').hidden = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    $('#native-share').hidden = typeof navigator.share !== 'function';
    $('#share-panel').hidden = false;
    $('#share-toggle').setAttribute('aria-expanded', 'true');
    error();
  } catch (cause) { error(cause.message); }
});

$('#copy-share').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#share-message').value);
    $('#share-status').textContent = '成段訊息同連結已複製，可以貼去 Threads。';
  } catch {
    $('#share-message').focus();
    $('#share-message').select();
    $('#share-status').textContent = '未能自動複製，已選取訊息，請手動複製。';
  }
});

$('#native-share').addEventListener('click', async () => {
  try {
    await navigator.share({ text: $('#share-message').value });
    $('#share-status').textContent = '已開啟系統分享。';
  } catch (cause) {
    if (cause.name !== 'AbortError') $('#share-status').textContent = '未能開啟系統分享，請複製訊息。';
  }
});

$('#search').addEventListener('click', () => {
  try {
    const target = parseNumbers($('#numbers').value);
    if (!target) throw new Error('請輸入 6 個 1–49 之間、唔重複嘅號碼。');
    const chosenSeed = seed();
    error();
    $('#empty-result').hidden = true;
    $('#live-result').hidden = false;
    $('#live-result').dataset.state = 'searching';
    $('#next-wrap').hidden = true;
    $('#status').textContent = '搜尋首次出現中…';
    $('#count-label').textContent = '已模擬';
    $('#draw-count').textContent = '0';
    $('#cost').textContent = 'HK$0';
    $('#elapsed').textContent = '—';
    $('#progress-fill').style.width = '32%';
    $('#progress-fill').style.transform = '';
    $('.progress-track').classList.add('is-searching');

    const state = {
      jobId: ++nextJobId,
      seed: chosenSeed,
      words: seedWords(chosenSeed),
      targetRank: combinationRank(target),
      startedAt: performance.now(),
      totalChunks: Math.ceil(MAX_UNIQUE_DRAWS / CHUNK_SIZE),
      nextChunk: 0,
      prefixChunk: 0,
      completed: new Set(),
      bestIndex: null,
      workers: [],
    };
    activeSearch = state;
    setBusy(true);
    const workerCount = Math.min(4, navigator.hardwareConcurrency || 2, state.totalChunks);
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('./simulation-worker.js', { type: 'module' });
      worker.onmessage = ({ data }) => handleChunk(state, worker, data);
      worker.onerror = () => {
        if (activeSearch !== state) return;
        stopSearch();
        error('模擬出錯，請重新載入頁面再試。');
      };
      state.workers.push(worker);
      assignChunk(state, worker);
    }
  } catch (cause) { error(cause.message); }
});

$('#jump').addEventListener('click', () => {
  try {
    const index = integer($('#jump-count').value);
    if (!index) throw new Error('指定次數請輸入 1 至 4,294,967,296 之間嘅整數。');
    const numbers = drawAt(seed(), index);
    error();
    $('#jump-result').hidden = false;
    $('#jump-label').textContent = `第 ${format(index)} 次產生嘅號碼`;
    balls($('#jump-balls'), numbers);
  } catch (cause) { error(cause.message); }
});

$('#cancel').addEventListener('click', () => {
  stopSearch();
  $('#status').textContent = '模擬已停止';
  $('#live-result').dataset.state = 'stopped';
});

balls($('#target-balls'), parseNumbers($('#numbers').value));
