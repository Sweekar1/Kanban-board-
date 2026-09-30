/* ===== Spark Kanban — pure client-side + WebRTC P2P ===== */

const COLUMNS = [
  { id: 'todo',  title: 'To Do',       icon: '★' },
  { id: 'doing', title: 'In Progress', icon: '↻' },
  { id: 'done',  title: 'Done',        icon: '✓' }
];

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const state = {
  roomCode: null,
  userName: null,
  cards: [],
  editingId: null,
  channel: null,
  // WebRTC
  pc: null,
  dc: null,
  role: null, // 'host' | 'guest'
  pendingIce: []
};

/* ---------- Helpers ---------- */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function storageKey(code) {
  return 'spark-kanban-' + code;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function initial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function setPeerStatus(status) {
  const el = document.getElementById('peerStatus');
  if (!el) return;
  el.className = 'peer-status ' + (status || '');
  if (status === 'connected') el.textContent = '● linked';
  else if (status === 'connecting') el.textContent = '◌ linking…';
  else el.textContent = '○';
}

/* ---------- Persistence + same-device sync ---------- */
function save() {
  if (!state.roomCode) return;
  const payload = { cards: state.cards, updatedAt: Date.now() };
  localStorage.setItem(storageKey(state.roomCode), JSON.stringify(payload));
  if (state.channel) {
    state.channel.postMessage({ type: 'sync', cards: state.cards });
  }
  // Broadcast to linked peer (phone/laptop)
  sendPeer({ type: 'sync', cards: state.cards });
}

function load(code) {
  try {
    const raw = localStorage.getItem(storageKey(code));
    if (!raw) return [];
    return JSON.parse(raw).cards || [];
  } catch {
    return [];
  }
}

function setupChannel(code) {
  if (state.channel) state.channel.close();
  state.channel = new BroadcastChannel('spark-' + code);
  state.channel.onmessage = (e) => {
    if (e.data?.type === 'sync') {
      state.cards = e.data.cards || [];
      render();
    }
  };
  window.addEventListener('storage', onStorage);
}

function onStorage(e) {
  if (e.key === storageKey(state.roomCode) && e.newValue) {
    try {
      state.cards = JSON.parse(e.newValue).cards || [];
      render();
    } catch {}
  }
}

/* ---------- Screens ---------- */
function showJoin() {
  document.getElementById('joinScreen').classList.remove('hidden');
  document.getElementById('boardScreen').classList.add('hidden');
}

function showBoard() {
  document.getElementById('joinScreen').classList.add('hidden');
  document.getElementById('boardScreen').classList.remove('hidden');
}

function enterBoard() {
  document.getElementById('roomCodeDisplay').textContent = state.roomCode;
  document.getElementById('displayName').textContent = state.userName;
  document.getElementById('userAvatar').textContent = initial(state.userName);
  document.getElementById('projectTitle').textContent = 'Board ' + state.roomCode;

  setupChannel(state.roomCode);
  showBoard();
  render();
  save();
  setPeerStatus('');
}

/* ---------- Actions ---------- */
function createBoard() {
  const name = document.getElementById('userName').value.trim();
  if (!name) { toast('Please enter your name'); return; }

  localStorage.setItem('spark-kanban-name', name);
  state.userName = name;
  state.roomCode = generateCode();
  state.cards = [];
  enterBoard();
  toast('Board created · Code ' + state.roomCode);
}

function joinBoard() {
  const name = document.getElementById('userName').value.trim();
  let code = document.getElementById('joinCode').value.replace(/\D/g, '');

  if (!name) { toast('Please enter your name'); return; }
  if (code.length !== 6) { toast('Enter a valid 6-digit code'); return; }

  localStorage.setItem('spark-kanban-name', name);
  state.userName = name;
  state.roomCode = code;
  state.cards = load(code);
  enterBoard();
  toast('Joined board ' + code);
}

function leaveBoard() {
  closePeer();
  if (state.channel) {
    state.channel.close();
    state.channel = null;
  }
  window.removeEventListener('storage', onStorage);
  state.roomCode = null;
  state.userName = null;
  state.cards = [];
  state.editingId = null;
  document.getElementById('joinCode').value = '';
  showJoin();
}

function copyCode() {
  navigator.clipboard?.writeText(state.roomCode).then(() => {
    toast('Code copied: ' + state.roomCode);
  }).catch(() => toast('Code: ' + state.roomCode));
}

/* ---------- Cards ---------- */
function openAdd(columnId) {
  state.editingId = null;
  document.getElementById('modalTitle').textContent = 'New Card';
  document.getElementById('cardTitle').value = '';
  document.getElementById('cardNotes').value = '';
  document.getElementById('cardModal').dataset.column = columnId || 'todo';
  document.getElementById('cardModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('cardTitle').focus(), 50);
}

function openEdit(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  state.editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Card';
  document.getElementById('cardTitle').value = card.title;
  document.getElementById('cardNotes').value = card.notes || '';
  document.getElementById('cardModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('cardTitle').focus(), 50);
}

function closeModal() {
  document.getElementById('cardModal').classList.add('hidden');
  state.editingId = null;
}

function saveCard() {
  const title = document.getElementById('cardTitle').value.trim();
  if (!title) { toast('Title is required'); return; }
  const notes = document.getElementById('cardNotes').value.trim();

  if (state.editingId) {
    const card = state.cards.find(c => c.id === state.editingId);
    if (card) {
      card.title = title;
      card.notes = notes;
    }
  } else {
    const column = document.getElementById('cardModal').dataset.column || 'todo';
    state.cards.push({
      id: uid(),
      title,
      notes,
      column,
      createdBy: state.userName,
      createdAt: Date.now()
    });
  }

  save();
  render();
  closeModal();
  toast(state.editingId ? 'Card updated' : 'Card added');
}

function deleteCard(id) {
  if (!confirm('Delete this card?')) return;
  state.cards = state.cards.filter(c => c.id !== id);
  save();
  render();
  toast('Card deleted');
}

function moveCard(id, newColumn) {
  const card = state.cards.find(c => c.id === id);
  if (!card || card.column === newColumn) return;
  card.column = newColumn;
  save();
  render();
}

/* ---------- Render ---------- */
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  COLUMNS.forEach(col => {
    const items = state.cards.filter(c => c.column === col.id);

    const colEl = document.createElement('div');
    colEl.className = 'column col-' + col.id;

    colEl.innerHTML = `
      <div class="column-header">
        <h3><span>${col.icon}</span> ${col.title}</h3>
        <span class="count">${items.length}</span>
      </div>
      <div class="cards" data-column="${col.id}"></div>
      <button class="add-card-btn" data-col="${col.id}">+ Add card</button>
    `;

    const list = colEl.querySelector('.cards');

    list.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id) moveCard(id, col.id);
    });

    items.forEach(card => {
      const el = document.createElement('div');
      el.className = 'card-item';
      el.draggable = true;
      el.dataset.id = card.id;

      el.innerHTML = `
        <div class="card-title">${escapeHtml(card.title)}</div>
        ${card.notes ? `<div class="card-notes">${escapeHtml(card.notes)}</div>` : ''}
        <div class="card-footer">
          <div class="card-assignee">
            <span class="mini-avatar">${initial(card.createdBy)}</span>
            ${escapeHtml(card.createdBy || '')}
          </div>
          <div class="card-actions">
            <button class="edit" data-id="${card.id}" title="Edit">✎</button>
            <button class="del" data-id="${card.id}" title="Delete">✕</button>
          </div>
        </div>
      `;

      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', card.id);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));

      list.appendChild(el);
    });

    board.appendChild(colEl);
  });

  board.querySelectorAll('.add-card-btn').forEach(btn => {
    btn.addEventListener('click', () => openAdd(btn.dataset.col));
  });
  board.querySelectorAll('.card-actions .edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEdit(btn.dataset.id);
    });
  });
  board.querySelectorAll('.card-actions .del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteCard(btn.dataset.id);
    });
  });
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('spark-kanban-theme', theme);
  const icon = theme === 'dark' ? '☀' : '☾';
  const btn = document.getElementById('themeBtn');
  const btnJoin = document.getElementById('themeBtnJoin');
  if (btn) btn.textContent = icon;
  if (btnJoin) btnJoin.textContent = icon;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ---------- WebRTC P2P (no server you run) ---------- */
function closePeer() {
  try { state.dc?.close(); } catch {}
  try { state.pc?.close(); } catch {}
  state.dc = null;
  state.pc = null;
  state.role = null;
  state.pendingIce = [];
  setPeerStatus('');
}

function sendPeer(msg) {
  if (state.dc && state.dc.readyState === 'open') {
    try {
      state.dc.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('peer send failed', e);
    }
  }
}

function onPeerMessage(data) {
  try {
    const msg = JSON.parse(data);
    if (msg.type === 'sync' && Array.isArray(msg.cards)) {
      // Merge by id: newer wins simply by accepting remote full state
      // (both sides always send full board — last write wins is fine for small boards)
      state.cards = msg.cards;
      // persist locally
      if (state.roomCode) {
        localStorage.setItem(
          storageKey(state.roomCode),
          JSON.stringify({ cards: state.cards, updatedAt: Date.now() })
        );
      }
      render();
    }
  } catch (e) {
    console.warn('bad peer message', e);
  }
}

function wireDataChannel(dc) {
  state.dc = dc;
  dc.onopen = () => {
    setPeerStatus('connected');
    toast('Devices linked — live sync on');
    // Send current board to the other side
    sendPeer({ type: 'sync', cards: state.cards });
    document.getElementById('linkModal').classList.add('hidden');
  };
  dc.onclose = () => {
    setPeerStatus('');
    toast('Peer disconnected');
  };
  dc.onerror = () => setPeerStatus('');
  dc.onmessage = (e) => onPeerMessage(e.data);
}

function waitIceGathering(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // safety timeout
    setTimeout(resolve, 3000);
  });
}

function encodeSignal(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function decodeSignal(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
}

async function startAsHost() {
  closePeer();
  state.role = 'host';
  setPeerStatus('connecting');

  const pc = new RTCPeerConnection(ICE);
  state.pc = pc;

  const dc = pc.createDataChannel('kanban');
  wireDataChannel(dc);

  pc.onicecandidate = () => {}; // we wait for complete gathering

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGathering(pc);

  const payload = {
    sdp: pc.localDescription,
    room: state.roomCode,
    name: state.userName
  };

  document.getElementById('hostLinkPanel').classList.remove('hidden');
  document.getElementById('guestLinkPanel').classList.add('hidden');
  document.getElementById('offerOut').value = encodeSignal(payload);
  document.getElementById('answerIn').value = '';
}

async function acceptAnswer() {
  const raw = document.getElementById('answerIn').value.trim();
  if (!raw || !state.pc) {
    toast('Paste the reply code first');
    return;
  }
  try {
    const data = decodeSignal(raw);
    await state.pc.setRemoteDescription(data.sdp);
    toast('Connecting…');
  } catch (e) {
    console.error(e);
    toast('Invalid reply code');
  }
}

async function startAsGuest() {
  document.getElementById('guestLinkPanel').classList.remove('hidden');
  document.getElementById('hostLinkPanel').classList.add('hidden');
  document.getElementById('answerOutWrap').classList.add('hidden');
  document.getElementById('offerIn').value = '';
  document.getElementById('answerOut').value = '';
}

async function createAnswerFromOffer() {
  const raw = document.getElementById('offerIn').value.trim();
  if (!raw) {
    toast('Paste the link code first');
    return;
  }

  let data;
  try {
    data = decodeSignal(raw);
  } catch {
    toast('Invalid link code');
    return;
  }

  // Optional: warn if room codes differ
  if (data.room && state.roomCode && data.room !== state.roomCode) {
    if (!confirm('This link is for board ' + data.room + '. You are on ' + state.roomCode + '. Continue anyway?')) {
      return;
    }
  }

  closePeer();
  state.role = 'guest';
  setPeerStatus('connecting');

  const pc = new RTCPeerConnection(ICE);
  state.pc = pc;

  pc.ondatachannel = (e) => {
    wireDataChannel(e.channel);
  };

  await pc.setRemoteDescription(data.sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceGathering(pc);

  const payload = {
    sdp: pc.localDescription,
    name: state.userName
  };

  document.getElementById('answerOut').value = encodeSignal(payload);
  document.getElementById('answerOutWrap').classList.remove('hidden');
  toast('Reply ready — send it back');
}

function openLinkModal() {
  document.getElementById('linkModal').classList.remove('hidden');
  document.getElementById('hostLinkPanel').classList.add('hidden');
  document.getElementById('guestLinkPanel').classList.add('hidden');
  document.getElementById('answerOutWrap').classList.add('hidden');
}

function closeLinkModal() {
  document.getElementById('linkModal').classList.add('hidden');
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('spark-kanban-theme') || 'light';
  applyTheme(savedTheme);

  const saved = localStorage.getItem('spark-kanban-name');
  if (saved) document.getElementById('userName').value = saved;

  document.getElementById('createBtn').addEventListener('click', createBoard);
  document.getElementById('joinBtn').addEventListener('click', joinBoard);
  document.getElementById('copyCodeBtn').addEventListener('click', copyCode);
  document.getElementById('leaveBtn').addEventListener('click', leaveBoard);
  document.getElementById('newCardBtn').addEventListener('click', () => openAdd('todo'));
  document.getElementById('cancelCardBtn').addEventListener('click', closeModal);
  document.getElementById('saveCardBtn').addEventListener('click', saveCard);
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('themeBtnJoin').addEventListener('click', toggleTheme);

  // Link devices
  document.getElementById('linkBtn').addEventListener('click', openLinkModal);
  document.getElementById('closeLinkBtn').addEventListener('click', closeLinkModal);
  document.getElementById('hostLinkBtn').addEventListener('click', startAsHost);
  document.getElementById('joinLinkBtn').addEventListener('click', startAsGuest);
  document.getElementById('copyOfferBtn').addEventListener('click', () => {
    const v = document.getElementById('offerOut').value;
    navigator.clipboard?.writeText(v).then(() => toast('Link code copied')).catch(() => toast('Copy manually'));
  });
  document.getElementById('acceptAnswerBtn').addEventListener('click', acceptAnswer);
  document.getElementById('createAnswerBtn').addEventListener('click', createAnswerFromOffer);
  document.getElementById('copyAnswerBtn').addEventListener('click', () => {
    const v = document.getElementById('answerOut').value;
    navigator.clipboard?.writeText(v).then(() => toast('Reply copied')).catch(() => toast('Copy manually'));
  });

  document.getElementById('joinCode').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeLinkModal();
    }
    if (e.key === 'Enter' && !document.getElementById('cardModal').classList.contains('hidden')) {
      if (e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        saveCard();
      }
    }
  });

  document.getElementById('cardModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('linkModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLinkModal();
  });

  showJoin();
});
