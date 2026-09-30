# Spark Kanban

A simple, beautiful Kanban board that works entirely in the browser.  
No accounts, no backend, no Python servers — just open the page and share a **6-digit code**.

**Live demo (GitHub Pages):**  
`https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

---

## Features

- Create or join a board with a **6-digit code**
- Drag & drop cards between **To Do → In Progress → Done**
- Light & dark theme (saved in your browser)
- Same-device real-time sync (multiple tabs / windows)
- Pure HTML + CSS + JavaScript — zero build step

---

## How the JavaScript connection works

Spark Kanban is **100% client-side**. There is no server that stores your boards.

### 1. Board identity = 6-digit code

When you click **Create New Board**, the app generates a random 6-digit number:

```js
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
```

That code becomes the board ID.  
All data for that board is stored in the browser under a key like:

```
spark-kanban-482913
```

### 2. Saving data (`localStorage`)

Every time you add, edit, move, or delete a card, the app calls `save()`:

```js
function save() {
  if (!state.roomCode) return;
  const payload = { cards: state.cards, updatedAt: Date.now() };
  localStorage.setItem(storageKey(state.roomCode), JSON.stringify(payload));
  // also notifies other tabs (see below)
}
```

`localStorage` is a built-in browser storage that:
- Survives page reloads
- Is private to that browser / device
- Is keyed by the board code so different boards stay separate

### 3. Same-device real-time sync (`BroadcastChannel`)

When two (or more) tabs are open on the **same computer** and joined to the **same code**, they stay in sync using the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel):

```js
function setupChannel(code) {
  state.channel = new BroadcastChannel('spark-' + code);

  state.channel.onmessage = (e) => {
    if (e.data?.type === 'sync') {
      state.cards = e.data.cards || [];
      render();   // redraw the board
    }
  };
}
```

When one tab saves, it also posts a message:

```js
state.channel.postMessage({ type: 'sync', cards: state.cards });
```

All other tabs listening on the same channel name (`spark-482913`) receive the update and re-render instantly.

**Fallback:** The app also listens to the `storage` event so changes still propagate even if `BroadcastChannel` is unavailable.

### 4. Multi-device sync (phone ↔ laptop) — WebRTC P2P

Still **no server you run**. Devices connect directly via WebRTC.

1. Both devices open the site and join the **same 6-digit board code**.
2. On one device click **Link** → “This device creates a link” → copy the link code.
3. On the other device click **Link** → “Other device pastes the link” → paste → generate reply → copy reply.
4. Paste the reply back on the first device → **Connect**.

After that, card changes sync live between the two devices.
Uses only a public STUN server (`stun.l.google.com`) for connection setup — no account, no backend of yours.

| Situation                     | Syncs? |
|-------------------------------|--------|
| Multiple tabs on the same PC  | ✅ Yes (BroadcastChannel) |
| Phone + laptop after **Link** | ✅ Yes (WebRTC DataChannel) |
| Without linking               | ❌ Each device has its own copy |

### 5. Theme & name persistence

- Theme preference → `localStorage['spark-kanban-theme']`
- Your display name → `localStorage['spark-kanban-name']`

These are independent of the board code.

---

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `spark-kanban`).
2. Upload these three files to the **root** of the repo:
   - `index.html`
   - `styles.css`
   - `app.js`
3. Go to **Settings → Pages**.
4. Under **Source**, choose **Deploy from a branch**.
5. Select branch `main` (or `master`) and folder `/ (root)`.
6. Click **Save**.

After a minute your board will be live at:

```
https://YOUR_USERNAME.github.io/spark-kanban/
```

No build tools or Node.js required.

---

## Local use

Just open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).  
Or serve the folder with any static server:

```bash
# Python
python3 -m http.server 8080

# Node (if you have npx)
npx serve .
```

---

## File structure

```
spark-kanban/
├── index.html   # Structure & join/board screens
├── styles.css   # Light + dark theme styles
├── app.js       # All logic (boards, cards, sync, theme)
└── README.md    # This file
```

---

## Browser support

Works in all modern browsers that support:
- `localStorage`
- `BroadcastChannel` (for multi-tab sync)
- CSS custom properties (for theming)

---

MIT License — free to use and modify.
