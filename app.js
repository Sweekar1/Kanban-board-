/* ===== Spark Kanban — pure client-side ===== */

const COLUMNS = [
  { id: 'todo',  title: 'To Do',       icon: '★' },
  { id: 'doing', title: 'In Progress', icon: '↻' },
  { id: 'done',  title: 'Done',        icon: '✓' }
];

const state = {
  roomCode: null,
  userName: null,
  cards: [],
  editingId: null,
  channel: null
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

/* ---------- Persistence + same-device sync ---------- */
function save() {
  if (!state.roomCode) return;
  const payload = { cards: state.cards, updatedAt: Date.now() };
  localStorage.setItem(storageKey(state.roomCode), JSON.stringify(payload));
  if (state.channel) {
    state.channel.postMessage({ type: 'sync', cards: state.cards });
  }
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
  // fallback for older browsers / private mode quirks
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

    // Drop handling
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

  // Event delegation for buttons inside cards / add buttons
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

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Restore theme
  const savedTheme = localStorage.getItem('spark-kanban-theme') || 'light';
  applyTheme(savedTheme);

  // Restore name
  const saved = localStorage.getItem('spark-kanban-name');
  if (saved) document.getElementById('userName').value = saved;

  // Buttons
  document.getElementById('createBtn').addEventListener('click', createBoard);
  document.getElementById('joinBtn').addEventListener('click', joinBoard);
  document.getElementById('copyCodeBtn').addEventListener('click', copyCode);
  document.getElementById('leaveBtn').addEventListener('click', leaveBoard);
  document.getElementById('newCardBtn').addEventListener('click', () => openAdd('todo'));
  document.getElementById('cancelCardBtn').addEventListener('click', closeModal);
  document.getElementById('saveCardBtn').addEventListener('click', saveCard);
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('themeBtnJoin').addEventListener('click', toggleTheme);

  // Code input: digits only
  document.getElementById('joinCode').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && !document.getElementById('cardModal').classList.contains('hidden')) {
      if (e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        saveCard();
      }
    }
  });

  // Click backdrop to close modal
  document.getElementById('cardModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Start on join screen
  showJoin();
});
