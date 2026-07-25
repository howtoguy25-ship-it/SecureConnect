import { BuyButtonMode, CanvasElement, CatalogProduct, CustomWidgetElement, GameElement, GradientFill, MenuItem, PolicyDoc, Project, RichTextRun, SiteMenu, SitePage, WidgetElement } from './types';
import { getFontOption } from './fonts';
import { currencySymbol } from './currency';

// Renders a Project's absolutely-positioned canvas into a real, self-contained static
// HTML page. The editor's data model is an absolute-position canvas (not semantic
// responsive HTML), so the page scales the whole canvas as one block to fit the
// visitor's viewport width via a CSS custom property + a tiny inline resize script --
// good enough for a genuinely real published page without redesigning the data model.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

// Inline SVGs for the real video play/mute controls (case 'video' below) -- no icon-font/CDN
// dependency for three tiny glyphs used on a published static page.
const PLAY_ICON_SVG = '<svg width="22%" height="22%" viewBox="0 0 24 24" fill="#fff" style="min-width:32px;min-height:32px;"><path d="M8 5v14l11-7z"/></svg>';
const SOUND_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z"/></svg>';
const MUTE_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M19 12l2.5-2.5-1-1L18 11l-2.5-2.5-1 1L17 12l-2.5 2.5 1 1L18 13l2.5 2.5 1-1L19 12z"/></svg>';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return hex;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// `angle` already matches CSS linear-gradient()'s own angle convention (see GradientFill's
// comment in types.ts), so it drops straight in with no conversion.
function cssGradient(gradient: GradientFill): string {
  return `linear-gradient(${gradient.angle}deg, ${escapeAttr(gradient.colors[0])}, ${escapeAttr(gradient.colors[1])})`;
}

// Popup buttonUrl is authored by the site owner (not visitor input), but still guard
// against a stray "javascript:" scheme sneaking into a published page.
function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  return `https://${trimmed}`;
}

// Publish-time snapshot of a ProductElement's real content -- mirrors the client's
// resolveProductView (src/utils/resolveProduct.ts) and index.ts's resolveCatalogProduct: a
// ProductElement only stores a productId now, so its real name/price/images/etc. are looked
// up in the `products` map the caller pre-fetched from the catalog (see renderProjectHtml's
// new `products` param), falling back to whatever inline fields might still be sitting on the
// element for data stored before the catalog existed.
function resolveProduct(el: Extract<CanvasElement, { type: 'product' }>, products: Record<string, CatalogProduct>): CatalogProduct {
  const found = products[el.productId];
  if (found) return found;
  const legacy = el as unknown as Partial<CatalogProduct>;
  return {
    id: el.productId,
    name: legacy.name ?? 'Untitled product',
    description: legacy.description ?? '',
    priceUsd: legacy.priceUsd ?? 0,
    compareAtPriceUsd: legacy.compareAtPriceUsd ?? null,
    costUsd: legacy.costUsd ?? null,
    images: legacy.images ?? [],
    trackInventory: legacy.trackInventory ?? false,
    initialStock: legacy.initialStock ?? null,
    inStock: legacy.inStock ?? true,
    saleType: legacy.saleType ?? 'product',
    fulfillment: legacy.fulfillment ?? 'pickup',
    serviceDurationMinutes: legacy.serviceDurationMinutes ?? null,
    variantOptions: legacy.variantOptions ?? [],
    variants: legacy.variants ?? [],
    createdAt: legacy.createdAt ?? 0,
    updatedAt: legacy.updatedAt ?? 0,
  };
}

function renderIcon(el: Extract<CanvasElement, { type: 'icon' }>): string {
  const style = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;color:${escapeAttr(
    el.color
  )};font-size:${Math.min(el.width, el.height)}px;display:flex;align-items:center;justify-content:center;`;
  if (el.iconSet === 'MaterialCommunityIcons') {
    return `<i class="mdi mdi-${escapeAttr(el.iconName)}" style="${style}"></i>`;
  }
  if (el.iconSet === 'FontAwesome5') {
    return `<i class="fas fa-${escapeAttr(el.iconName)}" style="${style}"></i>`;
  }
  return `<ion-icon name="${escapeAttr(el.iconName)}" style="${style}"></ion-icon>`;
}

function renderShape(el: Extract<CanvasElement, { type: 'shape' }>): string {
  const color = escapeAttr(el.color);
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;`;
  switch (el.shapeKind) {
    case 'circle':
      return `<div style="${base}background:${color};border-radius:9999px;"></div>`;
    case 'rounded-rectangle':
      return `<div style="${base}background:${color};border-radius:16px;"></div>`;
    case 'rectangle':
      return `<div style="${base}background:${color};"></div>`;
    case 'line':
      return `<div style="${base}background:${color};height:2px;"></div>`;
    case 'triangle':
      return `<svg style="${base}" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,0 100,100 0,100" fill="${color}" /></svg>`;
    case 'star':
      return `<svg style="${base}" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,2 61,37 98,37 68,59 79,95 50,74 21,95 32,59 2,37 39,37" fill="${color}" /></svg>`;
    default:
      return `<div style="${base}background:${color};"></div>`;
  }
}

// Real, playable mini-games rendered as plain DOM + vanilla JS (no framework/build step
// available on a published static page) -- the exact same rules as the editor's GameView.tsx
// RN components, just re-implemented against document.createElement/innerHTML instead of RN
// state. Owner-authored text (title/labels/questions) is HTML-escaped before being embedded
// as a JS string literal, so it round-trips safely through innerHTML either way.
//
// Tic-Tac-Toe/Connect Four/Rock Paper Scissors are real 2-player games, so each gets a mode
// row (vs Computer / 2 Players same device / Play Online) -- Play Online is genuine real-time
// multiplayer between two actual visitors, matched via Firestore (see sharedGameRuntimeScript
// below), not a simulation. Memory/Trivia/Clicker stay solo score-attempt games.

// Loaded once per published page (only if it has at least one multiplayer-capable game
// element) -- the Firebase Web SDK plus real matchmaking + the shared game logic every
// per-element script below calls into via window.SiteSparkGames. Visitors on a published
// site are anonymous (no SiteSpark account), so this talks to Firestore directly from the
// page itself rather than through a Cloud Function -- see firestore.rules' gameLobbies/
// gameRooms comment for why that's safe here (no personal data, no stakes).
function sharedGameRuntimeScript(): string {
  return `<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>
<script>(function(){
  if (window.SiteSparkGames) return;
  firebase.initializeApp({
    apiKey: "AIzaSyC--2Xhg5UpRrSggQctwjWfg_3xhQwy2LA",
    authDomain: "sitespark-a5817.firebaseapp.com",
    projectId: "sitespark-a5817",
    storageBucket: "sitespark-a5817.firebasestorage.app",
    messagingSenderId: "776375566908",
    appId: "1:776375566908:web:1c7c75437bf1d3a415b939"
  });
  var db = firebase.firestore();
  var myId = localStorage.getItem('sitespark_player_id');
  if (!myId) { myId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); localStorage.setItem('sitespark_player_id', myId); }

  var TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function tttWinner(board){
    for (var i=0;i<TTT_LINES.length;i++){ var L=TTT_LINES[i]; if (board[L[0]] && board[L[0]]===board[L[1]] && board[L[0]]===board[L[2]]) return board[L[0]]; }
    return null;
  }
  function tttScore(board, me, opp, maximizing, depth){
    var w = tttWinner(board);
    if (w===me) return 10 - depth;
    if (w===opp) return depth - 10;
    if (board.every(function(c){return c!==null;})) return 0;
    var best = maximizing ? -Infinity : Infinity;
    for (var i=0;i<9;i++){
      if (board[i]) continue;
      var next = board.slice();
      next[i] = maximizing ? me : opp;
      var s = tttScore(next, me, opp, !maximizing, depth + 1);
      best = maximizing ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  }
  function tttBestMove(board, me, opp){
    var bestScore = -Infinity, bestMove = -1;
    for (var i=0;i<9;i++){
      if (board[i]) continue;
      var next = board.slice(); next[i] = me;
      var s = tttScore(next, me, opp, false, 1);
      if (s > bestScore) { bestScore = s; bestMove = i; }
    }
    return bestMove;
  }

  var C4_ROWS = 6, C4_COLS = 7;
  function c4Empty(){ var b=[]; for (var r=0;r<C4_ROWS;r++) b.push(new Array(C4_COLS).fill(null)); return b; }
  function c4Clone(b){ return b.map(function(row){ return row.slice(); }); }
  function c4DropRow(b, col){ for (var r=C4_ROWS-1;r>=0;r--) if (!b[r][col]) return r; return -1; }
  function c4ValidCols(b){ var out=[]; for (var c=0;c<C4_COLS;c++) if (!b[0][c]) out.push(c); return out; }
  function c4Winner(b){
    for (var r=0;r<C4_ROWS;r++) for (var c=0;c<C4_COLS;c++){
      var cell = b[r][c]; if (!cell) continue;
      if (c+3<C4_COLS && cell===b[r][c+1] && cell===b[r][c+2] && cell===b[r][c+3]) return cell;
      if (r+3<C4_ROWS && cell===b[r+1][c] && cell===b[r+2][c] && cell===b[r+3][c]) return cell;
      if (r+3<C4_ROWS && c+3<C4_COLS && cell===b[r+1][c+1] && cell===b[r+2][c+2] && cell===b[r+3][c+3]) return cell;
      if (r+3<C4_ROWS && c-3>=0 && cell===b[r+1][c-1] && cell===b[r+2][c-2] && cell===b[r+3][c-3]) return cell;
    }
    return null;
  }
  function c4Full(b){ return b[0].every(function(c){return c!==null;}); }
  function c4Window(cells, me, opp){
    var meCount=0, oppCount=0, emptyCount=0;
    cells.forEach(function(c){ if (c===me) meCount++; else if (c===opp) oppCount++; else emptyCount++; });
    if (meCount===4) return 100000;
    if (meCount===3 && emptyCount===1) return 50;
    if (meCount===2 && emptyCount===2) return 10;
    if (oppCount===3 && emptyCount===1) return -60;
    return 0;
  }
  function c4Score(b, me, opp){
    var score=0, centerCol=Math.floor(C4_COLS/2);
    for (var r=0;r<C4_ROWS;r++) if (b[r][centerCol]===me) score += 3;
    for (var r=0;r<C4_ROWS;r++) for (var c=0;c<C4_COLS-3;c++) score += c4Window([b[r][c],b[r][c+1],b[r][c+2],b[r][c+3]], me, opp);
    for (var c=0;c<C4_COLS;c++) for (var r=0;r<C4_ROWS-3;r++) score += c4Window([b[r][c],b[r+1][c],b[r+2][c],b[r+3][c]], me, opp);
    for (var r=0;r<C4_ROWS-3;r++) for (var c=0;c<C4_COLS-3;c++) score += c4Window([b[r][c],b[r+1][c+1],b[r+2][c+2],b[r+3][c+3]], me, opp);
    for (var r=3;r<C4_ROWS;r++) for (var c=0;c<C4_COLS-3;c++) score += c4Window([b[r][c],b[r-1][c+1],b[r-2][c+2],b[r-3][c+3]], me, opp);
    return score;
  }
  function c4Minimax(b, depth, alpha, beta, maximizing, me, opp){
    var winner = c4Winner(b);
    if (winner===me) return 1000000+depth;
    if (winner===opp) return -1000000-depth;
    if (c4Full(b) || depth===0) return c4Score(b, me, opp);
    var cols = c4ValidCols(b);
    var i, c, b2, r;
    if (maximizing){
      var best=-Infinity;
      for (i=0;i<cols.length;i++){ c=cols[i]; b2=c4Clone(b); r=c4DropRow(b2,c); b2[r][c]=me; best=Math.max(best, c4Minimax(b2, depth-1, alpha, beta, false, me, opp)); alpha=Math.max(alpha,best); if (alpha>=beta) break; }
      return best;
    }
    var worst=Infinity;
    for (i=0;i<cols.length;i++){ c=cols[i]; b2=c4Clone(b); r=c4DropRow(b2,c); b2[r][c]=opp; worst=Math.min(worst, c4Minimax(b2, depth-1, alpha, beta, true, me, opp)); beta=Math.min(beta,worst); if (alpha>=beta) break; }
    return worst;
  }
  function c4BestMove(b, me, opp){
    var cols = c4ValidCols(b), i, c, b2, r;
    for (i=0;i<cols.length;i++){ c=cols[i]; b2=c4Clone(b); r=c4DropRow(b2,c); b2[r][c]=me; if (c4Winner(b2)===me) return c; }
    for (i=0;i<cols.length;i++){ c=cols[i]; b2=c4Clone(b); r=c4DropRow(b2,c); b2[r][c]=opp; if (c4Winner(b2)===opp) return c; }
    var bestCol=cols[0], bestVal=-Infinity;
    for (i=0;i<cols.length;i++){ c=cols[i]; b2=c4Clone(b); r=c4DropRow(b2,c); b2[r][c]=me; var val=c4Minimax(b2,4,-Infinity,Infinity,false,me,opp); if (val>bestVal){bestVal=val;bestCol=c;} }
    return bestCol;
  }

  function rpsWinner(a,b){
    if (a===b) return 'draw';
    if ((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')) return 'a';
    return 'b';
  }

  // Two-document handshake: a waiting player parks itself in gameLobbies/{lobbyId}; the next
  // visitor to call findMatch for that same lobbyId claims it inside a transaction (so two
  // simultaneous claims can't both succeed), creates the real gameRooms/{roomId} both will
  // play in, and writes the roomId back onto the lobby doc for the original waiter's listener
  // to pick up. lobbyId is scoped to this exact game element (see renderGameHtml), so visitors
  // playing different games/sites are never matched together.
  function findMatch(lobbyId, initialState, onMatched, onWaiting){
    var lobbyRef = db.collection('gameLobbies').doc(lobbyId);
    var unsub = null;
    db.runTransaction(function(tx){
      return tx.get(lobbyRef).then(function(doc){
        var data = doc.exists ? doc.data() : null;
        var now = Date.now();
        var stale = !data || !data.waitingUid || (data.waitingSince && now - data.waitingSince > 60000);
        if (stale || data.waitingUid === myId) {
          tx.set(lobbyRef, { waitingUid: myId, waitingSince: now, matchedRoomId: null, matchedFor: null, expiresAt: new Date(now+3600000) });
          return { role: 'waiting' };
        }
        var roomRef = db.collection('gameRooms').doc();
        tx.set(roomRef, { state: initialState, players: [data.waitingUid, myId], createdAt: now, updatedAt: now, expiresAt: new Date(now+3600000) });
        tx.set(lobbyRef, { waitingUid: null, waitingSince: null, matchedRoomId: roomRef.id, matchedFor: data.waitingUid }, { merge: true });
        return { role: 'claimed', roomId: roomRef.id };
      });
    }).then(function(result){
      if (result.role === 'claimed') { onMatched(result.roomId, 1); }
      else {
        if (onWaiting) onWaiting();
        unsub = lobbyRef.onSnapshot(function(doc){
          var data = doc.data();
          if (data && data.matchedRoomId && data.matchedFor === myId) {
            unsub(); unsub = null;
            onMatched(data.matchedRoomId, 0);
          }
        });
      }
    }).catch(function(err){ console.error('SiteSpark matchmaking error', err); });
    return function cancel(){ if (unsub) { unsub(); unsub = null; } };
  }

  window.SiteSparkGames = {
    myId: myId,
    db: db,
    tttWinner: tttWinner,
    tttBestMove: tttBestMove,
    c4Empty: c4Empty,
    c4Winner: c4Winner,
    c4Full: c4Full,
    c4DropRow: c4DropRow,
    c4BestMove: c4BestMove,
    rpsWinner: rpsWinner,
    findMatch: findMatch
  };
})();</script>`;
}

function ticTacToeScript(bodyId: string, lobbyId: string): string {
  return `<script>(function(){
  var G = window.SiteSparkGames;
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var mode = 'computer';
  var board = Array(9).fill(null);
  var turn = 'X';
  var thinking = false;
  var onlineRoomId = null, onlineUnsub = null, onlineCancel = null, mySeat = null, onlineStatus = '';

  function computerTurn(){
    thinking = true; render();
    setTimeout(function(){
      var move = G.tttBestMove(board.slice(), 'O', 'X');
      if (move !== -1) { board[move] = 'O'; turn = 'X'; }
      thinking = false; render();
    }, 450);
  }

  function localTap(i){
    if (board[i] || G.tttWinner(board) || board.every(function(c){return c!==null;}) || thinking) return;
    if (mode==='computer' && turn==='O') return;
    board[i] = turn;
    turn = turn === 'X' ? 'O' : 'X';
    render();
    if (mode==='computer' && turn==='O' && !G.tttWinner(board) && !board.every(function(c){return c!==null;})) computerTurn();
  }

  function onlineTap(i){
    if (!onlineRoomId || board[i]) return;
    var mySym = mySeat===0 ? 'X' : 'O';
    if (turn !== mySym || G.tttWinner(board)) return;
    var next = board.slice(); next[i] = mySym;
    var nextTurn = mySym === 'X' ? 'O' : 'X';
    G.db.collection('gameRooms').doc(onlineRoomId).update({ state: { board: next, turn: nextTurn }, updatedAt: Date.now() });
  }

  function startOnline(){
    mode = 'online'; onlineStatus = 'searching'; onlineRoomId = null; board = Array(9).fill(null); turn = 'X';
    render();
    onlineCancel = G.findMatch(${JSON.stringify(lobbyId)}, { board: Array(9).fill(null), turn: 'X' }, function(roomId, seat){
      onlineRoomId = roomId; mySeat = seat; onlineStatus = 'playing';
      onlineUnsub = G.db.collection('gameRooms').doc(roomId).onSnapshot(function(doc){
        var data = doc.data(); if (!data) return;
        board = data.state.board; turn = data.state.turn;
        render();
      });
    }, function(){ onlineStatus = 'searching'; render(); });
  }
  function stopOnline(){ if (onlineUnsub) { onlineUnsub(); onlineUnsub = null; } if (onlineCancel) { onlineCancel(); onlineCancel = null; } onlineRoomId = null; }
  function setMode(m){ stopOnline(); mode = m; board = Array(9).fill(null); turn = 'X'; thinking = false; if (m==='online') startOnline(); else render(); }

  function modeBtnsHtml(){
    function btn(key,label){ return '<button data-mode="'+key+'" style="padding:4px 10px;border-radius:999px;border:none;font-size:10px;font-weight:700;margin:0 3px;cursor:pointer;background:'+(mode===key?'#111827':'#F1F5F9')+';color:'+(mode===key?'#fff':'#64748B')+';">'+label+'</button>'; }
    return '<div style="margin-bottom:8px;">'+btn('computer','vs Computer')+btn('local','2 Players')+btn('online','Play Online')+'</div>';
  }

  function render(){
    var winner = G.tttWinner(board);
    var draw = !winner && board.every(function(c){return c!==null;});
    var statusText;
    if (mode==='online' && onlineStatus==='searching') statusText = 'Searching for an opponent…';
    else if (winner) statusText = winner + ' wins!';
    else if (draw) statusText = "It's a draw!";
    else if (thinking) statusText = 'Computer thinking…';
    else if (mode==='online') statusText = (turn === (mySeat===0?'X':'O')) ? 'Your turn' : "Opponent's turn";
    else statusText = turn + "'s turn";

    var html = modeBtnsHtml();
    html += '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:8px;">'+statusText+'</div>';
    if (!(mode==='online' && onlineStatus==='searching')) {
      html += '<div style="display:flex;flex-wrap:wrap;width:132px;">';
      for (var i=0;i<9;i++){
        html += '<div data-cell="'+i+'" style="width:44px;height:44px;border:1px solid #CBD5E1;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:'+(board[i]==='X'?'#4338CA':'#DC2626')+';cursor:pointer;">'+(board[i]||'')+'</div>';
      }
      html += '</div>';
    }
    if (winner || draw) html += '<button data-reset style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
    root.innerHTML = html;

    Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function(btn){ btn.addEventListener('click', function(){ setMode(btn.getAttribute('data-mode')); }); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-cell]'), function(cellEl){
      cellEl.addEventListener('click', function(){
        var i = parseInt(cellEl.getAttribute('data-cell'),10);
        if (mode==='online') onlineTap(i); else localTap(i);
      });
    });
    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ if (mode==='online') { stopOnline(); startOnline(); } else { board = Array(9).fill(null); turn='X'; render(); } });
  }
  render();
})();</script>`;
}

function connectFourScript(bodyId: string, lobbyId: string): string {
  return `<script>(function(){
  var G = window.SiteSparkGames;
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var ROWS = 6, COLS = 7;
  var mode = 'computer';
  var board = G.c4Empty();
  var turn = 'R';
  var thinking = false;
  var onlineRoomId = null, onlineUnsub = null, onlineCancel = null, mySeat = null, onlineStatus = '';

  function computerTurn(){
    thinking = true; render();
    setTimeout(function(){
      var col = G.c4BestMove(board, 'Y', 'R');
      var row = G.c4DropRow(board, col);
      if (row !== -1) { board[row][col] = 'Y'; turn = 'R'; }
      thinking = false; render();
    }, 500);
  }

  function localTap(col){
    if (G.c4Winner(board) || G.c4Full(board) || thinking) return;
    if (mode==='computer' && turn==='Y') return;
    var row = G.c4DropRow(board, col);
    if (row===-1) return;
    board[row][col] = turn;
    turn = turn==='R' ? 'Y' : 'R';
    render();
    if (mode==='computer' && turn==='Y' && !G.c4Winner(board) && !G.c4Full(board)) computerTurn();
  }

  function onlineTap(col){
    if (!onlineRoomId) return;
    var mySym = mySeat===0 ? 'R' : 'Y';
    if (turn !== mySym || G.c4Winner(board)) return;
    var row = G.c4DropRow(board, col);
    if (row===-1) return;
    var next = board.map(function(r){ return r.slice(); });
    next[row][col] = mySym;
    var nextTurn = mySym==='R' ? 'Y' : 'R';
    G.db.collection('gameRooms').doc(onlineRoomId).update({ state: { board: next, turn: nextTurn }, updatedAt: Date.now() });
  }

  function startOnline(){
    mode='online'; onlineStatus='searching'; onlineRoomId=null; board=G.c4Empty(); turn='R';
    render();
    onlineCancel = G.findMatch(${JSON.stringify(lobbyId)}, { board: G.c4Empty(), turn: 'R' }, function(roomId, seat){
      onlineRoomId = roomId; mySeat = seat; onlineStatus='playing';
      onlineUnsub = G.db.collection('gameRooms').doc(roomId).onSnapshot(function(doc){
        var data = doc.data(); if (!data) return;
        board = data.state.board; turn = data.state.turn;
        render();
      });
    }, function(){ onlineStatus='searching'; render(); });
  }
  function stopOnline(){ if (onlineUnsub) { onlineUnsub(); onlineUnsub=null; } if (onlineCancel) { onlineCancel(); onlineCancel=null; } onlineRoomId=null; }
  function setMode(m){ stopOnline(); mode=m; board=G.c4Empty(); turn='R'; thinking=false; if (m==='online') startOnline(); else render(); }

  function modeBtnsHtml(){
    function btn(key,label){ return '<button data-mode="'+key+'" style="padding:4px 10px;border-radius:999px;border:none;font-size:10px;font-weight:700;margin:0 3px;cursor:pointer;background:'+(mode===key?'#111827':'#F1F5F9')+';color:'+(mode===key?'#fff':'#64748B')+';">'+label+'</button>'; }
    return '<div style="margin-bottom:8px;">'+btn('computer','vs Computer')+btn('local','2 Players')+btn('online','Play Online')+'</div>';
  }

  function render(){
    var winner = G.c4Winner(board);
    var full = G.c4Full(board);
    var statusText;
    if (mode==='online' && onlineStatus==='searching') statusText = 'Searching for an opponent…';
    else if (winner) statusText = (winner==='R'?'Red':'Yellow') + ' wins!';
    else if (full) statusText = "It's a draw!";
    else if (thinking) statusText = 'Computer thinking…';
    else if (mode==='online') statusText = (turn === (mySeat===0?'R':'Y')) ? 'Your turn' : "Opponent's turn";
    else statusText = (turn==='R'?'Red':'Yellow') + "'s turn";

    var html = modeBtnsHtml();
    html += '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:8px;">'+statusText+'</div>';
    if (!(mode==='online' && onlineStatus==='searching')) {
      html += '<div>';
      for (var r=0;r<ROWS;r++){
        html += '<div style="display:flex;">';
        for (var c=0;c<COLS;c++){
          var cell = board[r][c];
          html += '<div data-col="'+c+'" style="width:26px;height:26px;border:1px solid #93C5FD;background:#DBEAFE;display:flex;align-items:center;justify-content:center;cursor:pointer;">'+(cell?'<div style="width:20px;height:20px;border-radius:10px;background:'+(cell==='R'?'#DC2626':'#EAB308')+';"></div>':'')+'</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    if (winner || full) html += '<button data-reset style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
    root.innerHTML = html;

    Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function(btn){ btn.addEventListener('click', function(){ setMode(btn.getAttribute('data-mode')); }); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-col]'), function(colEl){
      colEl.addEventListener('click', function(){
        var c = parseInt(colEl.getAttribute('data-col'),10);
        if (mode==='online') onlineTap(c); else localTap(c);
      });
    });
    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ if (mode==='online') { stopOnline(); startOnline(); } else { board=G.c4Empty(); turn='R'; render(); } });
  }
  render();
})();</script>`;
}

function rpsScript(bodyId: string, lobbyId: string): string {
  return `<script>(function(){
  var G = window.SiteSparkGames;
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var CHOICES = ['rock','paper','scissors'];
  var EMOJI = { rock:'✊', paper:'✋', scissors:'✌️' };
  var mode = 'computer';
  var myChoice=null, oppChoice=null, scoreA=0, scoreB=0, waitingForP2=false;
  var onlineRoomId=null, onlineUnsub=null, onlineCancel=null, mySeat=null, onlineStatus='';

  function localPick(choice){
    if (mode==='computer'){
      var comp = CHOICES[Math.floor(Math.random()*3)];
      myChoice = choice; oppChoice = comp;
      var result = G.rpsWinner(choice, comp);
      if (result==='a') scoreA++; else if (result==='b') scoreB++;
      render();
    } else if (myChoice===null){
      myChoice = choice; waitingForP2 = true; render();
    } else if (oppChoice===null){
      oppChoice = choice; waitingForP2 = false;
      var result2 = G.rpsWinner(myChoice, oppChoice);
      if (result2==='a') scoreA++; else if (result2==='b') scoreB++;
      render();
    }
  }

  function onlinePick(choice){
    if (!onlineRoomId) return;
    var roomRef = G.db.collection('gameRooms').doc(onlineRoomId);
    G.db.runTransaction(function(tx){
      return tx.get(roomRef).then(function(doc){
        var data = doc.data();
        var state = data.state;
        if (state.resolvedRound === state.round) state = Object.assign({}, state, { round: state.round + 1, choices: {} });
        state.choices = Object.assign({}, state.choices);
        state.choices[G.myId] = choice;
        var uids = Object.keys(state.choices);
        if (uids.length===2 && state.resolvedRound !== state.round) {
          var a = data.players[0], b = data.players[1];
          var ca = state.choices[a], cb = state.choices[b];
          var result = G.rpsWinner(ca, cb);
          state.scoreA = (state.scoreA||0) + (result==='a'?1:0);
          state.scoreB = (state.scoreB||0) + (result==='b'?1:0);
          state.lastResult = { a: ca, b: cb, result: result };
          state.resolvedRound = state.round;
        }
        tx.update(roomRef, { state: state, updatedAt: Date.now() });
      });
    }).catch(function(err){ console.error('rps move error', err); });
  }

  function startOnline(){
    mode='online'; onlineStatus='searching'; onlineRoomId=null; myChoice=null; oppChoice=null;
    render();
    onlineCancel = G.findMatch(${JSON.stringify(lobbyId)}, { round: 0, resolvedRound: -1, choices: {}, scoreA: 0, scoreB: 0, lastResult: null }, function(roomId, seat){
      onlineRoomId = roomId; mySeat = seat; onlineStatus='playing';
      onlineUnsub = G.db.collection('gameRooms').doc(roomId).onSnapshot(function(doc){
        var data = doc.data(); if (!data) return;
        renderOnline(data);
      });
    }, function(){ onlineStatus='searching'; render(); });
  }
  function stopOnline(){ if (onlineUnsub) { onlineUnsub(); onlineUnsub=null; } if (onlineCancel) { onlineCancel(); onlineCancel=null; } onlineRoomId=null; }
  function setMode(m){ stopOnline(); mode=m; myChoice=null; oppChoice=null; waitingForP2=false; scoreA=0; scoreB=0; if (m==='online') startOnline(); else render(); }

  function modeBtnsHtml(){
    function btn(key,label){ return '<button data-mode="'+key+'" style="padding:4px 10px;border-radius:999px;border:none;font-size:10px;font-weight:700;margin:0 3px;cursor:pointer;background:'+(mode===key?'#111827':'#F1F5F9')+';color:'+(mode===key?'#fff':'#64748B')+';">'+label+'</button>'; }
    return '<div style="margin-bottom:8px;">'+btn('computer','vs Computer')+btn('local','2 Players')+btn('online','Play Online')+'</div>';
  }
  function choiceButtonsHtml(){
    var html = '<div>';
    CHOICES.forEach(function(c){ html += '<button data-choice="'+c+'" style="width:48px;height:48px;border-radius:24px;background:#F1F5F9;border:none;font-size:22px;margin:0 4px;cursor:pointer;">'+EMOJI[c]+'</button>'; });
    html += '</div>';
    return html;
  }

  function render(){
    var html = modeBtnsHtml();
    var showResult = myChoice!==null && oppChoice!==null;
    html += '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:6px;">Player 1: '+scoreA+' · '+(mode==='computer'?'Computer':'Player 2')+': '+scoreB+'</div>';
    if (!showResult){
      html += '<div style="font-size:11px;color:#64748B;margin-bottom:6px;">'+(mode==='computer'?'Make your move':(waitingForP2?'Player 2: make your move':'Player 1: make your move'))+'</div>';
      html += choiceButtonsHtml();
    } else {
      var result = G.rpsWinner(myChoice, oppChoice);
      html += '<div style="font-size:30px;margin-bottom:6px;">'+EMOJI[myChoice]+' vs '+EMOJI[oppChoice]+'</div>';
      html += '<div style="font-weight:700;font-size:14px;color:#334155;margin-bottom:8px;">'+(result==='draw'?"It's a tie!":(result==='a'?'Player 1 wins!':(mode==='computer'?'Computer wins!':'Player 2 wins!')))+'</div>';
      html += '<button data-reset style="background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
    }
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function(btn){ btn.addEventListener('click', function(){ setMode(btn.getAttribute('data-mode')); }); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-choice]'), function(btn){ btn.addEventListener('click', function(){ localPick(btn.getAttribute('data-choice')); }); });
    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ myChoice=null; oppChoice=null; render(); });
  }

  function renderOnline(data){
    var state = data.state;
    var myUid = G.myId;
    var haveMine = state.choices && state.choices[myUid] != null;
    var lastResult = state.resolvedRound === state.round ? state.lastResult : null;
    var html = modeBtnsHtml();
    html += '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:6px;">You: '+(mySeat===0?state.scoreA:state.scoreB)+' · Opponent: '+(mySeat===0?state.scoreB:state.scoreA)+'</div>';
    if (onlineStatus==='searching') {
      html += '<div style="font-size:12px;color:#64748B;">Searching for an opponent…</div>';
    } else if (lastResult) {
      var myChoiceShown = mySeat===0 ? lastResult.a : lastResult.b;
      var oppChoiceShown = mySeat===0 ? lastResult.b : lastResult.a;
      var mine = mySeat===0 ? 'a' : 'b';
      html += '<div style="font-size:30px;margin-bottom:6px;">'+EMOJI[myChoiceShown]+' vs '+EMOJI[oppChoiceShown]+'</div>';
      html += '<div style="font-weight:700;font-size:14px;color:#334155;margin-bottom:8px;">'+(lastResult.result==='draw'?"It's a tie!":(lastResult.result===mine?'You win!':'Opponent wins!'))+'</div>';
      html += choiceButtonsHtml();
      html += '<div style="font-size:10px;color:#94A3B8;margin-top:4px;">Pick again to start the next round</div>';
    } else if (haveMine) {
      html += '<div style="font-size:12px;color:#64748B;">Waiting for opponent…</div>';
    } else {
      html += '<div style="font-size:11px;color:#64748B;margin-bottom:6px;">Make your move</div>';
      html += choiceButtonsHtml();
    }
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll('[data-mode]'), function(btn){ btn.addEventListener('click', function(){ setMode(btn.getAttribute('data-mode')); }); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-choice]'), function(btn){ btn.addEventListener('click', function(){ onlinePick(btn.getAttribute('data-choice')); }); });
  }
  render();
})();</script>`;
}

function clickerScript(bodyId: string, label: string, target: number): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var label = ${JSON.stringify(escapeHtml(label || 'Tap!'))};
  var target = ${JSON.stringify(Math.max(1, target))};
  var count = 0;
  function render(){
    var won = count >= target;
    var html = '<div style="font-weight:700;font-size:13px;color:#334155;">' + (won ? 'You did it!' : count + ' / ' + target) + '</div>';
    html += '<button data-tap style="margin-top:8px;background:'+(won?'#16A34A':'#4338CA')+';color:#fff;border:none;border-radius:12px;padding:14px 20px;font-weight:800;font-size:15px;cursor:pointer;">'+(won?'🎉':label)+'</button>';
    if (won) html += '<button data-reset style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
    root.innerHTML = html;
    var tapBtn = root.querySelector('[data-tap]');
    if (tapBtn && !won) tapBtn.addEventListener('click', function(){ count++; render(); });
    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ count=0; render(); });
  }
  render();
})();</script>`;
}

function memoryScript(bodyId: string, symbols: string[]): string {
  const safeSymbols = (symbols.length >= 2 ? symbols : ['🍎', '🍋', '🍇', '🍓']).map((s) => escapeHtml(s));
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var symbols = ${JSON.stringify(safeSymbols)};
  var deck = symbols.concat(symbols).map(function(s,i){ return {id:i, symbol:s}; });
  for (var i=deck.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=deck[i]; deck[i]=deck[j]; deck[j]=t; }
  var flipped = [];
  var matched = {};
  function render(){
    var matchedCount = Object.keys(matched).length;
    var won = matchedCount === deck.length;
    var cols = deck.length <= 12 ? 4 : 5;
    var cell = 40;
    var html = '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:8px;">' + (won ? 'All matched! 🎉' : 'Find the pairs') + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;width:'+(cell*cols)+'px;justify-content:center;">';
    deck.forEach(function(card, idx){
      var shown = flipped.indexOf(idx) !== -1 || matched[idx];
      html += '<div data-card="'+idx+'" style="width:'+cell+'px;height:'+cell+'px;border:1px solid #CBD5E1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;background:#F8FAFC;margin:1px;cursor:pointer;">'+(shown?card.symbol:'')+'</div>';
    });
    html += '</div>';
    if (won) html += '<button data-reset style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll('[data-card]'), function(elCard){
      elCard.addEventListener('click', function(){
        var idx = parseInt(elCard.getAttribute('data-card'),10);
        if (flipped.length===2 || flipped.indexOf(idx)!==-1 || matched[idx]) return;
        flipped.push(idx);
        render();
        if (flipped.length===2){
          var a=flipped[0], b=flipped[1];
          if (deck[a].symbol === deck[b].symbol){
            matched[a]=true; matched[b]=true; flipped=[];
            render();
          } else {
            setTimeout(function(){ flipped=[]; render(); }, 700);
          }
        }
      });
    });
    var resetBtn = root.querySelector('[data-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ matched={}; flipped=[]; render(); });
  }
  render();
})();</script>`;
}

function triviaScript(bodyId: string, questions: GameElement['questions']): string {
  const safeQuestions = questions.map((q) => ({
    question: escapeHtml(q.question),
    options: q.options.map((o) => escapeHtml(o)),
    correctIndex: q.correctIndex,
  }));
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var questions = ${JSON.stringify(safeQuestions)};
  var index = 0, score = 0, selected = null;
  function render(){
    if (questions.length === 0){ root.innerHTML = '<div style="font-size:13px;color:#94A3B8;">No questions yet.</div>'; return; }
    if (index >= questions.length){
      root.innerHTML = '<div style="font-weight:700;font-size:15px;color:#334155;">Score: '+score+' / '+questions.length+'</div><button data-again style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">Play Again</button>';
      root.querySelector('[data-again]').addEventListener('click', function(){ index=0; score=0; selected=null; render(); });
      return;
    }
    var q = questions[index];
    var html = '<div style="font-weight:700;font-size:14px;color:#0F172A;text-align:center;margin-bottom:8px;padding:0 8px;">'+q.question+'</div>';
    html += '<div style="width:100%;padding:0 8px;">';
    q.options.forEach(function(opt, i){
      var bg = '#F8FAFC', border='#E2E8F0';
      if (selected !== null && i === q.correctIndex) { bg='#DCFCE7'; border='#16A34A'; }
      else if (selected === i && i !== q.correctIndex) { bg='#FEE2E2'; border='#DC2626'; }
      html += '<div data-opt="'+i+'" style="border:1px solid '+border+';background:'+bg+';border-radius:8px;padding:8px;margin-bottom:6px;font-size:13px;color:#1E293B;font-weight:600;cursor:pointer;">'+opt+'</div>';
    });
    html += '</div>';
    if (selected !== null) html += '<button data-next style="margin-top:6px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">'+((index+1>=questions.length)?'See Score':'Next')+'</button>';
    root.innerHTML = html;
    if (selected === null){
      Array.prototype.forEach.call(root.querySelectorAll('[data-opt]'), function(optEl){
        optEl.addEventListener('click', function(){
          var i = parseInt(optEl.getAttribute('data-opt'),10);
          selected = i;
          if (i === q.correctIndex) score++;
          render();
        });
      });
    } else {
      var nextBtn = root.querySelector('[data-next]');
      if (nextBtn) nextBtn.addEventListener('click', function(){ selected=null; index++; render(); });
    }
  }
  render();
})();</script>`;
}

function simonScript(bodyId: string): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var COLORS = ['#16A34A','#DC2626','#EAB308','#2563EB'];
  var sequence = [];
  var playerIndex = 0;
  var activePanel = null;
  var phase = 'idle';
  var level = 0;

  function playSequence(){
    phase = 'showing'; render();
    var seq = sequence;
    seq.forEach(function(panel, i){
      setTimeout(function(){
        activePanel = panel; render();
        setTimeout(function(){ activePanel = null; render(); }, 350);
      }, i * 650);
    });
    setTimeout(function(){ playerIndex = 0; phase = 'waiting'; render(); }, seq.length * 650);
  }

  function start(){
    sequence = [Math.floor(Math.random()*4)];
    playerIndex = 0; level = 1;
    setTimeout(playSequence, 400);
  }

  function tapPanel(i){
    if (phase !== 'waiting') return;
    activePanel = i; render();
    setTimeout(function(){ activePanel = null; render(); }, 200);
    if (i === sequence[playerIndex]) {
      playerIndex += 1;
      if (playerIndex === sequence.length) {
        sequence = sequence.concat([Math.floor(Math.random()*4)]);
        level = sequence.length;
        phase = 'showing';
        setTimeout(playSequence, 500);
      }
    } else {
      phase = 'gameover';
      render();
    }
  }

  function render(){
    var html = '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:8px;">' +
      (phase==='idle' ? 'Tap Start' : phase==='gameover' ? 'Game over — Level '+level : 'Level '+level) + '</div>';
    if (phase==='showing' || phase==='waiting') {
      html += '<div style="width:132px;height:132px;display:flex;flex-wrap:wrap;gap:6px;">';
      COLORS.forEach(function(color, i){
        html += '<div data-panel="'+i+'" style="width:63px;height:63px;background:'+color+';opacity:'+(activePanel===i?1:0.4)+';border-radius:8px;cursor:pointer;"></div>';
      });
      html += '</div>';
    }
    if (phase==='idle' || phase==='gameover') {
      html += '<button data-start style="margin-top:10px;background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">'+(phase==='gameover'?'Play Again':'Start')+'</button>';
    }
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll('[data-panel]'), function(panelEl){
      panelEl.addEventListener('click', function(){ tapPanel(parseInt(panelEl.getAttribute('data-panel'),10)); });
    });
    var startBtn = root.querySelector('[data-start]');
    if (startBtn) startBtn.addEventListener('click', start);
  }
  render();
})();</script>`;
}

function flappyScript(bodyId: string): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var GRAVITY = 0.8, FLAP = -8, PIPE_GAP = 90, PIPE_WIDTH = 30, BIRD_SIZE = 16, TICK_MS = 40, PIPE_SPEED = 3, PIPE_SPACING = 130;
  var playW = root.clientWidth || 220, playH = 200;
  var birdX = Math.round(playW * 0.25);
  var birdY = playH / 2, velocity = 0, pipes = [{ x: playW + 40, gapY: playH / 2, passed: false }];
  var score = 0, phase = 'ready', timer = null;

  function stopLoop(){ if (timer) { clearInterval(timer); timer = null; } }

  function tick(){
    velocity += GRAVITY;
    birdY += velocity;

    pipes = pipes.map(function(p){ return { x: p.x - PIPE_SPEED, gapY: p.gapY, passed: p.passed }; });
    var last = pipes[pipes.length - 1];
    if (!last || last.x < playW - PIPE_SPACING) {
      var margin = 40;
      var gapY = margin + Math.random() * (playH - margin * 2);
      pipes.push({ x: playW, gapY: gapY, passed: false });
    }
    pipes = pipes.filter(function(p){ return p.x > -PIPE_WIDTH; });

    pipes.forEach(function(p){
      if (!p.passed && p.x + PIPE_WIDTH < birdX) { score += 1; p.passed = true; }
    });

    var dead = birdY < 0 || birdY + BIRD_SIZE > playH;
    pipes.forEach(function(p){
      var birdLeft = birdX, birdRight = birdX + BIRD_SIZE, pipeLeft = p.x, pipeRight = p.x + PIPE_WIDTH;
      if (birdRight > pipeLeft && birdLeft < pipeRight) {
        var gapTop = p.gapY - PIPE_GAP / 2, gapBottom = p.gapY + PIPE_GAP / 2;
        if (birdY < gapTop || birdY + BIRD_SIZE > gapBottom) dead = true;
      }
    });

    if (dead) { stopLoop(); phase = 'gameover'; render(); return; }
    render();
  }

  function start(){
    birdY = playH / 2; velocity = 0;
    pipes = [{ x: playW + 40, gapY: playH / 2, passed: false }];
    score = 0; phase = 'playing';
    stopLoop();
    timer = setInterval(tick, TICK_MS);
    render();
  }

  function flap(){
    if (phase === 'ready' || phase === 'gameover') { start(); return; }
    velocity = FLAP;
  }

  function render(){
    var statusText = phase==='ready' ? 'Tap to start' : phase==='gameover' ? 'Game over — Score '+score : 'Score: '+score;
    var html = '<div style="font-weight:700;font-size:13px;color:#334155;margin-bottom:6px;text-align:center;">'+statusText+'</div>';
    html += '<div style="position:relative;width:'+playW+'px;height:'+playH+'px;background:#BAE6FD;overflow:hidden;border-radius:8px;">';
    html += '<div style="position:absolute;left:'+birdX+'px;top:'+birdY+'px;width:'+BIRD_SIZE+'px;height:'+BIRD_SIZE+'px;background:#EAB308;border-radius:'+(BIRD_SIZE/2)+'px;"></div>';
    pipes.forEach(function(p){
      var topH = Math.max(0, p.gapY - PIPE_GAP/2);
      var botH = Math.max(0, playH - (p.gapY + PIPE_GAP/2));
      html += '<div style="position:absolute;left:'+p.x+'px;top:0;width:'+PIPE_WIDTH+'px;height:'+topH+'px;background:#16A34A;"></div>';
      html += '<div style="position:absolute;left:'+p.x+'px;top:'+(p.gapY+PIPE_GAP/2)+'px;width:'+PIPE_WIDTH+'px;height:'+botH+'px;background:#16A34A;"></div>';
    });
    html += '</div>';
    root.innerHTML = html;
  }
  root.style.cursor = 'pointer';
  root.addEventListener('click', flap);
  render();
})();</script>`;
}

function tetrisScript(bodyId: string): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var COLS = 8, ROWS = 14, BASE_TICK_MS = 700;
  var cellSize = (root.clientWidth && root.clientWidth < 220) ? 14 : 18;
  var playW = cellSize * COLS, playH = cellSize * ROWS;
  var COLORS = { I:'#22D3EE', O:'#FACC15', T:'#A855F7', S:'#22C55E', Z:'#EF4444', J:'#3B82F6', L:'#F97316' };
  var SHAPES = {
    I: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
    O: [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
    T: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
    S: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
    Z: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
    J: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
    L: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]]
  };
  var TYPES = ['I','O','T','S','Z','J','L'];

  function emptyBoard(){ var b=[]; for (var r=0;r<ROWS;r++){ b.push(new Array(COLS).fill(null)); } return b; }
  function randomType(){ return TYPES[Math.floor(Math.random()*TYPES.length)]; }
  function spawnPiece(){ return { type: randomType(), rotation: 0, x: Math.floor(COLS/2)-2, y: 0 }; }
  function cellsFor(piece){ return SHAPES[piece.type][piece.rotation].map(function(d){ return [piece.x+d[0], piece.y+d[1]]; }); }
  function collides(board, piece){
    return cellsFor(piece).some(function(c){
      var x=c[0], y=c[1];
      if (x<0 || x>=COLS || y>=ROWS) return true;
      if (y<0) return false;
      return !!board[y][x];
    });
  }
  function levelForLines(lines){ return Math.floor(lines/10)+1; }

  var board = emptyBoard();
  var piece = spawnPiece();
  var lines = 0, score = 0, level = 1, phase = 'ready';
  var timer = null;

  function stopLoop(){ if (timer) { clearTimeout(timer); timer = null; } }

  function lockAndAdvance(){
    cellsFor(piece).forEach(function(c){
      var x=c[0], y=c[1];
      if (y>=0 && y<ROWS && x>=0 && x<COLS) board[y][x] = piece.type;
    });
    var cleared = 0;
    var kept = board.filter(function(row){
      var full = row.every(function(cell){ return cell !== null; });
      if (full) cleared += 1;
      return !full;
    });
    while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(null));
    board = kept;
    if (cleared > 0) {
      lines += cleared;
      var points = [0,100,300,500,800][cleared] * levelForLines(lines - cleared);
      score += points;
      level = levelForLines(lines);
    }
    piece = spawnPiece();
    if (collides(board, piece)) { phase = 'gameover'; stopLoop(); render(); return true; }
    return false;
  }

  function scheduleNext(){
    stopLoop();
    var delay = Math.max(150, BASE_TICK_MS - (levelForLines(lines)-1)*60);
    timer = setTimeout(tick, delay);
  }

  function tick(){
    var moved = { type: piece.type, rotation: piece.rotation, x: piece.x, y: piece.y+1 };
    var gameOver = false;
    if (collides(board, moved)) { gameOver = lockAndAdvance(); }
    else { piece = moved; }
    render();
    if (!gameOver) scheduleNext();
  }

  function start(){
    board = emptyBoard(); lines = 0; score = 0; level = 1;
    piece = spawnPiece();
    phase = 'playing';
    render();
    scheduleNext();
  }

  function move(dx){
    if (phase !== 'playing') return;
    var moved = { type: piece.type, rotation: piece.rotation, x: piece.x+dx, y: piece.y };
    if (!collides(board, moved)) { piece = moved; render(); }
  }

  function rotate(){
    if (phase !== 'playing') return;
    var base = { type: piece.type, rotation: (piece.rotation+1)%4, x: piece.x, y: piece.y };
    var kicks = [0,-1,1,-2,2];
    for (var i=0;i<kicks.length;i++){
      var kicked = { type: base.type, rotation: base.rotation, x: base.x+kicks[i], y: base.y };
      if (!collides(board, kicked)) { piece = kicked; render(); return; }
    }
  }

  function softDrop(){ if (phase === 'playing') tick(); }

  function render(){
    var grid = board.map(function(row){ return row.slice(); });
    if (phase === 'playing') {
      cellsFor(piece).forEach(function(c){
        var x=c[0], y=c[1];
        if (y>=0 && y<ROWS && x>=0 && x<COLS) grid[y][x] = piece.type;
      });
    }
    var statusText = phase==='ready' ? 'Tap Start to play' : phase==='gameover' ? 'Game over — Score '+score : 'Score '+score+' \\u00b7 Lvl '+level;
    var html = '<div style="font-weight:700;font-size:12px;color:#334155;margin-bottom:6px;text-align:center;">'+statusText+'</div>';
    html += '<div style="position:relative;width:'+playW+'px;height:'+playH+'px;background:#0F172A;border-radius:6px;overflow:hidden;">';
    for (var ry=0; ry<ROWS; ry++){
      for (var rx=0; rx<COLS; rx++){
        var cell = grid[ry][rx];
        html += '<div style="position:absolute;left:'+(rx*cellSize)+'px;top:'+(ry*cellSize)+'px;width:'+(cellSize-1)+'px;height:'+(cellSize-1)+'px;background:'+(cell?COLORS[cell]:'#1E293B')+';border-radius:2px;"></div>';
      }
    }
    html += '</div>';
    if (phase === 'playing') {
      html += '<div style="display:flex;gap:6px;margin-top:6px;justify-content:center;">';
      html += '<button data-left style="width:34px;height:34px;border-radius:8px;background:#1E293B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;">\\u2b05</button>';
      html += '<button data-rotate style="width:34px;height:34px;border-radius:8px;background:#1E293B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;">\\u27f3</button>';
      html += '<button data-down style="width:34px;height:34px;border-radius:8px;background:#1E293B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;">\\u2b07</button>';
      html += '<button data-right style="width:34px;height:34px;border-radius:8px;background:#1E293B;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;">\\u27a1</button>';
      html += '</div>';
    } else {
      html += '<div style="text-align:center;margin-top:8px;"><button data-start style="background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;">'+(phase==='gameover'?'Play Again':'Start')+'</button></div>';
    }
    root.innerHTML = html;
    var leftBtn = root.querySelector('[data-left]'); if (leftBtn) leftBtn.addEventListener('click', function(){ move(-1); });
    var rightBtn = root.querySelector('[data-right]'); if (rightBtn) rightBtn.addEventListener('click', function(){ move(1); });
    var rotateBtn = root.querySelector('[data-rotate]'); if (rotateBtn) rotateBtn.addEventListener('click', rotate);
    var downBtn = root.querySelector('[data-down]'); if (downBtn) downBtn.addEventListener('click', softDrop);
    var startBtn = root.querySelector('[data-start]'); if (startBtn) startBtn.addEventListener('click', start);
  }
  render();
  })();</script>`;
}

// Real WebGL (Three.js, loaded via CDN in renderProjectHtml) -- published-site only. The
// in-app editor has no native GL pipeline, so this game gets a simplified 2D fallback there
// instead (see TargetRange3DPreview in GameView.tsx).
function targetRange3DScript(bodyId: string): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var playW = root.clientWidth || 260, playH = 240;
  var ROUND_SECONDS = 25;
  var score = 0, timeLeft = ROUND_SECONDS, phase = 'ready';
  var timer = null;

  var overlay = document.createElement('div');
  overlay.style.cssText = 'font-weight:700;font-size:12px;color:#334155;margin-bottom:6px;text-align:center;';
  var canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'position:relative;width:'+playW+'px;height:'+playH+'px;border-radius:8px;overflow:hidden;background:#0F172A;';
  var startWrap = document.createElement('div');
  startWrap.style.cssText = 'text-align:center;margin-top:8px;';
  var startBtn = document.createElement('button');
  startBtn.textContent = 'Start';
  startBtn.style.cssText = 'background:#111827;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:12px;cursor:pointer;';
  startWrap.appendChild(startBtn);

  root.innerHTML = '';
  root.appendChild(overlay);
  root.appendChild(canvasWrap);
  root.appendChild(startWrap);

  function setStatus(){
    overlay.textContent = phase==='ready' ? 'Tap Start to shoot' : phase==='gameover' ? ("Time's up \\u2014 Score "+score) : ('Score '+score+' \\u00b7 '+timeLeft+'s');
    startBtn.textContent = phase==='gameover' ? 'Play Again' : 'Start';
    startWrap.style.display = phase==='playing' ? 'none' : 'block';
  }

  if (typeof THREE === 'undefined') {
    overlay.textContent = '3D unavailable in this browser';
    return;
  }

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, playW / playH, 0.1, 100);
  camera.position.z = 6;
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(playW, playH);
  renderer.setClearColor(0x0F172A, 1);
  canvasWrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  var targets = [];
  var raycaster = new THREE.Raycaster();
  var colors = [0xEF4444, 0xF97316, 0xEAB308, 0x22C55E, 0x3B82F6, 0xA855F7];

  function spawnTarget(){
    var geo = new THREE.SphereGeometry(0.45, 20, 20);
    var mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)] });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random()-0.5)*5, (Math.random()-0.5)*2.6, -1 - Math.random()*5);
    mesh.userData.bobOffset = Math.random()*Math.PI*2;
    mesh.userData.baseY = mesh.position.y;
    scene.add(mesh);
    targets.push(mesh);
  }

  for (var i=0; i<4; i++) spawnTarget();

  function onShoot(clientX, clientY){
    if (phase !== 'playing') return;
    var rect = renderer.domElement.getBoundingClientRect();
    var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    var hits = raycaster.intersectObjects(targets);
    if (hits.length > 0) {
      var hitMesh = hits[0].object;
      scene.remove(hitMesh);
      hitMesh.geometry.dispose();
      hitMesh.material.dispose();
      targets = targets.filter(function(t){ return t !== hitMesh; });
      score += 1;
      setStatus();
      spawnTarget();
    }
  }

  renderer.domElement.style.cursor = 'crosshair';
  renderer.domElement.addEventListener('click', function(e){ onShoot(e.clientX, e.clientY); });

  function animate(){
    var t = Date.now() / 1000;
    targets.forEach(function(mesh){
      mesh.position.y = mesh.userData.baseY + Math.sin(t*1.5 + mesh.userData.bobOffset) * 0.3;
      mesh.rotation.y += 0.01;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  function stopTimer(){ if (timer) { clearInterval(timer); timer = null; } }

  function start(){
    score = 0; timeLeft = ROUND_SECONDS; phase = 'playing';
    setStatus();
    stopTimer();
    timer = setInterval(function(){
      timeLeft -= 1;
      if (timeLeft <= 0) {
        timeLeft = 0; phase = 'gameover'; stopTimer(); setStatus();
        return;
      }
      setStatus();
    }, 1000);
  }

  startBtn.addEventListener('click', start);
  setStatus();
  })();</script>`;
}

// Real WebGL (Three.js, same CDN load as targetRange3DScript) with real gravity, a rolling
// pointer-velocity buffer so a flick's *final* motion (not the whole gesture's average) sets
// launch power/direction, cosmetic spin, and approximate rim/backboard collision -- the
// in-editor version is a simplified 2D stand-in (see BasketballGamePreview in GameView.tsx).
function basketballScript(bodyId: string): string {
  return `<script>(function(){
  var root = document.getElementById(${JSON.stringify(bodyId)});
  var playW = root.clientWidth || 260, playH = 300;
  var score = 0;

  var overlay = document.createElement('div');
  overlay.style.cssText = 'font-weight:800;font-size:12px;color:#fff;background:linear-gradient(135deg,#F97316,#EA580C);margin-bottom:6px;padding:4px 12px;border-radius:999px;text-align:center;display:inline-block;align-self:center;box-shadow:0 2px 6px rgba(234,88,12,0.35);';
  overlay.textContent = 'Swipe up to shoot!';
  var canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'position:relative;width:'+playW+'px;height:'+playH+'px;border-radius:8px;overflow:hidden;background:#1E293B;box-shadow:0 4px 14px rgba(15,23,42,0.25);';

  root.innerHTML = '';
  root.appendChild(overlay);
  root.appendChild(canvasWrap);

  if (typeof THREE === 'undefined') {
    overlay.textContent = '3D unavailable in this browser';
    return;
  }

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, playW / playH, 0.1, 100);
  camera.position.set(0, 2.1, 6.2);
  camera.lookAt(0, 2.6, -2);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(playW, playH);
  renderer.setClearColor(0x1E293B, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = 'none';
  canvasWrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(2, 6, 3);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.left = -6; dirLight.shadow.camera.right = 6;
  dirLight.shadow.camera.top = 6; dirLight.shadow.camera.bottom = -6;
  scene.add(dirLight);

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x92400E }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  var hoopHeight = 3.05, hoopZ = -2.4;
  var backboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.05, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xF8FAFC, transparent: true, opacity: 0.85 })
  );
  backboard.position.set(0, hoopHeight + 0.35, hoopZ - 0.15);
  backboard.castShadow = true;
  backboard.receiveShadow = true;
  scene.add(backboard);

  var rimRadius = 0.45;
  var rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, 0.03, 12, 24), new THREE.MeshStandardMaterial({ color: 0xF97316 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, hoopHeight, hoopZ);
  rim.castShadow = true;
  scene.add(rim);

  // Net -- a handful of hanging line segments, purely visual, wobble-animated on a make.
  var netGroup = new THREE.Group();
  netGroup.position.set(0, hoopHeight, hoopZ);
  var netSegments = 10;
  for (var n = 0; n < netSegments; n++) {
    var angle = (n / netSegments) * Math.PI * 2;
    var x0 = Math.cos(angle) * rimRadius, z0 = Math.sin(angle) * rimRadius;
    var netGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, 0, z0),
      new THREE.Vector3(x0 * 0.5, -0.45, z0 * 0.5),
    ]);
    netGroup.add(new THREE.Line(netGeo, new THREE.LineBasicMaterial({ color: 0xF1F5F9 })));
  }
  scene.add(netGroup);

  var ballRadius = 0.28;
  var ball = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 20, 20), new THREE.MeshStandardMaterial({ color: 0xEA580C, roughness: 0.6 }));
  ball.castShadow = true;
  var seamMat = new THREE.MeshStandardMaterial({ color: 0x7C2D12 });
  for (var s = 0; s < 2; s++) {
    var seam = new THREE.Mesh(new THREE.TorusGeometry(ballRadius, 0.012, 6, 24), seamMat);
    seam.rotation.y = s * Math.PI / 2;
    ball.add(seam);
  }
  var restPos = new THREE.Vector3(0, 1.1, 2.4);
  ball.position.copy(restPos);
  scene.add(ball);

  // Aim trail -- a visible affordance for how the flick will play out while it's held.
  var trailPoints = [];
  var trailGeo = new THREE.BufferGeometry();
  var trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.6 }));
  scene.add(trailLine);
  function updateTrail(){
    if (trailPoints.length < 2) { trailLine.visible = false; return; }
    trailLine.visible = true;
    trailGeo.setFromPoints(trailPoints);
  }

  var velocity = new THREE.Vector3(0, 0, 0);
  var spinAxis = new THREE.Vector3(1, 0, 0);
  var spinSpeed = 0;
  var phase = 'ready'; // ready | dragging | flying | reset
  var scored = false;
  var prevY = ball.position.y;
  var GRAVITY = 9.0;
  var wobbleT = 0;

  // Rolling buffer of recent pointer samples -- a flick's *final* motion (the last few
  // samples before release), not the whole gesture's average, sets launch velocity, so a
  // slow drag ending in a fast flick reads as a real fast flick.
  var samples = [];
  function pushSample(x, y){
    samples.push({ x: x, y: y, t: Date.now() });
    while (samples.length > 8) samples.shift();
  }

  function resetBall(){
    ball.position.copy(restPos);
    velocity.set(0, 0, 0);
    spinSpeed = 0;
    scored = false;
    prevY = ball.position.y;
    trailPoints = [];
    updateTrail();
    phase = 'ready';
    overlay.textContent = score > 0 ? ('Score: ' + score) : 'Swipe up to shoot!';
  }

  function onDown(x, y){
    if (phase === 'flying') return;
    phase = 'dragging';
    samples = [];
    pushSample(x, y);
  }

  function onMove(x, y){
    if (phase !== 'dragging') return;
    pushSample(x, y);
    var start = samples[0];
    var dx = (x - start.x) / renderer.domElement.clientWidth;
    var dy = (y - start.y) / renderer.domElement.clientHeight;
    // Small aiming envelope around the resting position -- real pre-release visual feedback.
    ball.position.x = restPos.x + dx * 1.4;
    ball.position.y = Math.max(0.4, restPos.y - dy * 1.4);
    trailPoints.push(ball.position.clone());
    if (trailPoints.length > 12) trailPoints.shift();
    updateTrail();
  }

  function onUp(){
    if (phase !== 'dragging') return;
    trailPoints = [];
    updateTrail();
    if (samples.length < 2) { phase = 'ready'; ball.position.copy(restPos); return; }
    var last = samples[samples.length - 1];
    var ref = samples[Math.max(0, samples.length - 4)];
    var dt = Math.max(1, last.t - ref.t);
    var vx = (last.x - ref.x) / dt;
    var vy = (last.y - ref.y) / dt;
    var speed = Math.sqrt(vx * vx + vy * vy);
    // Below a minimum speed (or not a real upward swipe), treat it as "no real flick" and
    // snap back rather than a weak, mushy lob.
    if (speed < 0.15 || vy > -0.02) {
      phase = 'ready';
      ball.position.copy(restPos);
      overlay.textContent = 'Swipe up to shoot!';
      return;
    }
    var power = Math.min(speed * 22, 10);
    velocity.set(vx * 18, -vy * 22, -power);
    spinAxis.set(-vy, 0, vx);
    if (spinAxis.lengthSq() < 0.0001) spinAxis.set(1, 0, 0); else spinAxis.normalize();
    spinSpeed = Math.min(speed * 14, 18);
    scored = false;
    phase = 'flying';
    overlay.textContent = 'Shooting...';
  }

  renderer.domElement.addEventListener('pointerdown', function(e){ onDown(e.clientX, e.clientY); e.preventDefault(); });
  renderer.domElement.addEventListener('pointermove', function(e){ onMove(e.clientX, e.clientY); });
  window.addEventListener('pointerup', onUp);

  // Approximate ring-collision: the ball touching the rim's tube (not cleanly inside or
  // outside it) reflects its horizontal velocity outward/inward -- a real "rattles off the
  // rim" feel without full torus-sphere physics.
  function checkRimCollision(){
    var dx = ball.position.x - rim.position.x, dz = ball.position.z - rim.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (Math.abs(ball.position.y - hoopHeight) < 0.18 && dist > rimRadius - ballRadius * 0.6 && dist < rimRadius + ballRadius * 0.6) {
      var nx = dx / (dist || 1), nz = dz / (dist || 1);
      var vn = velocity.x * nx + velocity.z * nz;
      velocity.x -= 2 * vn * nx * 0.6;
      velocity.z -= 2 * vn * nz * 0.6;
      velocity.y *= 0.7;
    }
  }

  function checkBackboardCollision(){
    var boardZ = backboard.position.z + 0.03;
    if (velocity.z < 0 && ball.position.z <= boardZ && ball.position.z > boardZ - 0.3 &&
        Math.abs(ball.position.x) < 0.85 && Math.abs(ball.position.y - backboard.position.y) < 0.5) {
      velocity.z *= -0.45;
      ball.position.z = boardZ + 0.05;
    }
  }

  // Scoring: the ball must cross the rim's y-plane while descending AND pass within the
  // net's (smaller than the rim's) radius -- through it, not just near it.
  function checkScore(){
    if (scored) return;
    var dx = ball.position.x - rim.position.x, dz = ball.position.z - rim.position.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (prevY > hoopHeight && ball.position.y <= hoopHeight && dist < rimRadius - ballRadius * 0.4 && velocity.y < 0) {
      scored = true;
      score += 1;
      overlay.textContent = 'Score: ' + score;
      wobbleT = 1;
    }
  }

  var lastTime = performance.now();
  function animate(now){
    var dt = Math.min(0.032, (now - lastTime) / 1000);
    lastTime = now;

    if (phase === 'flying') {
      prevY = ball.position.y;
      velocity.y -= GRAVITY * dt;
      ball.position.x += velocity.x * dt;
      ball.position.y += velocity.y * dt;
      ball.position.z += velocity.z * dt;
      ball.rotateOnWorldAxis(spinAxis, spinSpeed * dt);

      checkBackboardCollision();
      checkRimCollision();
      checkScore();

      if (ball.position.y < ballRadius || ball.position.z > 6 || Math.abs(ball.position.x) > 5) {
        phase = 'reset';
        setTimeout(resetBall, scored ? 550 : 250);
      }
    }

    if (wobbleT > 0) {
      wobbleT = Math.max(0, wobbleT - dt * 2);
      netGroup.scale.set(1 + wobbleT * 0.15, 1 - wobbleT * 0.1, 1 + wobbleT * 0.15);
    } else {
      netGroup.scale.set(1, 1, 1);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  })();</script>`;
}

function renderGameHtml(el: GameElement, base: string, slug: string): string {
  const bodyId = `game-${el.id}-body`;
  // Scopes real-time matchmaking to this exact game element on this exact published site --
  // two visitors are only ever matched if they're both looking at the same game.
  const lobbyId = `${slug}-${el.id}`;
  const titleHtml = el.title
    ? `<div style="font-weight:800;font-size:14px;color:#0F172A;text-align:center;margin-bottom:6px;">${escapeHtml(el.title)}</div>`
    : '';
  let gameScript = '';
  switch (el.kind) {
    case 'tictactoe':
      gameScript = ticTacToeScript(bodyId, lobbyId);
      break;
    case 'connect4':
      gameScript = connectFourScript(bodyId, lobbyId);
      break;
    case 'rps':
      gameScript = rpsScript(bodyId, lobbyId);
      break;
    case 'clicker':
      gameScript = clickerScript(bodyId, el.clickerLabel, el.clickerTarget);
      break;
    case 'memory':
      gameScript = memoryScript(bodyId, el.memorySymbols);
      break;
    case 'trivia':
      gameScript = triviaScript(bodyId, el.questions);
      break;
    case 'simon':
      gameScript = simonScript(bodyId);
      break;
    case 'flappy':
      gameScript = flappyScript(bodyId);
      break;
    case 'tetris':
      gameScript = tetrisScript(bodyId);
      break;
    case 'targetrange3d':
      gameScript = targetRange3DScript(bodyId);
      break;
    case 'basketball':
      gameScript = basketballScript(bodyId);
      break;
  }
  return `<div id="el-${el.id}" style="${base}background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;font-family:-apple-system,sans-serif;padding:8px;display:flex;flex-direction:column;box-sizing:border-box;">
  ${titleHtml}
  <div id="${bodyId}" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;overflow:auto;"></div>
</div>
${gameScript}`;
}

// Each widget kind gets its own real color identity (gradient card background, accent for
// key numbers/buttons, an emoji badge) instead of one flat white card for every kind --
// mirrors the same WIDGET_THEME applied in the editor's WidgetView.tsx.
const WIDGET_THEME: Record<WidgetElement['kind'], { accent: string; soft: string; gradientFrom: string; gradientTo: string; emoji: string }> = {
  clock: { accent: '#4338CA', soft: '#E0E7FF', gradientFrom: '#EEF2FF', gradientTo: '#E0E7FF', emoji: '🕐' },
  countdown: { accent: '#EA580C', soft: '#FFEDD5', gradientFrom: '#FFF7ED', gradientTo: '#FFEDD5', emoji: '⏳' },
  stopwatch: { accent: '#0D9488', soft: '#CCFBF1', gradientFrom: '#F0FDFA', gradientTo: '#CCFBF1', emoji: '⏱️' },
  calculator: { accent: '#7C3AED', soft: '#EDE9FE', gradientFrom: '#F5F3FF', gradientTo: '#EDE9FE', emoji: '🧮' },
  unitconverter: { accent: '#0284C7', soft: '#E0F2FE', gradientFrom: '#F0F9FF', gradientTo: '#E0F2FE', emoji: '🔄' },
};

function widgetCardStyle(kind: WidgetElement['kind']): string {
  const t = WIDGET_THEME[kind];
  return `background:linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo});border-radius:16px;border:1px solid ${t.soft};overflow:hidden;font-family:-apple-system,sans-serif;padding:10px;box-sizing:border-box;`;
}

function widgetTitleHtml(title: string, kind: WidgetElement['kind']): string {
  if (!title) return '';
  const t = WIDGET_THEME[kind];
  return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:6px;">
  <div style="width:20px;height:20px;border-radius:10px;background:${t.accent};display:flex;align-items:center;justify-content:center;font-size:11px;">${t.emoji}</div>
  <div style="font-weight:800;font-size:14px;color:#0F172A;">${escapeHtml(title)}</div>
</div>`;
}

// A real, always-live utility -- ticks every second in the visitor's own browser via
// setInterval + Intl.DateTimeFormat (correct per-timezone/DST handling for free, no manual
// offset math), never a static image of a clock face. Purely client-side, no backend
// dependency at all -- the simplest of the AI-generatable real elements to keep genuinely
// live. Mirrors the editor's WidgetView.tsx (src/components/canvas/WidgetView.tsx).
function renderClockWidgetHtml(el: WidgetElement, base: string): string {
  const timezones = el.timezones.length > 0 ? el.timezones : [{ label: 'Local Time', ianaTimezone: 'UTC' }];
  const titleHtml = widgetTitleHtml(el.title, 'clock');
  const accent = WIDGET_THEME.clock.accent;

  if (el.style === 'analog') {
    const size = timezones.length > 1 ? 64 : 84;
    const hourLen = size * 0.26;
    const minLen = size * 0.36;
    const secLen = size * 0.4;
    const facesHtml = timezones
      .map((tz, i) => {
        const faceId = `clock-face-${el.id}-${i}`;
        return `<div style="display:flex;flex-direction:column;align-items:center;">
  <div style="position:relative;width:${size}px;height:${size}px;border-radius:${size / 2}px;border:2px solid ${accent};background:#fff;">
    <div id="${faceId}-hour" style="position:absolute;left:${size / 2 - 1.5}px;top:${size / 2 - hourLen}px;width:3px;height:${hourLen}px;background:${accent};border-radius:2px;transform-origin:1.5px ${hourLen}px;"></div>
    <div id="${faceId}-min" style="position:absolute;left:${size / 2 - 1}px;top:${size / 2 - minLen}px;width:2px;height:${minLen}px;background:${accent};border-radius:2px;transform-origin:1px ${minLen}px;"></div>
    <div id="${faceId}-sec" style="position:absolute;left:${size / 2 - 0.5}px;top:${size / 2 - secLen}px;width:1px;height:${secLen}px;background:#DC2626;transform-origin:0.5px ${secLen}px;"></div>
    <div style="position:absolute;left:${size / 2 - 3}px;top:${size / 2 - 3}px;width:6px;height:6px;border-radius:3px;background:${accent};"></div>
  </div>
  <div style="font-size:10px;color:#64748B;font-weight:600;margin-top:4px;">${escapeHtml(tz.label)}</div>
</div>`;
      })
      .join('');

    const script = `<script>(function(){
  var zones = ${JSON.stringify(timezones.map((tz) => tz.ianaTimezone))};
  var ids = ${JSON.stringify(timezones.map((_, i) => `clock-face-${el.id}-${i}`))};
  function tick(){
    var now = new Date();
    ids.forEach(function(id, i){
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: zones[i], hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(now);
        var get = function(t){ var found = parts.filter(function(x){ return x.type === t; })[0]; return found ? parseInt(found.value, 10) : 0; };
        var h = get('hour') % 12, m = get('minute'), s = get('second');
        var hourEl = document.getElementById(id + '-hour');
        var minEl = document.getElementById(id + '-min');
        var secEl = document.getElementById(id + '-sec');
        if (hourEl) hourEl.style.transform = 'rotate(' + ((h + m / 60) * 30) + 'deg)';
        if (minEl) minEl.style.transform = 'rotate(' + ((m + s / 60) * 6) + 'deg)';
        if (secEl) secEl.style.transform = 'rotate(' + (s * 6) + 'deg)';
      } catch (e) {}
    });
  }
  tick();
  setInterval(tick, 1000);
})();</script>`;

    return `<div id="el-${el.id}" style="${base}${widgetCardStyle('clock')}display:flex;flex-direction:column;align-items:center;justify-content:center;">
  ${titleHtml}
  <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;align-items:center;">
    ${facesHtml}
  </div>
</div>
${script}`;
  }

  const digitalRows = timezones
    .map(
      (tz, i) => `<div style="text-align:center;">
  <div style="font-size:11px;color:#64748B;font-weight:600;">${escapeHtml(tz.label)}</div>
  <div id="clock-readout-${el.id}-${i}" style="font-size:18px;color:${accent};font-weight:800;">--:--:--</div>
</div>`
    )
    .join('');

  const digitalScript = `<script>(function(){
  var zones = ${JSON.stringify(timezones.map((tz) => tz.ianaTimezone))};
  var ids = ${JSON.stringify(timezones.map((_, i) => `clock-readout-${el.id}-${i}`))};
  function tick(){
    var now = new Date();
    ids.forEach(function(id, i){
      var target = document.getElementById(id);
      if (!target) return;
      try {
        target.textContent = new Intl.DateTimeFormat('en-US', { timeZone: zones[i], hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
      } catch (e) { target.textContent = '--:--:--'; }
    });
  }
  tick();
  setInterval(tick, 1000);
})();</script>`;

  return `<div id="el-${el.id}" style="${base}${widgetCardStyle('clock')}display:flex;flex-direction:column;align-items:center;justify-content:center;">
  ${titleHtml}
  <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:center;">
    ${digitalRows}
  </div>
</div>
${digitalScript}`;
}

// A real, live countdown to a real ISO timestamp -- recomputed from Date.now() every
// second in the visitor's browser, never a static "time remaining" snapshot baked in at
// publish time. Mirrors CountdownWidget in WidgetView.tsx.
function renderCountdownWidgetHtml(el: WidgetElement, base: string): string {
  const theme = WIDGET_THEME.countdown;
  const activeId = `cd-${el.id}-active`;
  const doneId = `cd-${el.id}-done`;
  const unit = (id: string, label: string) => `<div style="display:flex;flex-direction:column;align-items:center;margin:0 5px;">
  <div id="${id}" style="font-size:26px;font-weight:800;color:#fff;background:${theme.accent};border-radius:8px;padding:2px 10px;">00</div>
  <div style="font-size:10px;color:${theme.accent};font-weight:700;margin-top:3px;">${label}</div>
</div>`;

  const script = `<script>(function(){
  var target = new Date(${JSON.stringify(el.countdownTargetIso)}).getTime();
  var activeEl = document.getElementById(${JSON.stringify(activeId)});
  var doneEl = document.getElementById(${JSON.stringify(doneId)});
  var daysEl = document.getElementById(${JSON.stringify(`cd-${el.id}-days`)});
  var hoursEl = document.getElementById(${JSON.stringify(`cd-${el.id}-hours`)});
  var minEl = document.getElementById(${JSON.stringify(`cd-${el.id}-min`)});
  var secEl = document.getElementById(${JSON.stringify(`cd-${el.id}-sec`)});
  function pad(n){ n = Math.max(0, n); return (n < 10 ? '0' : '') + n; }
  function tick(){
    var remaining = target - Date.now();
    if (!isFinite(target) || remaining <= 0) {
      if (activeEl) activeEl.style.display = 'none';
      if (doneEl) doneEl.style.display = 'block';
      return;
    }
    var totalSeconds = Math.floor(remaining / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (daysEl) daysEl.textContent = pad(days);
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minEl) minEl.textContent = pad(minutes);
    if (secEl) secEl.textContent = pad(seconds);
  }
  tick();
  setInterval(tick, 1000);
})();</script>`;

  return `<div id="el-${el.id}" style="${base}${widgetCardStyle('countdown')}display:flex;flex-direction:column;align-items:center;justify-content:center;">
  ${widgetTitleHtml(el.title, 'countdown')}
  ${el.countdownLabel ? `<div style="font-size:12px;color:#64748B;font-weight:600;margin-bottom:4px;">${escapeHtml(el.countdownLabel)}</div>` : ''}
  <div id="${activeId}" style="display:flex;">
    ${unit(`cd-${el.id}-days`, 'DAYS')}
    ${unit(`cd-${el.id}-hours`, 'HRS')}
    ${unit(`cd-${el.id}-min`, 'MIN')}
    ${unit(`cd-${el.id}-sec`, 'SEC')}
  </div>
  <div id="${doneId}" style="display:none;font-size:20px;font-weight:800;color:#16A34A;">It's here!</div>
</div>
${script}`;
}

// A real interactive start/pause/lap/reset stopwatch -- elapsed time is computed from real
// Date.now() deltas (correct even if the tab is backgrounded and timers throttle), not a
// naive tick counter. Mirrors StopwatchWidget in WidgetView.tsx.
function renderStopwatchWidgetHtml(el: WidgetElement, base: string): string {
  const displayId = `sw-${el.id}-display`;
  const toggleId = `sw-${el.id}-toggle`;
  const lapId = `sw-${el.id}-lap`;
  const resetId = `sw-${el.id}-reset`;
  const lapsId = `sw-${el.id}-laps`;

  const script = `<script>(function(){
  var running = false, elapsedMs = 0, startTs = 0, laps = [], intervalId = null;
  var displayEl = document.getElementById(${JSON.stringify(displayId)});
  var toggleBtn = document.getElementById(${JSON.stringify(toggleId)});
  var lapBtn = document.getElementById(${JSON.stringify(lapId)});
  var resetBtn = document.getElementById(${JSON.stringify(resetId)});
  var lapsEl = document.getElementById(${JSON.stringify(lapsId)});
  function pad(n){ n = String(n); while (n.length < 2) n = '0' + n; return n; }
  function fmt(ms){
    var totalCs = Math.floor(ms / 10);
    var cs = totalCs % 100;
    var totalS = Math.floor(totalCs / 100);
    var s = totalS % 60;
    var m = Math.floor(totalS / 60);
    return pad(m) + ':' + pad(s) + '.' + pad(cs);
  }
  function render(){ if (displayEl) displayEl.textContent = fmt(elapsedMs); }
  function tick(){ elapsedMs = Date.now() - startTs; render(); }
  function toggle(){
    if (running) {
      running = false;
      if (intervalId) clearInterval(intervalId);
      if (toggleBtn) { toggleBtn.textContent = 'Start'; toggleBtn.style.background = '#16A34A'; }
    } else {
      startTs = Date.now() - elapsedMs;
      running = true;
      intervalId = setInterval(tick, 50);
      if (toggleBtn) { toggleBtn.textContent = 'Pause'; toggleBtn.style.background = '#DC2626'; }
    }
  }
  function reset(){
    running = false;
    if (intervalId) clearInterval(intervalId);
    elapsedMs = 0; laps = [];
    render();
    if (lapsEl) lapsEl.innerHTML = '';
    if (toggleBtn) { toggleBtn.textContent = 'Start'; toggleBtn.style.background = '#16A34A'; }
  }
  function lap(){
    if (!running) return;
    laps.unshift(elapsedMs);
    laps = laps.slice(0, 5);
    if (lapsEl) lapsEl.innerHTML = laps.map(function(l, i){ return 'Lap ' + (laps.length - i) + ': ' + fmt(l); }).join('<br>');
  }
  if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  if (lapBtn) lapBtn.addEventListener('click', lap);
  if (resetBtn) resetBtn.addEventListener('click', reset);
  render();
})();</script>`;

  const theme = WIDGET_THEME.stopwatch;
  const btnStyle = 'padding:8px 14px;border-radius:8px;border:none;font-weight:700;font-size:14px;cursor:pointer;';
  return `<div id="el-${el.id}" style="${base}${widgetCardStyle('stopwatch')}display:flex;flex-direction:column;align-items:center;justify-content:center;">
  ${widgetTitleHtml(el.title, 'stopwatch')}
  <div id="${displayId}" style="font-size:28px;font-weight:800;color:${theme.accent};font-variant-numeric:tabular-nums;">00:00.00</div>
  <div style="display:flex;gap:8px;margin-top:8px;">
    <button id="${toggleId}" style="${btnStyle}background:#16A34A;color:#FFFFFF;">Start</button>
    <button id="${lapId}" style="${btnStyle}background:${theme.soft};color:${theme.accent};">Lap</button>
    <button id="${resetId}" style="${btnStyle}background:${theme.soft};color:${theme.accent};">Reset</button>
  </div>
  <div id="${lapsId}" style="margin-top:8px;font-size:11px;color:#64748B;text-align:center;"></div>
</div>
${script}`;
}

const WIDGET_CALC_ROWS: string[][] = [
  ['C', '⌫', '±', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

// A real working four-function calculator -- genuine sequential arithmetic (7 + 3 × 2 = 20,
// classic running-total chaining, not a full-expression parser), not a picture of a
// calculator. Mirrors CalculatorWidget in WidgetView.tsx.
function renderCalculatorWidgetHtml(el: WidgetElement, base: string): string {
  const theme = WIDGET_THEME.calculator;
  const wrapId = `calc-wrap-${el.id}`;
  const displayId = `calc-display-${el.id}`;

  const rowsHtml = WIDGET_CALC_ROWS.map(
    (row) => `<div style="display:flex;gap:6px;margin-bottom:6px;">
    ${row
      .map((label) => {
        const isEquals = label === '=';
        const isOperator = ['+', '-', '×', '÷'].includes(label);
        const bg = isEquals ? theme.accent : isOperator ? theme.soft : '#F1F5F9';
        const color = isEquals ? '#FFFFFF' : isOperator ? theme.accent : '#0F172A';
        return `<button data-label="${escapeAttr(label)}" style="flex:1;height:34px;border-radius:8px;border:none;background:${bg};color:${color};font-weight:700;font-size:15px;cursor:pointer;">${escapeHtml(label)}</button>`;
      })
      .join('')}
  </div>`
  ).join('');

  const script = `<script>(function(){
  var display = '0', stored = null, operator = null, overwrite = false;
  var displayEl = document.getElementById(${JSON.stringify(displayId)});
  function render(){ if (displayEl) displayEl.textContent = display; }
  function computeCalc(a, op, b){
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '×') return a * b;
    if (op === '÷') return b === 0 ? NaN : a / b;
    return b;
  }
  function formatResult(n){
    if (!isFinite(n)) return 'Error';
    return String(Math.round(n * 1e8) / 1e8);
  }
  function press(label){
    if (/^[0-9]$/.test(label)) {
      display = (overwrite || display === '0') ? label : (display.length < 12 ? display + label : display);
      overwrite = false;
      render();
      return;
    }
    if (label === '.') {
      display = overwrite ? '0.' : (display.indexOf('.') === -1 ? display + '.' : display);
      overwrite = false;
      render();
      return;
    }
    if (label === 'C') {
      display = '0'; stored = null; operator = null; overwrite = false;
      render();
      return;
    }
    if (label === '⌫') {
      display = display.length > 1 ? display.slice(0, -1) : '0';
      render();
      return;
    }
    if (label === '±') {
      display = display.charAt(0) === '-' ? display.slice(1) : (display === '0' ? display : '-' + display);
      render();
      return;
    }
    if (label === '=') {
      if (operator !== null && stored !== null) {
        display = formatResult(computeCalc(stored, operator, Number(display)));
        stored = null; operator = null; overwrite = true;
      }
      render();
      return;
    }
    if (stored !== null && operator !== null) {
      display = formatResult(computeCalc(stored, operator, Number(display)));
    }
    stored = Number(display);
    operator = label;
    overwrite = true;
    render();
  }
  var buttons = document.querySelectorAll('#${wrapId} button');
  for (var i = 0; i < buttons.length; i++) {
    (function(btn){
      btn.addEventListener('click', function(){ press(btn.getAttribute('data-label')); });
    })(buttons[i]);
  }
})();</script>`;

  return `<div id="el-${el.id}" style="${base}${widgetCardStyle('calculator')}display:flex;flex-direction:column;align-items:stretch;justify-content:center;overflow-y:auto;">
  ${widgetTitleHtml(el.title, 'calculator')}
  <div id="${wrapId}">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;padding:0 4px;">
      <div id="${displayId}" style="font-size:26px;font-weight:700;color:${theme.accent};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">0</div>
    </div>
    ${rowsHtml}
  </div>
</div>
${script}`;
}

const WIDGET_UNIT_OPTIONS_JSON = JSON.stringify({
  length: [
    { key: 'mm', label: 'mm' },
    { key: 'cm', label: 'cm' },
    { key: 'm', label: 'm' },
    { key: 'km', label: 'km' },
    { key: 'in', label: 'in' },
    { key: 'ft', label: 'ft' },
    { key: 'yd', label: 'yd' },
    { key: 'mi', label: 'mi' },
  ],
  weight: [
    { key: 'mg', label: 'mg' },
    { key: 'g', label: 'g' },
    { key: 'kg', label: 'kg' },
    { key: 'oz', label: 'oz' },
    { key: 'lb', label: 'lb' },
    { key: 'st', label: 'st' },
  ],
  volume: [
    { key: 'ml', label: 'mL' },
    { key: 'l', label: 'L' },
    { key: 'tsp', label: 'tsp' },
    { key: 'tbsp', label: 'tbsp' },
    { key: 'floz', label: 'fl oz' },
    { key: 'cup', label: 'cup' },
    { key: 'qt', label: 'qt' },
    { key: 'gal', label: 'gal' },
  ],
  temperature: [
    { key: 'c', label: '°C' },
    { key: 'f', label: '°F' },
    { key: 'k', label: 'K' },
  ],
});

// A real working unit converter (length/weight/temperature/volume) with live-recomputed
// results as the visitor types or switches units -- real conversion factors (and real
// affine Celsius/Fahrenheit/Kelvin formulas for temperature), not a static chart. Mirrors
// UnitConverterWidget in WidgetView.tsx.
function renderUnitConverterWidgetHtml(el: WidgetElement, base: string): string {
  const theme = WIDGET_THEME.unitconverter;
  const catId = `uc-${el.id}-categories`;
  const inputId = `uc-${el.id}-input`;
  const fromId = `uc-${el.id}-from`;
  const toId = `uc-${el.id}-to`;
  const resultId = `uc-${el.id}-result`;
  const swapId = `uc-${el.id}-swap`;

  const script = `<script>(function(){
  var UNIT_OPTIONS = ${WIDGET_UNIT_OPTIONS_JSON};
  var LENGTH_FACTORS = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
  var WEIGHT_FACTORS = { mg: 0.000001, g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 };
  var VOLUME_FACTORS = { ml: 0.001, l: 1, tsp: 0.00492892, tbsp: 0.0147868, floz: 0.0295735, cup: 0.236588, qt: 0.946353, gal: 3.78541 };
  var CATEGORIES = [{ key: 'length', label: 'Length' }, { key: 'weight', label: 'Weight' }, { key: 'temperature', label: 'Temp' }, { key: 'volume', label: 'Volume' }];
  function celsiusFrom(value, unit){ if (unit === 'f') return (value - 32) * 5 / 9; if (unit === 'k') return value - 273.15; return value; }
  function celsiusTo(celsius, unit){ if (unit === 'f') return celsius * 9 / 5 + 32; if (unit === 'k') return celsius + 273.15; return celsius; }
  function convert(category, value, fromKey, toKey){
    if (category === 'temperature') return celsiusTo(celsiusFrom(value, fromKey), toKey);
    var table = category === 'length' ? LENGTH_FACTORS : category === 'weight' ? WEIGHT_FACTORS : VOLUME_FACTORS;
    var base = value * (table[fromKey] || 1);
    return base / (table[toKey] || 1);
  }
  var category = 'length';
  var fromUnit = UNIT_OPTIONS[category][0].key;
  var toUnit = UNIT_OPTIONS[category][1] ? UNIT_OPTIONS[category][1].key : UNIT_OPTIONS[category][0].key;
  var inputEl = document.getElementById(${JSON.stringify(inputId)});
  var resultEl = document.getElementById(${JSON.stringify(resultId)});
  var fromContainer = document.getElementById(${JSON.stringify(fromId)});
  var toContainer = document.getElementById(${JSON.stringify(toId)});
  var catContainer = document.getElementById(${JSON.stringify(catId)});
  var swapBtn = document.getElementById(${JSON.stringify(swapId)});
  function chipStyle(active){
    return 'padding:5px 9px;border-radius:999px;background:' + (active ? ${JSON.stringify(theme.accent)} : '#F1F5F9') + ';color:' + (active ? '#FFFFFF' : '#0F172A') + ';font-weight:700;font-size:11px;margin:0 6px 6px 0;border:none;cursor:pointer;';
  }
  function renderChips(container, options, activeKey, onPick){
    if (!container) return;
    container.innerHTML = '';
    options.forEach(function(opt){
      var btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.setAttribute('style', chipStyle(opt.key === activeKey));
      btn.addEventListener('click', function(){ onPick(opt.key); });
      container.appendChild(btn);
    });
  }
  function renderCategoryChips(){
    renderChips(catContainer, CATEGORIES, category, function(key){
      category = key;
      fromUnit = UNIT_OPTIONS[category][0].key;
      toUnit = UNIT_OPTIONS[category][1] ? UNIT_OPTIONS[category][1].key : UNIT_OPTIONS[category][0].key;
      renderCategoryChips();
      renderUnitChips();
      recompute();
    });
  }
  function renderUnitChips(){
    renderChips(fromContainer, UNIT_OPTIONS[category], fromUnit, function(key){ fromUnit = key; renderUnitChips(); recompute(); });
    renderChips(toContainer, UNIT_OPTIONS[category], toUnit, function(key){ toUnit = key; renderUnitChips(); recompute(); });
  }
  function recompute(){
    var value = parseFloat(inputEl ? inputEl.value : '');
    if (!isFinite(value)) { if (resultEl) resultEl.textContent = '--'; return; }
    var result = convert(category, value, fromUnit, toUnit);
    if (resultEl) resultEl.textContent = isFinite(result) ? String(Math.round(result * 1e6) / 1e6) : '--';
  }
  if (inputEl) inputEl.addEventListener('input', recompute);
  if (swapBtn) swapBtn.addEventListener('click', function(){ var tmp = fromUnit; fromUnit = toUnit; toUnit = tmp; renderUnitChips(); recompute(); });
  renderCategoryChips();
  renderUnitChips();
  recompute();
})();</script>`;

  return `<div id="el-${el.id}" style="${base}${widgetCardStyle('unitconverter')}display:flex;flex-direction:column;align-items:stretch;justify-content:center;overflow-y:auto;">
  ${widgetTitleHtml(el.title, 'unitconverter')}
  <div id="${catId}" style="display:flex;flex-wrap:wrap;"></div>
  <div style="display:flex;align-items:center;margin-top:4px;gap:8px;">
    <input id="${inputId}" type="number" value="1" style="flex:1;border:1px solid ${theme.soft};border-radius:8px;padding:8px 10px;font-size:15px;color:#0F172A;box-sizing:border-box;" />
    <div id="${fromId}" style="display:flex;flex-wrap:wrap;flex:1;"></div>
  </div>
  <button id="${swapId}" style="align-self:center;background:none;border:none;cursor:pointer;display:block;margin:4px auto;font-size:16px;color:${theme.accent};">&#8645;</button>
  <div style="display:flex;align-items:center;gap:8px;">
    <div style="flex:1;border:1px solid ${theme.soft};border-radius:8px;padding:8px 10px;background:${theme.soft};box-sizing:border-box;">
      <div id="${resultId}" style="font-size:15px;font-weight:800;color:${theme.accent};">1</div>
    </div>
    <div id="${toId}" style="display:flex;flex-wrap:wrap;flex:1;"></div>
  </div>
</div>
${script}`;
}

// A genuinely bespoke, AI-written interactive widget -- real HTML/CSS/JS the model wrote
// for exactly what the user described (a game, calculator, tool, whatever didn't fit any
// of the hand-built element kinds above). Runs inside a sandboxed iframe via srcdoc rather
// than being injected straight into the page: sandbox="allow-scripts allow-forms" grants
// only what an interactive widget genuinely needs, while deliberately omitting
// allow-same-origin/allow-top-navigation/allow-popups -- the generated code can never read
// this page's cookies/localStorage, navigate the parent page away, or spawn popups. That's
// the real safety boundary that makes "run whatever the AI wrote" safe to publish at all.
function renderCustomWidgetHtml(el: CustomWidgetElement, base: string): string {
  const accent = '#7C3AED';
  const soft = '#EDE9FE';
  const titleHtml = el.title
    ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
  <div style="width:20px;height:20px;border-radius:10px;background:${accent};display:flex;align-items:center;justify-content:center;font-size:11px;">✨</div>
  <div style="font-weight:800;font-size:14px;color:#0F172A;">${escapeHtml(el.title)}</div>
</div>`
    : '';
  if (!el.code) {
    // Generation failed for this section -- layout.ts already falls back to plain
    // headline/body text for the AI-builder path, but a manually-added widget that was
    // never successfully generated (or whose generation is still running) needs its own
    // real placeholder rather than an empty gap in the page.
    return `<div id="el-${el.id}" style="${base}background:linear-gradient(135deg,#F5F3FF,${soft});border-radius:16px;border:1px solid ${soft};display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:${accent};font-size:13px;font-weight:600;text-align:center;padding:12px;box-sizing:border-box;">${
      el.generating ? 'Building your custom feature…' : 'This feature isn’t available right now'
    }</div>`;
  }
  return `<div id="el-${el.id}" style="${base}background:linear-gradient(135deg,#F5F3FF,${soft});border-radius:16px;border:1px solid ${soft};overflow:hidden;font-family:-apple-system,sans-serif;padding:10px;box-sizing:border-box;display:flex;flex-direction:column;">
  ${titleHtml}
  <iframe srcdoc="${escapeAttr(el.code)}" sandbox="allow-scripts allow-forms" style="flex:1;width:100%;border:0;border-radius:10px;background:#FFFFFF;"></iframe>
</div>`;
}

function renderWidgetHtml(el: WidgetElement, base: string): string {
  if (el.kind === 'countdown') return renderCountdownWidgetHtml(el, base);
  if (el.kind === 'stopwatch') return renderStopwatchWidgetHtml(el, base);
  if (el.kind === 'calculator') return renderCalculatorWidgetHtml(el, base);
  if (el.kind === 'unitconverter') return renderUnitConverterWidgetHtml(el, base);
  return renderClockWidgetHtml(el, base);
}

function renderElement(el: CanvasElement, slug: string, productStockUrl: string, allElements: CanvasElement[], products: Record<string, CatalogProduct>, currency = 'usd', isSingleProductPage = false): string {
  const sym = currencySymbol(currency);
  const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;`;
  switch (el.type) {
    case 'text': {
      const font = getFontOption(el.fontFamily);
      const fontFamilyCss = font.id !== 'system' ? `font-family:'${font.family}',sans-serif;` : '';
      return `<div style="${base}color:${escapeAttr(el.color)};font-size:${el.fontSize}px;font-weight:${
        el.fontWeight === 'bold' ? '700' : '400'
      };text-align:${el.align};white-space:pre-wrap;${fontFamilyCss}">${escapeHtml(el.text)}</div>`;
    }
    case 'image':
      return el.uri
        ? `<img src="${escapeAttr(el.uri)}" style="${base}object-fit:cover;" />`
        : '';
    case 'shape':
      return renderShape(el);
    case 'button': {
      const buttonBackground = el.backgroundGradient ? cssGradient(el.backgroundGradient) : escapeAttr(el.backgroundColor);
      const buttonStyle = `${base}background:${buttonBackground};color:${escapeAttr(
        el.textColor
      )};border-radius:${el.borderRadius}px;${
        el.borderWidth ? `border:${el.borderWidth}px solid ${escapeAttr(el.borderColor ?? '#000000')};` : ''
      }display:flex;align-items:center;justify-content:center;font-weight:700;text-decoration:none;box-sizing:border-box;`;
      // A linked Product/Collection takes priority over a raw URL (the inspector already
      // keeps them mutually exclusive) -- jumps to that element's own real card further down
      // the same page via its id="el-{id}" (see the 'product'/'collection' cases below),
      // rather than duplicating that element's info here. Only a real, non-empty link/target
      // renders as a clickable <a> -- a button with nothing set stays a plain div, exactly as
      // before this field existed, instead of a dead link that goes nowhere or reloads the page.
      const href = el.linkTargetElementId ? `#el-${el.linkTargetElementId}` : el.link?.trim() ? safeUrl(el.link) : null;
      return href
        ? `<a href="${escapeAttr(href)}" style="${buttonStyle}">${escapeHtml(el.label)}</a>`
        : `<div style="${buttonStyle}">${escapeHtml(el.label)}</div>`;
    }
    case 'icon':
      return renderIcon(el);
    case 'slideshow': {
      const id = `slideshow-${el.id}`;
      const images = el.images
        .map(
          (uri, i) =>
            `<img src="${escapeAttr(uri)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:${
              i === 0 ? 1 : 0
            };transition:opacity 0.6s;" data-slide />`
        )
        .join('');
      const script = el.autoPlay && el.images.length > 1
        ? `<script>(function(){var c=document.getElementById(${JSON.stringify(id)});if(!c)return;var slides=c.querySelectorAll('[data-slide]');var i=0;setInterval(function(){slides[i].style.opacity=0;i=(i+1)%slides.length;slides[i].style.opacity=1;},${el.intervalMs});})();</script>`
        : '';
      return `<div id="${id}" style="${base}overflow:hidden;">${images}</div>${script}`;
    }
    case 'video': {
      if (!el.uri) return '';
      const videoId = `video-${el.id}`;
      const audioId = `video-audio-${el.id}`;
      const playBtnId = `video-play-${el.id}`;
      const muteBtnId = `video-mute-${el.id}`;
      const trimStartSec = el.trimStartMs / 1000;
      const trimEndSec = el.trimEndMs != null ? el.trimEndMs / 1000 : null;
      // Autoplay only ever works muted (every browser enforces this) -- forcing it here keeps
      // the initial markup honest about what will actually play instead of silently failing.
      const initiallyMuted = el.autoPlay || el.muted;
      const audioTag = el.audioUri
        ? `<audio id="${audioId}" src="${escapeAttr(el.audioUri)}" style="display:none;" ${
            el.audioVolume === 0 ? 'muted' : ''
          }></audio>`
        : '';
      // previewSeconds caps playback at trimStart+previewSeconds regardless of how it started
      // (autoplay or a visitor tapping play) -- a short preview loop instead of the whole clip.
      const naturalEndExpr = trimEndSec != null ? String(trimEndSec) : 'v.duration';
      const endExpr = el.previewSeconds != null ? `Math.min(${naturalEndExpr},${trimStartSec}+${el.previewSeconds})` : naturalEndExpr;
      const script = `<script>(function(){
  var v=document.getElementById(${JSON.stringify(videoId)});
  var a=document.getElementById(${JSON.stringify(audioId)});
  var playBtn=document.getElementById(${JSON.stringify(playBtnId)});
  var muteBtn=document.getElementById(${JSON.stringify(muteBtnId)});
  if(!v)return;
  if(a){a.volume=${el.audioVolume};}
  v.addEventListener('loadedmetadata',function(){v.currentTime=${trimStartSec};});
  v.addEventListener('play',function(){if(a){a.currentTime=0;a.play();}if(playBtn)playBtn.style.display='none';});
  v.addEventListener('pause',function(){if(a){a.pause();}if(playBtn)playBtn.style.display='flex';});
  v.addEventListener('timeupdate',function(){
    var end=${endExpr};
    if(end && v.currentTime>=end){
      if(${el.loop ? 'true' : 'false'}){v.currentTime=${trimStartSec};if(a){a.currentTime=0;}}
      else{v.pause();}
    }
  });
  if(playBtn){playBtn.addEventListener('click',function(){if(v.paused){v.play();}else{v.pause();}});}
  if(muteBtn){muteBtn.addEventListener('click',function(){
    v.muted=!v.muted;
    muteBtn.innerHTML=v.muted?${JSON.stringify(MUTE_ICON_SVG)}:${JSON.stringify(SOUND_ICON_SVG)};
  });}
})();</script>`;
      return `<div style="${base}overflow:hidden;background:#000;">
  <video id="${videoId}" src="${escapeAttr(el.uri)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" ${
        initiallyMuted ? 'muted' : ''
      } playsinline ${el.autoPlay ? 'autoplay' : ''}></video>
  <button type="button" id="${playBtnId}" aria-label="Play" style="position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;background:rgba(15,23,42,0.15);align-items:center;justify-content:center;cursor:pointer;display:${
        el.autoPlay ? 'none' : 'flex'
      };">${PLAY_ICON_SVG}</button>
  <button type="button" id="${muteBtnId}" aria-label="Mute" style="position:absolute;right:8px;bottom:8px;width:28px;height:28px;border-radius:14px;border:0;padding:0;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;cursor:pointer;">${
        initiallyMuted ? MUTE_ICON_SVG : SOUND_ICON_SVG
      }</button>
</div>${audioTag}${script}`;
    }
    case 'videoEmbed': {
      // A real, already-existing video (not one the site owner uploaded) -- played back
      // through the provider's own embed player rather than downloaded/re-hosted, which
      // its terms of service don't allow (see VideoEmbedElement's comment in types.ts).
      const src = `https://www.youtube.com/embed/${encodeURIComponent(el.videoId)}`;
      return `<iframe src="${escapeAttr(src)}" title="${escapeAttr(el.title || 'Video')}" style="${base}border:0;background:#000;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    }
    case 'product': {
      const product = resolveProduct(el, products);
      // A page whose only element is this product IS the product page -- a real Shopify-PDP
      // style full layout (bigger gallery, bigger type, untruncated description) instead of
      // the small catalog-grid card every other product still renders as. Mirrors the
      // editor's ProductPageView (ElementRenderer.tsx) so what a seller designs matches what
      // publishes. Still just scales up the same card, in whatever box the element itself
      // already occupies (see `base` above) -- not a new positioning system.
      const fullBleed = isSingleProductPage;
      const isService = product.saleType === 'service';
      const isDigital = product.saleType === 'digital';
      // A buyer must never land on a real checkout for a half-finished listing -- only
      // show a working buy button once the seller has actually filled in a name, a real
      // price, and at least one photo. Anything short of that renders the card (so the
      // seller can see it taking shape) but with the buy action disabled, and it updates
      // live the moment the missing pieces are filled in and republished.
      const isReady = !!product.name?.trim() && product.priceUsd > 0 && product.images.length > 0;
      const hasMultiplePhotos = product.images.length > 1;
      const lightboxVar = `siteSparkLightbox_${el.id}`;
      const galleryVar = `siteSparkGallery_${el.id}`;
      const galleryTrackId = `gallery-track-${el.id}`;
      const galleryWrapId = `gallery-wrap-${el.id}`;
      // A real, always-visible swipeable gallery on the card face itself -- not gated
      // behind a tap-to-open lightbox -- since a buyer should be able to see every angle of
      // the item without an extra step. Tapping any photo still opens the lightbox (below)
      // for a bigger view, starting at whichever photo was showing, not always the first.
      const galleryHeightPct = fullBleed ? '65%' : '55%';
      const imgTag =
        product.images.length > 0
          ? `<div id="${galleryWrapId}" style="position:relative;width:100%;height:${galleryHeightPct};overflow:hidden;">
  <div id="${galleryTrackId}" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;height:100%;">
    ${product.images
      .map(
        (uri, i) =>
          `<img src="${escapeAttr(uri)}" style="flex:0 0 100%;width:100%;height:100%;object-fit:cover;scroll-snap-align:center;${
            hasMultiplePhotos ? 'cursor:pointer;' : ''
          }" ${hasMultiplePhotos ? `onclick="${lightboxVar}.open(${i})"` : ''} />`
      )
      .join('')}
  </div>
  ${
    hasMultiplePhotos
      ? `<button aria-label="Previous photo" onclick="${galleryVar}.prev()" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);background:#00000066;color:#fff;border:none;border-radius:999px;width:26px;height:26px;font-size:14px;cursor:pointer;">&#8249;</button>
  <button aria-label="Next photo" onclick="${galleryVar}.next()" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:#00000066;color:#fff;border:none;border-radius:999px;width:26px;height:26px;font-size:14px;cursor:pointer;">&#8250;</button>
  <div style="position:absolute;bottom:6px;left:0;right:0;display:flex;justify-content:center;gap:5px;">
    ${product.images.map((_, i) => `<div data-gallery-dot style="width:6px;height:6px;border-radius:3px;background:${i === 0 ? '#fff' : '#ffffff80'};"></div>`).join('')}
  </div>`
      : ''
  }
</div>`
          : `<div style="width:100%;height:${galleryHeightPct};background:#F1F5F9;"></div>`;
      const galleryScript = hasMultiplePhotos
        ? `<script>(function(){
  var track=document.getElementById(${JSON.stringify(galleryTrackId)});
  var dots=document.querySelectorAll('#${galleryWrapId} [data-gallery-dot]');
  var count=${product.images.length};
  var i=0;
  function paint(){ Array.prototype.forEach.call(dots, function(d,idx){ d.style.background = idx===i ? '#fff' : '#ffffff80'; }); }
  function go(idx){ i=(idx+count)%count; track.scrollTo({ left: track.clientWidth*i, behavior:'smooth' }); paint(); }
  window[${JSON.stringify(galleryVar)}] = { prev: function(){ go(i-1); }, next: function(){ go(i+1); }, current: function(){ return i; } };
  track.addEventListener('scroll', function(){
    var idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (idx !== i) { i = idx; paint(); }
  });
})();</script>`
        : '';
      const qtyId = `qty-${el.id}`;
      const stockId = `stock-${el.id}`;
      const addBtnId = `addbtn-${el.id}`;
      const buyNowBtnId = `buynowbtn-${el.id}`;
      const priceId = `price-${el.id}`;
      const pickerId = `variantpicker-${el.id}`;
      const hasVariants = product.variantOptions.length > 0;
      const isCustom = product.saleType === 'custom';
      const buyMode: BuyButtonMode = product.buyButtonMode ?? 'cart';
      const showBuyNowBtn = buyMode === 'buyNow' || buyMode === 'both';
      const badge = isService
        ? `📅 Service booking${product.serviceDurationMinutes ? ` · ${product.serviceDurationMinutes} min` : ''}`
        : isDigital
          ? '💾 Instant download'
          : isCustom
            ? '✨ Custom item'
            : product.fulfillment === 'delivery'
              ? '📦 Delivery'
              : product.fulfillment === 'both'
                ? '📦 Delivery or pickup'
                : '🏬 Pickup';

      // Photo count is capped to 7 in the editor (see MAX_PRODUCT_IMAGES in
      // ElementInspector.tsx) -- the main card above only ever shows images[0], this
      // lightbox is the "with slide options" view for the rest.
      const lightbox = hasMultiplePhotos
        ? `<div id="lightbox-${el.id}" style="display:none;position:fixed;inset:0;z-index:9999;background:#000000E6;align-items:center;justify-content:center;flex-direction:column;">
  <button aria-label="Close" onclick="${lightboxVar}.close()" style="position:absolute;top:16px;right:16px;z-index:2;background:none;border:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;">&times;</button>
  <div style="position:relative;width:100%;max-width:520px;z-index:1;">
    <div id="lightbox-track-${el.id}" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;">
      ${product.images
        .map(
          (uri) =>
            `<img src="${escapeAttr(uri)}" style="flex:0 0 100%;width:100%;max-height:70vh;object-fit:contain;scroll-snap-align:center;" />`
        )
        .join('')}
    </div>
    <button aria-label="Previous photo" onclick="${lightboxVar}.prev()" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:#00000099;color:#fff;border:none;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer;">&#8249;</button>
    <button aria-label="Next photo" onclick="${lightboxVar}.next()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:#00000099;color:#fff;border:none;border-radius:999px;width:36px;height:36px;font-size:18px;cursor:pointer;">&#8250;</button>
  </div>
  <div style="display:flex;gap:6px;margin-top:14px;">
    ${product.images.map((_, i) => `<div data-dot style="width:7px;height:7px;border-radius:4px;background:${i === 0 ? '#fff' : '#6B7280'};"></div>`).join('')}
  </div>
</div>
<script>(function(){
  var el=document.getElementById('lightbox-${el.id}');
  var track=document.getElementById('lightbox-track-${el.id}');
  var dots=el.querySelectorAll('[data-dot]');
  var count=${product.images.length};
  var i=0;
  function paint(){ dots.forEach(function(d,idx){ d.style.background = idx===i ? '#fff' : '#6B7280'; }); }
  function go(idx){ i=(idx+count)%count; track.scrollTo({ left: track.clientWidth*i, behavior:'smooth' }); paint(); }
  window[${JSON.stringify(lightboxVar)}] = {
    // startAt lets the lightbox open on whichever photo the inline gallery was already
    // showing when tapped, instead of always jumping back to the first photo.
    open: function(startAt){ el.style.display='flex'; i = typeof startAt === 'number' ? (startAt+count)%count : 0; track.scrollTo({left: track.clientWidth*i}); paint(); },
    close: function(){ el.style.display='none'; },
    prev: function(){ go(i-1); },
    next: function(){ go(i+1); },
  };
})();</script>`
        : '';

      // Option/value swatches use data-attributes + addEventListener (not inline onclick)
      // so option names/values with quotes or other characters never risk breaking out of a
      // hand-built inline JS string -- the same convention used by the arcade games' buttons.
      const variantPicker = hasVariants
        ? `<div id="${pickerId}" style="margin-top:6px;">
  ${product.variantOptions
    .map(
      (opt) => `<div style="margin-bottom:6px;">
    <div style="font-size:10px;font-weight:700;color:#64748B;margin-bottom:4px;">${escapeHtml(opt.name)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${opt.values
        .map(
          (v) =>
            `<button type="button" data-opt="${escapeAttr(opt.name)}" data-val="${escapeAttr(v)}" style="border:1px solid #E2E8F0;background:#F1F5F9;color:#0F172A;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;">${escapeHtml(v)}</button>`
        )
        .join('')}
    </div>
  </div>`
    )
    .join('')}
</div>`
        : '';

      const nameId = `name-${el.id}`;
      const descId = `desc-${el.id}`;
      const script = isReady
        ? `<script>(function(){
  var productId = ${JSON.stringify(el.productId)};
  var baseName = ${JSON.stringify(product.name)};
  var basePriceUsd = ${product.priceUsd};
  var variantOptions = ${JSON.stringify(product.variantOptions)};
  var stockUrl = ${JSON.stringify(productStockUrl)} + '?slug=' + encodeURIComponent(${JSON.stringify(slug)}) + '&productId=' + encodeURIComponent(productId);
  var stockEl = document.getElementById(${JSON.stringify(stockId)});
  var qtyEl = document.getElementById(${JSON.stringify(qtyId)});
  var btnEl = document.getElementById(${JSON.stringify(addBtnId)});
  var buyNowBtnEl = document.getElementById(${JSON.stringify(buyNowBtnId)});
  var priceEl = document.getElementById(${JSON.stringify(priceId)});
  var pickerEl = document.getElementById(${JSON.stringify(pickerId)});
  var nameEl = document.getElementById(${JSON.stringify(nameId)});
  var descEl = document.getElementById(${JSON.stringify(descId)});
  var selected = {};
  var liveTop = null; // { trackInventory, stockQuantity, inStock, variants, name, description, images }

  function setState(text, color, disabled, cartBtnText, buyNowBtnText){
    if (stockEl) { stockEl.textContent = text; stockEl.style.color = color; }
    function applyBtn(btn, label){
      if (!btn) return;
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.5' : '1';
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
      btn.textContent = label;
    }
    applyBtn(btnEl, cartBtnText);
    applyBtn(buyNowBtnEl, buyNowBtnText);
  }

  // undefined = a required option still has no selection yet; null = a complete selection
  // that doesn't match any real combination (shouldn't happen -- the picker only offers
  // values that exist); otherwise the matching live variant (with its own price/stock).
  function currentVariant(){
    if (!variantOptions.length) return null;
    var values = variantOptions.map(function(o){ return selected[o.name]; });
    if (values.some(function(v){ return !v; })) return undefined;
    var key = values.join('|');
    var match = (liveTop && liveTop.variants || []).filter(function(v){ return v.key === key; })[0];
    return match || null;
  }

  function refresh(){
    var variant = currentVariant();
    var effectivePrice = (variant && variant.priceUsd != null) ? variant.priceUsd : basePriceUsd;
    if (priceEl) priceEl.textContent = ${JSON.stringify(sym)} + effectivePrice.toFixed(2);
    if (!liveTop) return;
    if (!liveTop.inStock) { setState('Out of stock', '#DC2626', true, '${isService ? 'Not Available' : 'Out of Stock'}', '${isService ? 'Not Available' : 'Out of Stock'}'); return; }
    if (variant === undefined) { setState('Select ${escapeHtml(product.variantOptions.map((o) => o.name).join(' & '))} to continue', '#94A3B8', true, 'Select Options', 'Select Options'); return; }
    var stockQuantity = variant ? variant.stockQuantity : liveTop.stockQuantity;
    if (liveTop.trackInventory && stockQuantity != null) {
      if (stockQuantity <= 0) { setState('${isService ? 'Fully booked' : 'Sold out'}', '#DC2626', true, '${isService ? 'Fully Booked' : 'Sold Out'}', '${isService ? 'Fully Booked' : 'Sold Out'}'); return; }
      setState(stockQuantity + ' ${isService ? 'bookings left' : 'available'}', '#64748B', false, '${isService ? 'Book Now' : 'Add to Cart'}', '${isService ? 'Book Now' : 'Buy Now'}');
      if (qtyEl) qtyEl.max = String(Math.max(1, stockQuantity));
    } else {
      setState('${isService ? 'Available to book' : 'In stock'}', '#16A34A', false, '${isService ? 'Book Now' : 'Add to Cart'}', '${isService ? 'Book Now' : 'Buy Now'}');
    }
  }

  if (pickerEl) {
    Array.prototype.forEach.call(pickerEl.querySelectorAll('button[data-opt]'), function(btn){
      btn.addEventListener('click', function(){
        selected[btn.getAttribute('data-opt')] = btn.getAttribute('data-val');
        Array.prototype.forEach.call(btn.parentElement.children, function(sib){
          sib.style.background = '#F1F5F9'; sib.style.color = '#0F172A'; sib.style.borderColor = '#E2E8F0';
        });
        btn.style.background = '#4338CA'; btn.style.color = '#fff'; btn.style.borderColor = '#4338CA';
        refresh();
      });
    });
  }

  if (btnEl) {
    btnEl.addEventListener('click', function(){
      var variant = currentVariant();
      var qty = qtyEl ? qtyEl.value : 1;
      var effectivePrice = (variant && variant.priceUsd != null) ? variant.priceUsd : basePriceUsd;
      var variantKey = variant ? variant.key : null;
      var variantLabel = variant ? variantOptions.map(function(o, i){ return o.name + ': ' + variant.optionValues[i]; }).join(', ') : null;
      siteSparkCart.add(productId, baseName, effectivePrice, qty, ${JSON.stringify(product.saleType)}, variantKey, variantLabel);
    });
  }

  if (buyNowBtnEl) {
    buyNowBtnEl.addEventListener('click', function(){
      var variant = currentVariant();
      var qty = qtyEl ? qtyEl.value : 1;
      var effectivePrice = (variant && variant.priceUsd != null) ? variant.priceUsd : basePriceUsd;
      var variantKey = variant ? variant.key : null;
      var variantLabel = variant ? variantOptions.map(function(o, i){ return o.name + ': ' + variant.optionValues[i]; }).join(', ') : null;
      siteSparkCart.buyNow(productId, baseName, effectivePrice, qty, ${JSON.stringify(product.saleType)}, variantKey, variantLabel);
    });
  }

  fetch(stockUrl).then(function(r){ return r.ok ? r.json() : null; }).then(function(data){
    if (!data) return;
    liveTop = data;
    // Cosmetic fields only (name/description) -- refreshed live from the seller's catalog so
    // an edit made in the standalone Products screen shows up here without a republish. Price
    // stays sourced from basePriceUsd/variant data above, which is this same live payload.
    if (data.name) { baseName = data.name; if (nameEl) nameEl.textContent = data.name; }
    if (typeof data.description === 'string' && descEl) descEl.textContent = data.description;
    refresh();
  }).catch(function(){});

  refresh();
})();</script>`
        : '';

      const btnRadius = fullBleed ? 10 : 8;
      const btnPad = fullBleed ? '14px' : '8px';
      const btnFontSize = fullBleed ? 16 : 13;
      const btnMarginTop = fullBleed ? 16 : 8;
      const cartBtnHtml = `<button id="${addBtnId}" style="${
        buyMode === 'both' ? 'flex:1;' : ''
      }background:#4338CA;color:#fff;border:none;border-radius:${btnRadius}px;padding:${btnPad};font-weight:700;font-size:${btnFontSize}px;cursor:pointer;">${isService ? 'Book Now' : 'Add to Cart'}</button>`;
      const buyNowBtnHtml = `<button id="${buyNowBtnId}" style="${
        buyMode === 'both' ? 'flex:1;' : ''
      }background:#0F172A;color:#fff;border:none;border-radius:${btnRadius}px;padding:${btnPad};font-weight:700;font-size:${btnFontSize}px;cursor:pointer;">${isService ? 'Book Now' : 'Buy Now'}</button>`;
      const buyButton = !isReady
        ? `<button disabled style="margin-top:${btnMarginTop}px;background:#E2E8F0;color:#94A3B8;border:none;border-radius:${btnRadius}px;padding:${btnPad};font-weight:700;font-size:${btnFontSize}px;cursor:not-allowed;">Coming Soon</button>`
        : buyMode === 'both'
          ? `<div style="margin-top:${btnMarginTop}px;display:flex;gap:8px;">${cartBtnHtml}${buyNowBtnHtml}</div>`
          : showBuyNowBtn
            ? `<div style="margin-top:${btnMarginTop}px;">${buyNowBtnHtml}</div>`
            : `<div style="margin-top:${btnMarginTop}px;">${cartBtnHtml}</div>`;

      const nameFontOption = getFontOption(el.nameFontFamily);
      const nameFontCss = nameFontOption.id !== 'system' ? `font-family:'${nameFontOption.family}',sans-serif;` : '';
      const priceFontOption = getFontOption(el.priceFontFamily);
      const priceFontCss = priceFontOption.id !== 'system' ? `font-family:'${priceFontOption.family}',sans-serif;` : '';

      return `<div id="el-${el.id}" data-product-name="${escapeAttr(product.name.toLowerCase())}" style="${base}background:#FFFFFF;${fullBleed ? '' : 'border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,0.1);'}overflow:${fullBleed ? 'auto' : 'hidden'};display:flex;flex-direction:column;font-family:-apple-system,sans-serif;">
  ${imgTag}
  <div style="padding:${fullBleed ? '20px' : '10px'};flex:1;display:flex;flex-direction:column;">
    <div style="font-size:${fullBleed ? 12 : 10}px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:0.02em;">${badge}</div>
    <div id="${nameId}" style="font-weight:800;font-size:${el.nameFontSize ?? (fullBleed ? 26 : 14)}px;color:#0F172A;margin-top:${fullBleed ? 6 : 2}px;${nameFontCss}">${escapeHtml(product.name)}</div>
    <div id="${descId}" style="font-size:${fullBleed ? 15 : 12}px;color:#64748B;margin-top:${fullBleed ? 10 : 2}px;${fullBleed ? 'line-height:22px;' : 'max-height:54px;overflow-y:auto;'}">${escapeHtml(product.description)}</div>
    ${variantPicker}
    ${isReady ? `<div id="${stockId}" style="font-size:${fullBleed ? 13 : 11}px;color:#94A3B8;margin-top:${fullBleed ? 8 : 2}px;">Checking availability…</div>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:${fullBleed ? 14 : 8}px;gap:6px;">
      <div style="display:flex;align-items:baseline;gap:8px;">
        <div id="${priceId}" style="font-weight:800;color:#4338CA;font-size:${el.priceFontSize ?? (fullBleed ? 22 : 14)}px;${priceFontCss}">${sym}${product.priceUsd.toFixed(2)}</div>
        ${
          product.compareAtPriceUsd != null && product.compareAtPriceUsd > product.priceUsd
            ? `<div style="font-size:${fullBleed ? 15 : 12}px;color:#94A3B8;text-decoration:line-through;">${sym}${product.compareAtPriceUsd.toFixed(2)}</div>`
            : ''
        }
      </div>
      ${isReady ? `<input id="${qtyId}" type="number" min="1" value="1" style="width:${fullBleed ? 56 : 44}px;padding:${fullBleed ? 8 : 4}px;border:1px solid #E2E8F0;border-radius:6px;font-size:${fullBleed ? 14 : 12}px;" />` : ''}
    </div>
    ${buyButton}
    ${isService ? `<div style="font-size:${fullBleed ? 12 : 10}px;color:#94A3B8;margin-top:6px;">One-time payment for a real reservation — not a recurring charge.</div>` : ''}
    ${isDigital ? `<div style="font-size:${fullBleed ? 12 : 10}px;color:#94A3B8;margin-top:6px;">Delivered by the seller after purchase — no shipping.</div>` : ''}
  </div>
</div>
${lightbox}
${galleryScript}
${script}`;
    }
    case 'collection': {
      const memberElements = el.productIds
        .map((id) => allElements.find((sib) => sib.id === id))
        .filter((sib): sib is Extract<CanvasElement, { type: 'product' }> => !!sib && sib.type === 'product');
      const members = memberElements.map((p) => ({ id: p.id, product: resolveProduct(p, products) }));
      const modalId = `collection-modal-${el.id}`;
      const thumbs = members
        .slice(0, 4)
        .map(({ product: p }) =>
          p.images[0]
            ? `<img src="${escapeAttr(p.images[0])}" style="width:50%;height:50%;object-fit:cover;display:block;" />`
            : `<div style="width:50%;height:50%;background:#F1F5F9;"></div>`
        )
        .join('');
      // Bigger thumb + a description snippet (not just name/price) so a collection's member
      // list reads as real product previews rather than a scrunched, uninformative row --
      // still links out to that product's own full card (or full PDP, if it's alone on its
      // own page) via its #el-{id} anchor rather than duplicating a whole PDP in this modal.
      const rows = members.length
        ? members
            .map(
              ({ id, product: p }) => `<a href="#el-${id}" onclick="document.getElementById(${JSON.stringify(modalId)}).style.display='none';" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #E2E8F0;text-decoration:none;color:inherit;">
  ${
    p.images[0]
      ? `<img src="${escapeAttr(p.images[0])}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0;" />`
      : `<div style="width:64px;height:64px;border-radius:10px;background:#F1F5F9;flex-shrink:0;"></div>`
  }
  <div style="flex:1;min-width:0;">
    <div style="font-weight:700;font-size:14px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name || 'Untitled product')}</div>
    ${p.description ? `<div style="font-size:12px;color:#64748B;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(p.description)}</div>` : ''}
    <div style="font-size:13px;color:#4338CA;font-weight:700;margin-top:2px;">${sym}${p.priceUsd.toFixed(2)}${
      p.compareAtPriceUsd != null && p.compareAtPriceUsd > p.priceUsd
        ? ` <span style="font-size:11px;color:#94A3B8;font-weight:400;text-decoration:line-through;">${sym}${p.compareAtPriceUsd.toFixed(2)}</span>`
        : ''
    }</div>
  </div>
</a>`
            )
            .join('')
        : `<div style="font-size:13px;color:#94A3B8;padding:12px 0;">No products in this collection yet.</div>`;

      return `<div id="el-${el.id}" style="${base}background:#FFFFFF;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,0.1);overflow:hidden;display:flex;flex-direction:column;font-family:-apple-system,sans-serif;cursor:pointer;" onclick="document.getElementById(${JSON.stringify(modalId)}).style.display='flex';">
  <div style="width:100%;height:55%;flex-shrink:0;display:flex;flex-wrap:wrap;">${thumbs || '<div style="width:100%;height:100%;background:#F1F5F9;"></div>'}</div>
  <div style="padding:10px;flex:1;display:flex;flex-direction:column;">
    <div style="font-size:10px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:0.02em;">Collection</div>
    <div style="font-weight:700;font-size:14px;color:#0F172A;margin-top:2px;">${escapeHtml(el.name || 'Untitled collection')}</div>
    <div style="font-size:12px;color:#64748B;margin-top:2px;">${members.length} ${members.length === 1 ? 'item' : 'items'}</div>
  </div>
</div>
<div id="${modalId}" style="display:none;position:fixed;inset:0;z-index:9999;background:#000000AA;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;" onclick="if(event.target===this)this.style.display='none';">
  <div style="width:90%;max-width:360px;max-height:75vh;overflow-y:auto;background:#fff;border-radius:16px;padding:18px;">
    <div style="font-size:10px;font-weight:700;color:#4338CA;text-transform:uppercase;letter-spacing:0.02em;">Collection</div>
    <div style="font-weight:800;font-size:17px;color:#0F172A;margin-top:2px;margin-bottom:8px;">${escapeHtml(el.name || 'Untitled collection')}</div>
    ${rows}
    <button onclick="document.getElementById(${JSON.stringify(modalId)}).style.display='none';" style="width:100%;margin-top:14px;background:#111827;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:13px;cursor:pointer;">Close</button>
  </div>
</div>`;
    }
    case 'game':
      return renderGameHtml(el, base, slug);
    case 'widget':
      return renderWidgetHtml(el, base);
    case 'customWidget':
      return renderCustomWidgetHtml(el, base);
    case 'section': {
      // A real background band behind whichever other elements sit inside it (see the
      // childIds comment on the client's SectionElement) -- elements publish in ascending
      // zIndex order (see the .sort() around this function's call site), and a section is
      // always given a lower zIndex than its children client-side, so this div simply lands
      // earlier in the DOM and paints behind them with zero special stacking logic needed.
      const background = el.backgroundGradient ? cssGradient(el.backgroundGradient) : escapeAttr(el.backgroundColor);
      return `<div style="${base}background:${background};border-radius:8px;"></div>`;
    }
    default:
      return '';
  }
}

// A real floating cart (localStorage-backed) + slide-out panel + checkout button, injected
// once per page (not per product) when a project has any product elements. Multi-item cart
// as requested -- add several different products, one Stripe Checkout for all of them.
// Stock/price are re-validated server-side in createStoreCheckout regardless of what's
// baked into this page, so a stale published page can never let someone buy at an old
// price or oversell what's actually left.
// The real cart trigger (icon + live count badge) now lives inline in the header bar (see
// renderHeaderBarHtml) instead of floating loose over the page -- this still renders the
// panel/JS with the exact same element ids that trigger expects, so nothing else here
// changes behavior.
function renderCartWidget(slug: string, checkoutUrl: string, discountValidateUrl: string, ordersByEmailUrl: string, currency = 'usd'): string {
  const sym = currencySymbol(currency);
  return `<div id="sitespark-cart-panel" style="display:none;position:fixed;top:64px;right:16px;z-index:9998;width:280px;max-height:70vh;overflow-y:auto;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:-apple-system,sans-serif;padding:14px;">
  <div style="font-weight:700;margin-bottom:8px;color:#0F172A;">Your cart</div>
  <div id="sitespark-cart-items"></div>
  <div id="sitespark-booking-fields" style="display:none;margin-top:10px;border-top:1px solid #F1F5F9;padding-top:10px;">
    <div style="font-size:11px;font-weight:700;color:#4338CA;text-transform:uppercase;margin-bottom:6px;">Booking details</div>
    <label style="font-size:11px;color:#64748B;">Preferred date</label>
    <input id="sitespark-booking-date" type="date" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin:2px 0 8px;" />
    <label style="font-size:11px;color:#64748B;">Preferred time</label>
    <input id="sitespark-booking-time" type="time" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin:2px 0 8px;" />
    <label style="font-size:11px;color:#64748B;">Notes (optional)</label>
    <textarea id="sitespark-booking-notes" rows="2" placeholder="Anything the business should know" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin-top:2px;resize:vertical;"></textarea>
  </div>
  <div style="margin-top:10px;border-top:1px solid #F1F5F9;padding-top:10px;">
    <div style="display:flex;gap:6px;">
      <input id="sitespark-discount-input" type="text" placeholder="Discount code" style="flex:1;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;text-transform:uppercase;" />
      <button onclick="siteSparkCart.applyDiscount()" style="background:#111827;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">Apply</button>
    </div>
    <div id="sitespark-discount-feedback" style="font-size:11px;margin-top:4px;"></div>
  </div>
  <div id="sitespark-cart-subtotal-row" style="display:none;justify-content:space-between;font-size:12px;color:#64748B;margin-top:8px;">
    <span>Subtotal</span><span id="sitespark-cart-subtotal">$0.00</span>
  </div>
  <div id="sitespark-cart-discount-row" style="display:none;justify-content:space-between;font-size:12px;color:#16A34A;margin-top:2px;">
    <span id="sitespark-cart-discount-label">Discount</span><span id="sitespark-cart-discount-amount">-$0.00</span>
  </div>
  <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:6px;color:#0F172A;">
    <span>Total</span><span id="sitespark-cart-total">$0.00</span>
  </div>
  <button onclick="siteSparkCart.checkout()" style="margin-top:10px;width:100%;background:#4338CA;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Checkout</button>
</div>
<div id="sitespark-order-banner" style="display:none;position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:12px 20px;border-radius:10px;font-family:-apple-system,sans-serif;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.2);"></div>
<div id="sitespark-track-fab" style="position:fixed;bottom:46px;left:20px;z-index:9998;background:#111827;color:#fff;display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:999px;font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25);" onclick="siteSparkCart.toggleTrackPanel()">
  📦 Track Order
</div>
<div id="sitespark-track-panel" style="display:none;position:fixed;bottom:96px;left:20px;z-index:9998;width:260px;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:-apple-system,sans-serif;padding:14px;">
  <div style="font-weight:700;margin-bottom:8px;color:#0F172A;">Track your order</div>
  <label style="font-size:11px;color:#64748B;">Email used at checkout</label>
  <input id="sitespark-track-email" type="email" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin:2px 0 8px;" />
  <button onclick="siteSparkCart.checkOrderStatus()" style="width:100%;background:#4338CA;color:#fff;border:none;border-radius:8px;padding:8px;font-weight:700;font-size:13px;cursor:pointer;">Check Status</button>
  <div id="sitespark-track-result" style="font-size:12px;margin-top:8px;color:#64748B;max-height:220px;overflow-y:auto;"></div>
</div>
<script>(function(){
  var SLUG=${JSON.stringify(slug)};
  var CHECKOUT_URL=${JSON.stringify(checkoutUrl)};
  var DISCOUNT_URL=${JSON.stringify(discountValidateUrl)};
  var ORDERS_BY_EMAIL_URL=${JSON.stringify(ordersByEmailUrl)};
  var CURRENCY_SYMBOL=${JSON.stringify(sym)};
  var STORAGE_KEY='sitespark_cart_'+SLUG;
  var DISCOUNT_KEY='sitespark_discount_'+SLUG;
  var LAST_ORDER_KEY='sitespark_last_order_'+SLUG;
  function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]; } catch(e){ return []; } }
  function save(items){ localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); render(); }
  function loadDiscount(){ try { return JSON.parse(localStorage.getItem(DISCOUNT_KEY))||null; } catch(e){ return null; } }
  function saveDiscount(discount){ if (discount) localStorage.setItem(DISCOUNT_KEY, JSON.stringify(discount)); else localStorage.removeItem(DISCOUNT_KEY); render(); }
  function hasService(items){ return items.some(function(i){ return i.saleType === 'service'; }); }
  // Mirrors computeDiscountAmount in index.ts closely enough for an accurate cart preview --
  // createStoreCheckout is still the authoritative computation at the moment of payment.
  function discountAmountFor(discount, subtotal, items){
    if (!discount) return 0;
    var kind = discount.kind || 'order';
    if (kind === 'item' || kind === 'bogo') {
      var targetName = (discount.targetProductName || '').trim().toLowerCase();
      var target = null;
      for (var i = 0; i < items.length; i++) { if (items[i].name.trim().toLowerCase() === targetName) { target = items[i]; break; } }
      if (!target) return 0;
      var lineTotal = target.priceUsd * target.quantity;
      if (kind === 'bogo') {
        if (!discount.bogoBuyQuantity || !discount.bogoGetQuantity) return 0;
        var groupSize = discount.bogoBuyQuantity + discount.bogoGetQuantity;
        var fullGroups = Math.floor(target.quantity / groupSize);
        var remainder = target.quantity % groupSize;
        var freeFromRemainder = Math.max(0, remainder - discount.bogoBuyQuantity);
        var freeUnits = fullGroups * discount.bogoGetQuantity + freeFromRemainder;
        return Math.min(freeUnits * target.priceUsd, lineTotal);
      }
      var rawItem = discount.type === 'percent' ? lineTotal * (discount.amount / 100) : discount.amount;
      return Math.min(Math.max(rawItem, 0), lineTotal);
    }
    if (kind === 'shipping') return 0; // reflected in the real total only after checkout -- see below
    var raw = discount.type === 'percent' ? subtotal * (discount.amount / 100) : discount.amount;
    return Math.min(Math.max(raw, 0), subtotal);
  }
  function render(){
    var items = load();
    var discount = loadDiscount();
    var count = items.reduce(function(s,i){return s+i.quantity;},0);
    var subtotal = items.reduce(function(s,i){return s+i.priceUsd*i.quantity;},0);
    var discountAmount = discountAmountFor(discount, subtotal, items);
    var total = subtotal - discountAmount;
    document.getElementById('sitespark-cart-count').textContent = String(count);
    document.getElementById('sitespark-cart-total').textContent = CURRENCY_SYMBOL+total.toFixed(2);
    document.getElementById('sitespark-booking-fields').style.display = hasService(items) ? 'block' : 'none';

    var subtotalRow = document.getElementById('sitespark-cart-subtotal-row');
    var discountRow = document.getElementById('sitespark-cart-discount-row');
    if (discount) {
      subtotalRow.style.display = 'flex';
      document.getElementById('sitespark-cart-subtotal').textContent = CURRENCY_SYMBOL+subtotal.toFixed(2);
      discountRow.style.display = 'flex';
      document.getElementById('sitespark-cart-discount-label').textContent = discount.code + ' applied';
      // A 'shipping' discount has nothing to show here (there's no shipping fee line in this
      // subtotal-only breakdown) -- it's still real, just reflected once the buyer reaches
      // the actual Stripe checkout page where the shipping fee itself appears.
      document.getElementById('sitespark-cart-discount-amount').textContent = discount.kind === 'shipping' ? 'at checkout' : '-'+CURRENCY_SYMBOL+discountAmount.toFixed(2);
    } else {
      subtotalRow.style.display = 'none';
      discountRow.style.display = 'none';
    }

    var list = document.getElementById('sitespark-cart-items');
    if (items.length === 0) { list.innerHTML = '<div style="color:#94A3B8;font-size:13px;">Cart is empty</div>'; return; }
    list.innerHTML = items.map(function(i){
      var badge = i.saleType === 'service' ? '📅 ' : i.saleType === 'digital' ? '💾 ' : i.saleType === 'custom' ? '✨ ' : '';
      var label = i.variantLabel ? ' (' + i.variantLabel + ')' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:6px;">'
        + '<span>'+badge+i.quantity+'&times; '+i.name+label+'</span>'
        + '<span style="display:flex;align-items:center;gap:6px;"><span>'+CURRENCY_SYMBOL+(i.priceUsd*i.quantity).toFixed(2)+'</span>'
        + '<a href="#" onclick="siteSparkCart.remove('+JSON.stringify(i.productId)+','+JSON.stringify(i.variantKey||null)+');return false;" style="color:#DC2626;">&times;</a></span>'
        + '</div>';
    }).join('');
  }
  // Two lines of the same product but different variants (e.g. Size M vs Size L) are kept as
  // separate cart entries -- dedup/removal always matches on productId AND variantKey
  // together, never productId alone, so adding a different size never merges into an
  // unrelated one.
  function add(productId, name, priceUsd, qtyRaw, saleType, variantKey, variantLabel){
    var qty = Math.max(1, parseInt(qtyRaw, 10) || 1);
    var items = load();
    var existing = items.filter(function(i){ return i.productId === productId && (i.variantKey||null) === (variantKey||null); })[0];
    if (existing) { existing.quantity += qty; } else {
      items.push({ productId: productId, name: name, priceUsd: priceUsd, quantity: qty, saleType: saleType, variantKey: variantKey||null, variantLabel: variantLabel||null });
    }
    save(items);
    document.getElementById('sitespark-cart-panel').style.display = 'block';
  }
  function remove(productId, variantKey){
    save(load().filter(function(i){ return !(i.productId === productId && (i.variantKey||null) === (variantKey||null)); }));
  }
  // Skips the persistent cart entirely and starts a real Checkout session for just this one
  // item, immediately -- the actual "Buy Now" experience. A service still needs a real
  // date/time picked before it can be paid for, so for those this falls back to the same
  // add-to-cart-and-open-panel behavior as "Book Now" (reusing its existing booking fields
  // instead of inventing a second date/time UI just for this path).
  function buyNow(productId, name, priceUsd, qtyRaw, saleType, variantKey, variantLabel){
    if (saleType === 'service') { add(productId, name, priceUsd, qtyRaw, saleType, variantKey, variantLabel); return; }
    var qty = Math.max(1, parseInt(qtyRaw, 10) || 1);
    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: SLUG,
        items: [{ productId: productId, quantity: qty, variantKey: variantKey || undefined }],
      }),
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.checkoutUrl) { window.location.href = data.checkoutUrl; }
        else { alert(data.error || 'Could not start checkout.'); }
      })
      .catch(function(){ alert('Could not start checkout.'); });
  }
  // The cart panel (bottom-right) and track-order panel (bottom-left) are wide enough on a
  // real phone-width screen to overlap each other in the middle if both were ever open at
  // once -- mutually exclusive, so opening one always closes the other first.
  function togglePanel(){
    var panel = document.getElementById('sitespark-cart-panel');
    var opening = panel.style.display === 'none';
    document.getElementById('sitespark-track-panel').style.display = 'none';
    panel.style.display = opening ? 'block' : 'none';
  }
  function toggleTrackPanel(){
    var panel = document.getElementById('sitespark-track-panel');
    var opening = panel.style.display === 'none';
    document.getElementById('sitespark-cart-panel').style.display = 'none';
    panel.style.display = opening ? 'block' : 'none';
  }
  // No buyer account exists in this app -- the email they paid with is the only "login" a
  // buyer has to check on their orders later, so a lookup returns every order they've ever
  // placed at this site rather than requiring them to keep track of an order number.
  function checkOrderStatus(){
    var email = document.getElementById('sitespark-track-email').value.trim();
    var result = document.getElementById('sitespark-track-result');
    if (!email) { result.style.color = '#DC2626'; result.textContent = 'Enter the email you used at checkout.'; return; }
    result.style.color = '#94A3B8';
    result.textContent = 'Checking…';
    fetch(ORDERS_BY_EMAIL_URL + '?slug=' + encodeURIComponent(SLUG) + '&email=' + encodeURIComponent(email))
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.error) { result.style.color = '#DC2626'; result.textContent = data.error; return; }
        var orders = data.orders || [];
        if (orders.length === 0) { result.style.color = '#64748B'; result.textContent = 'No orders found for that email.'; return; }
        var statusLabels = { unfulfilled: 'Preparing your order', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
        result.style.color = '#0F172A';
        result.innerHTML = orders.map(function(o){
          var statusLabel = statusLabels[o.fulfillmentStatus] || o.fulfillmentStatus;
          var tracking = (o.trackingCarrier || o.trackingNumber) ? '<br>' + (o.trackingCarrier || 'Carrier') + (o.trackingNumber ? ': ' + o.trackingNumber : '') : '';
          var items = o.itemsSummary ? '<br><span style="color:#64748B;">' + o.itemsSummary + '</span>' : '';
          return '<div style="border-top:1px solid #F1F5F9;padding-top:6px;margin-top:6px;"><strong>Order #' + String(o.orderId).slice(-8).toUpperCase() + '</strong> — ' + statusLabel + tracking + items + '</div>';
        }).join('');
      })
      .catch(function(){ result.style.color = '#DC2626'; result.textContent = 'Could not check that email.'; });
  }
  // A live preview only (validateDiscountCode is read-only, never redeems anything) --
  // createStoreCheckout re-validates for real at the moment of payment, since a code could
  // expire or run out of redemptions between typing it and actually checking out.
  function applyDiscount(){
    var input = document.getElementById('sitespark-discount-input');
    var feedback = document.getElementById('sitespark-discount-feedback');
    var code = (input.value || '').trim().toUpperCase();
    if (!code) { saveDiscount(null); feedback.textContent = ''; return; }
    feedback.style.color = '#94A3B8';
    feedback.textContent = 'Checking…';
    var itemsForPreview = load().map(function(i){ return { name: i.name, priceUsd: i.priceUsd, quantity: i.quantity }; });
    fetch(DISCOUNT_URL + '?slug=' + encodeURIComponent(SLUG) + '&code=' + encodeURIComponent(code) + '&items=' + encodeURIComponent(JSON.stringify(itemsForPreview)))
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.valid) {
          saveDiscount({
            code: code, kind: data.kind, type: data.type, amount: data.amount,
            targetProductName: data.targetProductName, bogoBuyQuantity: data.bogoBuyQuantity, bogoGetQuantity: data.bogoGetQuantity,
          });
          feedback.style.color = '#16A34A';
          var summary = data.kind === 'bogo'
            ? 'Buy ' + data.bogoBuyQuantity + ' ' + data.targetProductName + ', get ' + data.bogoGetQuantity + ' free'
            : data.kind === 'shipping'
              ? (data.type === 'percent' && data.amount >= 100 ? 'Free shipping' : (data.type === 'percent' ? data.amount + '% off shipping' : CURRENCY_SYMBOL + data.amount.toFixed(2) + ' off shipping'))
              : (data.type === 'percent' ? data.amount + '% off' : CURRENCY_SYMBOL + data.amount.toFixed(2) + ' off') + (data.kind === 'item' ? ' ' + data.targetProductName : '');
          feedback.textContent = summary + ' applied!';
        } else {
          saveDiscount(null);
          feedback.style.color = '#DC2626';
          feedback.textContent = data.error || 'Invalid code.';
        }
      })
      .catch(function(){ feedback.style.color = '#DC2626'; feedback.textContent = 'Could not check that code.'; });
  }
  function checkout(){
    var items = load();
    if (items.length === 0) return;
    var needsBooking = hasService(items);
    var booking = undefined;
    if (needsBooking) {
      var date = document.getElementById('sitespark-booking-date').value;
      var time = document.getElementById('sitespark-booking-time').value;
      var notes = document.getElementById('sitespark-booking-notes').value;
      if (!date || !time) { alert('Please pick a preferred date and time for your booking.'); return; }
      booking = { preferredDate: date, preferredTime: time, notes: notes };
    }
    var discount = loadDiscount();
    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: SLUG,
        items: items.map(function(i){ return { productId: i.productId, quantity: i.quantity, variantKey: i.variantKey || undefined }; }),
        booking: booking,
        discountCode: discount ? discount.code : undefined,
      }),
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.checkoutUrl) { window.location.href = data.checkoutUrl; }
        else { alert(data.error || 'Could not start checkout.'); }
      })
      .catch(function(){ alert('Could not start checkout.'); });
  }
  window.siteSparkCart = {
    add: add, remove: remove, buyNow: buyNow, togglePanel: togglePanel, checkout: checkout, applyDiscount: applyDiscount,
    toggleTrackPanel: toggleTrackPanel, checkOrderStatus: checkOrderStatus,
  };
  render();

  // Pre-fills the track-order widget's email with whatever this device last checked out
  // with, so a buyer who just ordered doesn't have to retype it -- only stored locally,
  // never sent anywhere until they actually press Check Status.
  var lastOrder = null;
  try { lastOrder = JSON.parse(localStorage.getItem(LAST_ORDER_KEY)); } catch (e) {}
  if (lastOrder && lastOrder.email) {
    document.getElementById('sitespark-track-email').value = lastOrder.email;
  }

  var params = new URLSearchParams(window.location.search);
  var order = params.get('order');
  var sessionId = params.get('session_id');
  if (order === 'success' || order === 'cancelled') {
    var wasBooking = hasService(load());
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DISCOUNT_KEY);
    if (order === 'success' && sessionId) {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ orderId: sessionId, email: (lastOrder && lastOrder.email) || '' }));
    }
    var banner = document.getElementById('sitespark-order-banner');
    var orderNumberSuffix = order === 'success' && sessionId ? ' Order #' + sessionId.slice(-8).toUpperCase() + '.' : '';
    banner.textContent = order === 'success'
      ? (wasBooking ? 'Thanks — your booking is confirmed!' : 'Thanks — your order is confirmed!') + orderNumberSuffix
      : 'Checkout was cancelled.';
    banner.style.background = order === 'success' ? '#16A34A' : '#64748B';
    banner.style.color = '#fff';
    banner.style.display = 'block';
    render();
  }
})();</script>`;
}

// Apple App Store Review Guideline 1.2 (User-Generated Content) requires a way for
// anyone to report objectionable content on a page like this one -- a real published
// site, publicly reachable to anyone with the link, not just signed-in app users. This
// has to work with no Firebase SDK loaded (published pages are plain static HTML), so it
// posts straight to reportPublishedSite's HTTP endpoint the same way the cart widget
// posts to createStoreCheckout.
function renderReportWidget(slug: string, reportUrl: string, pageUrl: string): string {
  return `<a href="#" id="sitespark-report-link" onclick="siteSparkReport.open();return false;" style="position:fixed;bottom:10px;left:10px;z-index:9999;font-family:-apple-system,sans-serif;font-size:11px;color:#94A3B8;background:#FFFFFFCC;padding:4px 8px;border-radius:8px;text-decoration:none;">Report this site</a>
<div id="sitespark-report-modal" style="display:none;position:fixed;inset:0;z-index:9999;background:#00000088;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:14px;padding:20px;width:90%;max-width:340px;font-family:-apple-system,sans-serif;">
    <div style="font-weight:700;color:#0F172A;margin-bottom:10px;">Report this site</div>
    <label style="font-size:12px;color:#64748B;">Reason</label>
    <select id="sitespark-report-reason" style="width:100%;padding:8px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;margin:4px 0 10px;">
      <option value="Spam or scam">Spam or scam</option>
      <option value="Offensive or abusive content">Offensive or abusive content</option>
      <option value="Copyright or trademark infringement">Copyright or trademark infringement</option>
      <option value="Impersonation">Impersonation</option>
      <option value="Other">Other</option>
    </select>
    <label style="font-size:12px;color:#64748B;">Details (optional)</label>
    <textarea id="sitespark-report-message" rows="3" style="width:100%;padding:8px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;margin-top:4px;resize:vertical;"></textarea>
    <div id="sitespark-report-status" style="font-size:12px;color:#DC2626;margin-top:8px;"></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button onclick="siteSparkReport.close();" style="flex:1;background:#F1F5F9;color:#0F172A;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Cancel</button>
      <button onclick="siteSparkReport.submit();" style="flex:1;background:#DC2626;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:700;cursor:pointer;">Submit</button>
    </div>
  </div>
</div>
<script>(function(){
  var SLUG=${JSON.stringify(slug)};
  var REPORT_URL=${JSON.stringify(reportUrl)};
  var PAGE_URL=${JSON.stringify(pageUrl)};
  function open(){ document.getElementById('sitespark-report-modal').style.display='flex'; }
  function close(){ document.getElementById('sitespark-report-modal').style.display='none'; document.getElementById('sitespark-report-status').textContent=''; }
  function submit(){
    var reason = document.getElementById('sitespark-report-reason').value;
    var message = document.getElementById('sitespark-report-message').value;
    var status = document.getElementById('sitespark-report-status');
    status.style.color = '#64748B';
    status.textContent = 'Sending...';
    fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: SLUG, reason: reason, message: message, pageUrl: PAGE_URL }),
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.ok) {
          status.style.color = '#16A34A';
          status.textContent = 'Thanks — this has been reported.';
          setTimeout(close, 1500);
        } else {
          status.style.color = '#DC2626';
          status.textContent = data.error || 'Could not send report.';
        }
      })
      .catch(function(){ status.style.color = '#DC2626'; status.textContent = 'Could not send report.'; });
  }
  window.siteSparkReport = { open: open, close: close, submit: submit };
})();</script>`;
}

function renderAnnouncementBars(project: Project): string {
  const { announcements } = project;
  if (!announcements.enabled || announcements.bars.length === 0) return '';

  const wrapStyle = 'position:sticky;top:0;z-index:500;width:100%;text-align:center;font-size:13px;font-weight:600;';

  if (announcements.bars.length === 1 || !announcements.autoSlide) {
    const bar = announcements.bars[0];
    return `<div style="${wrapStyle}padding:10px 16px;background:${escapeAttr(
      bar.backgroundColor
    )};color:${escapeAttr(bar.textColor)};">${escapeHtml(bar.text)}</div>`;
  }

  const bars = announcements.bars
    .map(
      (bar, i) =>
        `<div data-bar style="display:${i === 0 ? 'block' : 'none'};padding:10px 16px;opacity:${
          i === 0 ? '1' : '0'
        };transition:opacity 0.35s ease;background:${escapeAttr(bar.backgroundColor)};color:${escapeAttr(
          bar.textColor
        )};">${escapeHtml(bar.text)}</div>`
    )
    .join('');
  return `<div id="announcement-bars" style="${wrapStyle}">${bars}</div>
<script>(function(){
  var c=document.getElementById('announcement-bars');
  var bars=c.querySelectorAll('[data-bar]');
  var i=0;
  setInterval(function(){
    var cur=bars[i];
    cur.style.opacity='0';
    setTimeout(function(){
      cur.style.display='none';
      i=(i+1)%bars.length;
      var next=bars[i];
      next.style.display='block';
      next.style.opacity='0';
      requestAnimationFrame(function(){ next.style.opacity='1'; });
    },350);
  },${announcements.intervalMs});
})();</script>`;
}

// Small on-screen cards (distinct from the sticky top bar) that appear a set number of
// seconds after a visitor lands, optionally with a CTA button, and either auto-hide after
// a set duration or stay until dismissed. Stacked bottom-right, each one its own IIFE so
// their show/hide timers never collide.
function renderPopupAnnouncements(project: Project): string {
  const popups = project.announcements.popups ?? [];
  if (!project.announcements.enabled || popups.length === 0) return '';

  return popups
    .map((popup, idx) => {
      const bottom = 20 + idx * 90;
      const hasButton = popup.buttonLabel.trim().length > 0;
      return `<div id="popup-${escapeAttr(popup.id)}" style="position:fixed;right:20px;bottom:${bottom}px;max-width:320px;z-index:600;background:${hexToRgba(
        popup.backgroundColor,
        popup.opacity
      )};color:${escapeAttr(popup.textColor)};border-radius:14px;padding:14px 40px 14px 18px;box-shadow:0 10px 30px rgba(0,0,0,0.25);opacity:0;transform:translateY(24px);transition:opacity 0.35s ease, transform 0.35s ease;pointer-events:none;">
  <button aria-label="Dismiss" data-dismiss style="position:absolute;top:8px;right:10px;background:none;border:none;font-size:18px;line-height:1;cursor:pointer;color:${escapeAttr(
    popup.textColor
  )};">&times;</button>
  <div style="font-size:14px;font-weight:600;">${escapeHtml(popup.text)}</div>
  ${
    hasButton
      ? `<a href="${escapeAttr(safeUrl(popup.buttonUrl))}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;background:${escapeAttr(
          popup.textColor
        )};color:${escapeAttr(popup.backgroundColor)};font-weight:700;font-size:12px;padding:8px 14px;border-radius:999px;text-decoration:none;">${escapeHtml(
          popup.buttonLabel
        )}</a>`
      : ''
  }
</div>
<script>(function(){
  var el=document.getElementById('popup-${popup.id}');
  var dismissed=false;
  function show(){ if(dismissed) return; el.style.opacity='1'; el.style.transform='translateY(0)'; el.style.pointerEvents='auto'; }
  function hide(){ dismissed=true; el.style.opacity='0'; el.style.transform='translateY(24px)'; el.style.pointerEvents='none'; }
  setTimeout(show, ${Math.max(0, popup.delaySeconds) * 1000});
  ${popup.durationSeconds > 0 ? `setTimeout(hide, ${(Math.max(0, popup.delaySeconds) + popup.durationSeconds) * 1000});` : ''}
  el.querySelector('[data-dismiss]').addEventListener('click', hide);
})();</script>`;
    })
    .join('\n');
}

// Real, working nav bar for a manually-built multi-page website (see Project.pages) --
// shared verbatim across every one of that site's rendered pages, each page's link a bare
// relative reference (see siteRef) so it resolves correctly against the page's own <base>
// tag whether this site is hosted at buildsitespark.com/s/{slug} or its own connected custom
// domain. `currentSlug` highlights which page a visitor is already on ('' for Home). Returns
// '' for every non-multi-page project (nothing to link between), which renderProjectHtml
// below just inlines as-is.
export function renderPageNavHtml(pages: SitePage[], currentSlug: string): string {
  if (pages.length <= 1) return '';
  const links = pages
    .map((page) => {
      const href = siteRef(page.slug);
      const active = page.slug === currentSlug;
      return `<a href="${escapeAttr(href)}" style="color:${active ? '#FFFFFF' : '#CBD5E1'};font-weight:${
        active ? '700' : '600'
      };text-decoration:none;padding:8px 14px;">${escapeHtml(page.name)}</a>`;
    })
    .join('');
  return `<nav style="position:sticky;top:0;z-index:9997;display:flex;flex-wrap:wrap;justify-content:center;gap:2px;padding:6px 10px;background:#0F172A;font-family:-apple-system,sans-serif;font-size:14px;">${links}</nav>`;
}

// The relative href for linking to another page of THIS SAME published site -- deliberately
// never a leading "/" (an absolute-path reference), since a site with no connected custom
// domain is served under a shared path prefix (buildsitespark.com/s/{slug}/...) rather than
// at its own domain root, and a leading "/" would resolve against the real domain root,
// silently dropping that prefix. Paired with the <base> tag every full page gets (see
// siteBaseHref on renderProjectHtml/renderPolicyPageHtml/renderPoliciesIndexHtml below) so
// this exact same relative reference resolves correctly whether the site is hosted at a
// domain root (a connected custom domain) or under that shared path prefix.
function siteRef(pageSlugOrPath: string): string {
  const clean = pageSlugOrPath.replace(/^\/+/, '');
  return clean === '' ? '.' : clean;
}

// A real, standalone, real published page's URL path for a given policy -- kept as one
// literal path segment (no nested slash) so servePublishedSite's slug lookup in index.ts
// doesn't need any special-casing beyond stripping leading/trailing slashes.
export function policyHref(policyId: string): string {
  return `policy-${policyId}`;
}

export const POLICIES_INDEX_HREF = 'site-policies';

// A product/collection menu target points at wherever that productId/elementId is actually
// placed on the site -- a single-page project (no `pages`) is treated as one implicit page
// (`rootElements`, href `/`) so this works the same regardless of whether the site has real
// multi-page navigation. Falls back to `/` if the thing it's supposed to link to hasn't
// actually been placed on any page yet (nothing real to link to otherwise).
function findElementHref(pages: SitePage[] | undefined, rootElements: CanvasElement[], matches: (el: CanvasElement) => boolean): string {
  const candidatePages = pages && pages.length > 0 ? pages : [{ slug: '', elements: rootElements } as SitePage];
  for (const page of candidatePages) {
    const el = page.elements.find(matches);
    if (el) return `${siteRef(page.slug)}#el-${el.id}`;
  }
  return '.';
}

function resolveMenuTargetHref(target: MenuItem['target'], pages: SitePage[] | undefined, rootElements: CanvasElement[]): string {
  if (target.type === 'page') {
    const page = pages?.find((p) => p.id === target.pageId);
    return page ? siteRef(page.slug) : '.';
  }
  if (target.type === 'policy') return policyHref(target.policyId);
  if (target.type === 'product') return findElementHref(pages, rootElements, (el) => el.type === 'product' && el.productId === target.productId);
  if (target.type === 'collection') return findElementHref(pages, rootElements, (el) => el.type === 'collection' && el.id === target.elementId);
  return safeUrl(target.url);
}

function renderRichTextRunHtml(run: RichTextRun): string {
  let inner = escapeHtml(run.text);
  const styleParts: string[] = [];
  if (run.color) styleParts.push(`color:${escapeAttr(run.color)};`);
  if (run.link) {
    return `<a href="${escapeAttr(safeUrl(run.link))}" style="color:#2563EB;text-decoration:underline;">${inner}</a>`;
  }
  if (run.underline) styleParts.push('text-decoration:underline;');
  if (styleParts.length > 0) inner = `<span style="${styleParts.join('')}">${inner}</span>`;
  if (run.bold) inner = `<b>${inner}</b>`;
  return inner;
}

export function renderRichTextParagraphsHtml(paragraphs: RichTextRun[][]): string {
  return paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.map(renderRichTextRunHtml).join('')}</p>`)
    .join('');
}

// The real three-line menu button shown at the top of every published page (multi-page or
// not) -- a plain CSS/JS slide-out panel, no framework needed for something this small.
// Every site's menu automatically offers Home (the site's first page), Catalog (whichever
// page actually has product elements on it -- built straight off that page's own content,
// not something a seller has to separately configure), and Policies (the seller's written
// policies) whenever there's somewhere real for each to point. `menu.enabled === false`
// (an explicit site-owner choice, distinct from never having set one up) only ever hides the
// seller's own custom links, never these three baseline ones or Track/Stay Updated -- the
// button/panel itself renders whenever there's anything at all to show.
interface MenuHtml {
  // Just the trigger -- no position:fixed, so it can sit inline inside the real header bar
  // (renderHeaderBarHtml) instead of floating loose over the page content.
  button: string;
  // The slide-out drawer itself -- an inset:0 modal overlay, unaffected by where the button
  // that opens it lives.
  panel: string;
}

function renderMenuHtml(
  menu: SiteMenu | undefined,
  pages: SitePage[] | undefined,
  trackOrderEnabled: boolean,
  policies: PolicyDoc[] | undefined,
  rootElements: CanvasElement[] = []
): MenuHtml {
  const customItems = menu && menu.enabled ? menu.items : [];
  const linkStyle = 'display:block;padding:14px 20px;color:#0F172A;font-weight:600;text-decoration:none;border-bottom:1px solid #E2E8F0;';

  const homePage = pages && pages.length > 0 ? pages[0] : null;
  const homeHref = homePage ? siteRef(homePage.slug) : null;
  const catalogPage = pages?.find((p) => p.elements.some((el) => el.type === 'product')) ?? null;
  const catalogHref = catalogPage ? siteRef(catalogPage.slug) : null;
  const isPageTargeted = (pageId: string) => customItems.some((item) => item.target.type === 'page' && item.target.pageId === pageId);

  const homeLink = homePage && !isPageTargeted(homePage.id) ? `<a href="${escapeAttr(homeHref!)}" style="${linkStyle}">Home</a>` : '';
  const catalogLink =
    catalogPage && catalogHref !== homeHref && !isPageTargeted(catalogPage.id)
      ? `<a href="${escapeAttr(catalogHref!)}" style="${linkStyle}">🛍️ Catalog</a>`
      : '';

  const activePolicies = policies ?? [];
  const policiesLink =
    activePolicies.length === 1
      ? `<a href="${escapeAttr(policyHref(activePolicies[0].id))}" style="${linkStyle}">${escapeHtml(activePolicies[0].title)}</a>`
      : activePolicies.length > 1
        ? `<a href="${escapeAttr(POLICIES_INDEX_HREF)}" style="${linkStyle}">Policies</a>`
        : '';

  const customLinks = customItems
    .map(
      (item) =>
        `<a href="${escapeAttr(resolveMenuTargetHref(item.target, pages, rootElements))}" style="${linkStyle}">${escapeHtml(item.label)}</a>`
    )
    .join('');

  const trackLink = trackOrderEnabled
    ? `<a href="#" onclick="document.getElementById('sitespark-menu-panel').style.display='none';siteSparkCart.toggleTrackPanel();return false;" style="${linkStyle}">📦 Stay Updated</a>`
    : '';

  const links = homeLink + catalogLink + customLinks + policiesLink + trackLink;
  if (!links) return { button: '', panel: '' };

  const button = `<button aria-label="Menu" onclick="document.getElementById('sitespark-menu-panel').style.display='block'" style="width:40px;height:40px;border-radius:10px;border:none;background:#0F172A;color:#fff;font-size:18px;cursor:pointer;flex-shrink:0;">&#9776;</button>`;
  const panel = `<div id="sitespark-menu-panel" style="display:none;position:fixed;inset:0;z-index:9998;background:#000000AA;" onclick="if(event.target===this)this.style.display='none';">
  <div style="width:82%;max-width:300px;height:100%;background:#fff;box-shadow:2px 0 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;overflow-y:auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E2E8F0;">
      <span style="font-weight:800;font-size:15px;color:#0F172A;">Menu</span>
      <button aria-label="Close" onclick="document.getElementById('sitespark-menu-panel').style.display='none';" style="background:none;border:none;font-size:22px;color:#94A3B8;cursor:pointer;">&times;</button>
    </div>
    ${links}
  </div>
</div>`;
  return { button, panel };
}

// Real, always-on site header chrome -- hamburger (left), logo or site name (center), real
// product search + cart (right, only when the site actually sells something) -- rendered
// automatically for every published page, AI-built or manual, matching the reference layout:
// announcement bar, then this header bar, then the page content. No per-project opt-in;
// like the announcement bar/policy footer, it's always there, just configurable (logo,
// logo size/fit, divider color) via the Menu & Policies screen.
export interface HeaderBarOptions {
  siteName: string;
  logoUrl?: string | null;
  logoHeightPx?: number;
  logoFit?: 'contain' | 'cover';
  headerDividerColor?: string;
}

function renderHeaderBarHtml(opts: HeaderBarOptions, menuButton: string, hasProducts: boolean): string {
  const dividerColor = opts.headerDividerColor || '#E2E8F0';
  const logoHeight = opts.logoHeightPx || 32;
  const logoFit = opts.logoFit || 'contain';

  // A transparent-background PNG logo just naturally shows the header's own background
  // through its transparent areas when rendered as a plain <img> -- no special-casing
  // needed. A logo that already has its own baked-in background (a designed lockup, not a
  // transparent mark) renders exactly as authored, for the same reason: this is just how
  // <img> already works, not something to detect or branch on.
  const brandHtml = opts.logoUrl
    ? `<img src="${escapeAttr(opts.logoUrl)}" alt="${escapeAttr(opts.siteName)}" style="height:${logoHeight}px;max-width:60%;object-fit:${logoFit};display:block;" />`
    : `<span style="font-weight:800;font-size:17px;letter-spacing:1.5px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(opts.siteName.toUpperCase())}</span>`;

  const searchHtml = hasProducts
    ? `<button aria-label="Search" onclick="var r=document.getElementById('sitespark-search-row');var open=r.style.display==='flex';r.style.display=open?'none':'flex';if(!open)document.getElementById('sitespark-search-input').focus();" style="background:none;border:none;color:#0F172A;font-size:18px;cursor:pointer;flex-shrink:0;padding:4px;">&#128269;</button>`
    : '';

  const cartHtml = hasProducts
    ? `<button aria-label="Cart" onclick="siteSparkCart.togglePanel()" style="position:relative;background:none;border:none;color:#0F172A;font-size:19px;cursor:pointer;flex-shrink:0;padding:4px;">
  &#128722;<span id="sitespark-cart-count" style="position:absolute;top:-2px;right:-4px;background:#DC2626;color:#fff;border-radius:999px;min-width:16px;height:16px;font-size:10px;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 3px;">0</span>
</button>`
    : '';

  const searchRow = hasProducts
    ? `<div id="sitespark-search-row" style="display:none;padding:8px 16px 12px;">
  <input id="sitespark-search-input" type="text" placeholder="Search products" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid ${escapeAttr(dividerColor)};border-radius:8px;font-size:14px;font-family:-apple-system,sans-serif;" />
</div>
<script>(function(){
  var input = document.getElementById('sitespark-search-input');
  if (!input) return;
  input.addEventListener('input', function(){
    var q = input.value.trim().toLowerCase();
    document.querySelectorAll('[data-product-name]').forEach(function(card){
      var name = card.getAttribute('data-product-name') || '';
      card.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
    });
  });
})();</script>`
    : '';

  return `<div style="width:100%;background:#FFFFFF;border-bottom:1px solid ${escapeAttr(dividerColor)};box-shadow:0 1px 3px rgba(15,23,42,0.06);box-sizing:border-box;font-family:-apple-system,sans-serif;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;max-width:640px;margin:0 auto;box-sizing:border-box;">
    <div style="flex:0 0 auto;min-width:40px;">${menuButton}</div>
    <div style="flex:1;display:flex;justify-content:center;align-items:center;overflow:hidden;">${brandHtml}</div>
    <div style="flex:0 0 auto;display:flex;align-items:center;gap:10px;min-width:40px;justify-content:flex-end;">
      ${searchHtml}
      ${cartHtml}
    </div>
  </div>
  ${searchRow}
</div>`;
}

// The real, evenly-spaced row of policy buttons automatically shown at the bottom of every
// published page -- one per policy the site owner has created, each a real link to that
// policy's own page, plus a "View all" link once there's more than one.
function renderPolicyFooterHtml(policies: PolicyDoc[] | undefined): string {
  if (!policies || policies.length === 0) return '';
  const buttons = policies
    .map(
      (p) =>
        `<a href="${escapeAttr(policyHref(p.id))}" style="flex:1;text-align:center;padding:10px 8px;color:#334155;font-size:12px;font-weight:600;text-decoration:none;border-radius:8px;background:#F1F5F9;">${escapeHtml(p.title)}</a>`
    )
    .join('');
  return `<footer style="display:flex;flex-wrap:wrap;gap:8px;padding:16px;font-family:-apple-system,sans-serif;background:#FFFFFF;border-top:1px solid #E2E8F0;">${buttons}</footer>`;
}

// A real, flowing (not absolute-canvas) page for one policy's written content -- distinct
// from renderProjectHtml, which lays out the fixed-size design canvas; a policy is just text
// the owner wrote, so it gets a normal readable column instead.
export function renderPolicyPageHtml(
  siteName: string,
  policy: PolicyDoc,
  menu: SiteMenu | undefined,
  pages: SitePage[] | undefined,
  policies: PolicyDoc[] | undefined,
  headerOpts?: Omit<HeaderBarOptions, 'siteName'>,
  rootElements: CanvasElement[] = [],
  // The site's own root URL (e.g. https://buildsitespark.com/s/{slug}/ or
  // https://{customDomain}/) -- every internal link on this page is a bare relative
  // reference (see siteRef), resolved against this <base> so it lands in the right place
  // regardless of which of those two hosting shapes this particular site is using.
  siteBaseHref = ''
): string {
  const homeHref = siteRef(pages && pages.length > 0 ? pages[0].slug : '');
  const menuHtml = renderMenuHtml(menu, pages, false, policies, rootElements);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${siteBaseHref ? `<base href="${escapeAttr(siteBaseHref)}">` : ''}
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(policy.title)} — ${escapeHtml(siteName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; background: #F8FAFC; color: #1E293B; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
  </style>
</head>
<body>
  ${renderHeaderBarHtml({ siteName, ...headerOpts }, menuHtml.button, false)}
  ${menuHtml.panel}
  <div class="wrap">
    <a href="${escapeAttr(homeHref)}" style="color:#2563EB;font-weight:600;font-size:13px;text-decoration:none;">&larr; Back to ${escapeHtml(siteName)}</a>
    <h1 style="font-size:26px;margin:16px 0 20px;">${escapeHtml(policy.title)}</h1>
    ${renderRichTextParagraphsHtml(policy.paragraphs)}
  </div>
  ${renderPolicyFooterHtml(policies)}
</body>
</html>`;
}

// Lists every real policy the site owner has created, each linking to its own real page --
// the "view all policies" page a button/menu item/link can point at.
export function renderPoliciesIndexHtml(
  siteName: string,
  policies: PolicyDoc[],
  menu: SiteMenu | undefined,
  pages: SitePage[] | undefined,
  headerOpts?: Omit<HeaderBarOptions, 'siteName'>,
  rootElements: CanvasElement[] = [],
  // See renderPolicyPageHtml's identical parameter for what this is and why.
  siteBaseHref = ''
): string {
  const homeHref = siteRef(pages && pages.length > 0 ? pages[0].slug : '');
  const rows = policies
    .map(
      (p) =>
        `<a href="${escapeAttr(policyHref(p.id))}" style="display:block;padding:14px 16px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:10px;color:#0F172A;font-weight:700;text-decoration:none;">${escapeHtml(p.title)}</a>`
    )
    .join('');
  const menuHtml = renderMenuHtml(menu, pages, false, policies, rootElements);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${siteBaseHref ? `<base href="${escapeAttr(siteBaseHref)}">` : ''}
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Policies — ${escapeHtml(siteName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; background: #F8FAFC; color: #1E293B; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
  </style>
</head>
<body>
  ${renderHeaderBarHtml({ siteName, ...headerOpts }, menuHtml.button, false)}
  ${menuHtml.panel}
  <div class="wrap">
    <a href="${escapeAttr(homeHref)}" style="color:#2563EB;font-weight:600;font-size:13px;text-decoration:none;">&larr; Back to ${escapeHtml(siteName)}</a>
    <h1 style="font-size:26px;margin:16px 0 20px;">Policies</h1>
    ${rows}
  </div>
</body>
</html>`;
}

// A real banner announcing whichever discount code the seller has "announce on site" turned
// on for right now -- polled live (not baked in at publish time), so turning the toggle on
// shows up immediately without republishing. A plain block at the very top of the page (not
// position:sticky) deliberately: renderAnnouncementBars above already uses sticky top:0, and
// stacking a second sticky sibling at the same top:0 would make them visually overlap once
// scrolled (a real CSS gotcha, not just a style choice) -- a flash promo banner doesn't need
// to follow scroll anyway. announceDurationMs only controls this per-visit auto-fade timer;
// whether the banner is eligible to show at all is entirely the seller's announceOnSite
// toggle (see getActiveDiscountAnnouncement in index.ts).
function renderDiscountAnnouncementScript(slug: string, announceUrl: string): string {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  // Right padding clears the dismiss (x) button, absolutely positioned inside this same bar.
  // (No left-side compensation needed -- the hamburger menu now lives inline in the real
  // header bar above, in normal document flow, not floating over this banner like before.)
  return `<div id="sitespark-discount-banner" style="display:none;position:relative;width:100%;box-sizing:border-box;padding:12px 40px;background:linear-gradient(90deg,#7C3AED,#4338CA);color:#fff;font-family:-apple-system,sans-serif;font-size:13px;font-weight:700;text-align:center;">
  <span id="sitespark-discount-banner-text"></span>
  <button aria-label="Dismiss" onclick="siteSparkDiscountBanner.dismiss()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;">&times;</button>
</div>
<script>(function(){
  var SLUG=${JSON.stringify(slug)};
  var ANNOUNCE_URL=${JSON.stringify(announceUrl)};
  var banner=document.getElementById('sitespark-discount-banner');
  var dismissKey=null;
  function dismiss(){
    banner.style.display='none';
    if (dismissKey) sessionStorage.setItem(dismissKey, '1');
  }
  window.siteSparkDiscountBanner = { dismiss: dismiss };
  fetch(ANNOUNCE_URL + '?slug=' + encodeURIComponent(SLUG))
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data.active) return;
      dismissKey = 'sitespark_discount_dismissed_' + SLUG + '_' + data.code;
      if (sessionStorage.getItem(dismissKey)) return;
      document.getElementById('sitespark-discount-banner-text').textContent = '🎉 ' + data.message + ' — use code ' + data.code;
      banner.style.display = 'block';
      // Short "flash" durations auto-fade themselves off screen; anything longer just stays
      // up (this visit, until closed) rather than running a real timer for hours/days/weeks.
      if (data.durationMs && data.durationMs <= ${FIVE_MINUTES_MS}) {
        setTimeout(dismiss, data.durationMs);
      }
    })
    .catch(function(){});
})();</script>`;
}

export function renderProjectHtml(
  project: Project,
  slug: string,
  storeCheckoutUrl: string,
  reportUrl: string,
  productStockUrl: string,
  discountValidateUrl: string,
  ordersByEmailUrl: string,
  discountAnnouncementUrl: string,
  navHtml = '',
  // Whether this is the last (or only) page of the site -- the "Built by SiteSpark" badge
  // only ever renders once per whole published site, at the very end, never once per page of
  // a multi-page site (see the publishProject loop in index.ts, which passes false for every
  // page except the last).
  isLastPage = true,
  // Lowercase ISO 4217 code, e.g. "usd" -- the seller's own SellerAccount.currency at publish
  // time (see currency.ts). Defaults to 'usd' for any project with no seller/products.
  currency = 'usd',
  // Real content for every ProductElement on this page/project, pre-fetched by the caller
  // (publishProject in index.ts) from the seller's catalog (users/{uid}/products), keyed by
  // productId -- see resolveProduct's comment for the legacy-element fallback when an id has
  // no catalog doc.
  products: Record<string, CatalogProduct> = {},
  // See renderPolicyPageHtml's identical parameter for what this is and why.
  siteBaseHref = ''
): string {
  const hasProducts = project.elements.some((el) => el.type === 'product');
  // This page's only real content is one product -- render it Shopify-PDP-style (see the
  // product case's `fullBleed` handling below) instead of the small catalog-grid card.
  const isSingleProductPage = project.elements.length === 1 && project.elements[0].type === 'product';
  // The header bar (hamburger/logo/search), sitewide announcement bars, and the policy footer
  // are all real-website concepts -- a Logo or 9:16 Video project publishes as one fixed
  // single-page card meant to look like its own thing (a logo reveal, a vertical video),
  // not a mini website with navigation chrome bolted onto it. Social is the same fixed
  // single-card shape (see PageType's own comment), grouped the same way.
  const isWebsite = project.pageType === 'website';
  const menu = renderMenuHtml(project.menu, project.pages, hasProducts, project.policies, project.elements);
  const hasMultiplayerGame = project.elements.some(
    (el) => el.type === 'game' && (el.kind === 'tictactoe' || el.kind === 'connect4' || el.kind === 'rps')
  );
  // Shared by every Three.js-based game kind so they all load the same one CDN script,
  // rather than each kind gating its own separate include.
  const needsThreeJs = project.elements.some((el) => el.type === 'game' && (el.kind === 'targetrange3d' || el.kind === 'basketball'));
  const usesMdi = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'MaterialCommunityIcons');
  const usesFa = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'FontAwesome5');
  const usesIon = project.elements.some((el) => el.type === 'icon' && el.iconSet === 'Ionicons');

  const iconLinks = [
    usesMdi ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7/css/materialdesignicons.min.css">' : '',
    usesFa ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">' : '',
    usesIon
      ? '<script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script><script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>'
      : '',
  ].join('\n  ');

  const usedFontIds = new Set<string>();
  for (const el of project.elements) {
    if (el.type === 'text' && el.fontFamily && el.fontFamily !== 'system') usedFontIds.add(el.fontFamily);
    if ((el.type === 'product' || el.type === 'collection')) {
      if (el.nameFontFamily && el.nameFontFamily !== 'system') usedFontIds.add(el.nameFontFamily);
      if (el.priceFontFamily && el.priceFontFamily !== 'system') usedFontIds.add(el.priceFontFamily);
    }
  }
  const fontQueries = [...usedFontIds]
    .map((id) => getFontOption(id).googleFontsQuery)
    .filter((q): q is string => !!q);
  const fontLink =
    fontQueries.length > 0
      ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontQueries
          .map((q) => `family=${q}`)
          .join('&')}&display=swap">`
      : '';

  const elementsHtml = project.elements
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((el) => renderElement(el, slug, productStockUrl, project.elements, products, currency, isSingleProductPage))
    .join('\n');

  const { width, height } = project.canvasSize;
  const pageBackground = project.backgroundGradient ? cssGradient(project.backgroundGradient) : escapeAttr(project.backgroundColor);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  ${siteBaseHref ? `<base href="${escapeAttr(siteBaseHref)}">` : ''}
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  ${iconLinks}
  ${fontLink}
  <style>
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    html, body { margin: 0; padding: 0; background: ${pageBackground}; }
    #site-wrapper { display: flex; justify-content: center; }
    #canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      background: ${pageBackground};
      transform-origin: top center;
      overflow: hidden;
    }
    .sitespark-badge {
      display: block; width: 100%; box-sizing: border-box; text-align: center;
      padding: 16px 10px; font-family: -apple-system, sans-serif; font-size: 11px;
      color: #94A3B8; background: #F8FAFC; text-decoration: none;
    }
  </style>
</head>
<body>
  ${hasMultiplayerGame ? sharedGameRuntimeScript() : ''}
  ${needsThreeJs ? '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>' : ''}
  ${isWebsite ? renderAnnouncementBars(project) : ''}
  ${
    isWebsite
      ? renderHeaderBarHtml(
          { siteName: project.name, logoUrl: project.logoUrl, logoHeightPx: project.logoHeightPx, logoFit: project.logoFit, headerDividerColor: project.headerDividerColor },
          menu.button,
          hasProducts
        )
      : ''
  }
  ${isWebsite ? menu.panel : ''}
  ${navHtml}
  ${hasProducts ? renderDiscountAnnouncementScript(slug, discountAnnouncementUrl) : ''}
  <div id="site-wrapper">
    <div id="canvas">
      ${elementsHtml}
    </div>
  </div>
  ${isWebsite ? renderPolicyFooterHtml(project.policies) : ''}
  ${isLastPage ? '<a class="sitespark-badge" href="https://sitespark.app" target="_blank" rel="noopener">Built by SiteSpark</a>' : ''}
  <!-- Fixed-position UI (report link always; cart/track FABs when hasProducts) is pinned to
       the viewport bottom regardless of document height -- on a page short enough to fit in
       one screen, the real in-flow content above (policy footer/badge) would otherwise end
       inside that same reserved band and visibly collide with it. This invisible spacer just
       pushes the true end of the document below that band instead. -->
  <div aria-hidden="true" style="height:${hasProducts ? 130 : 50}px;"></div>
  ${renderReportWidget(slug, reportUrl, siteBaseHref || `https://${slug}.buildsitespark.com`)}
  ${renderPopupAnnouncements(project)}
  ${hasProducts ? renderCartWidget(slug, storeCheckoutUrl, discountValidateUrl, ordersByEmailUrl, currency) : ''}
  <script>
    (function () {
      var canvas = document.getElementById('canvas');
      var wrapper = document.getElementById('site-wrapper');
      function fit() {
        var scale = Math.min(1, wrapper.clientWidth / ${width});
        canvas.style.transform = 'scale(' + scale + ')';
        wrapper.style.height = (${height} * scale) + 'px';
      }
      fit();
      window.addEventListener('resize', fit);
    })();
  </script>
</body>
</html>`;
}

// Shared page chrome (nav + footer) for buildsitespark.com's real marketing site (home,
// privacy, returns, support) -- served for the bare product domain and any request that
// doesn't resolve to a specific published project or connected custom domain -- see
// servePublishedSite's hostname handling in index.ts. Lives here (not static files in
// public/) because Firebase Hosting can't vary static content by Host header -- every
// custom domain attached to this Hosting site shares the same rewrites/config, so these
// pages have to be rendered dynamically alongside everything else.
// Where the real web app (sign-in + the full canvas editor/AI builder running via Expo's
// web export) is hosted -- a separate Firebase Hosting site/target from this marketing
// page (see firebase.json's "webapp" target and ROADMAP.md's "Web app hosting setup" for
// the one-time site-creation + DNS steps this domain depends on).
const WEBAPP_URL = 'https://app.buildsitespark.com';

function marketingShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(1100px 520px at 12% -10%, rgba(99,102,241,0.28), transparent 60%),
        radial-gradient(900px 460px at 88% 8%, rgba(236,72,153,0.16), transparent 55%),
        radial-gradient(800px 500px at 50% 100%, rgba(34,211,238,0.10), transparent 60%),
        #0B1220;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    a { color: #A5B4FC; }
    code { background: #1E293B; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
    header.site {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 24px; border-bottom: 1px solid rgba(148,163,184,0.15);
      position: sticky; top: 0; z-index: 10;
      background: rgba(11,18,32,0.75); backdrop-filter: blur(10px);
    }
    header.site .logo {
      font-weight: 800; font-size: 20px; text-decoration: none;
      background: linear-gradient(90deg, #A5B4FC, #F0ABFC 60%, #67E8F9);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    header.site nav { display: flex; align-items: center; }
    header.site nav a.navlink { margin-left: 22px; font-size: 14px; color: #CBD5E1; text-decoration: none; }
    header.site nav a.navlink:hover { color: #F8FAFC; }
    header.site nav a.signin {
      margin-left: 22px; font-size: 14px; font-weight: 600; color: #F8FAFC; text-decoration: none;
    }
    header.site nav a.cta {
      margin-left: 22px; font-size: 13px; font-weight: 700; text-decoration: none;
      color: #0B1220; padding: 9px 18px; border-radius: 999px;
      background: linear-gradient(90deg, #818CF8, #E879F9);
      box-shadow: 0 6px 18px rgba(129,140,248,0.35);
      white-space: nowrap;
    }
    /* Below this width, "Features / Pricing / Support / Sign In / Get Started" all in one
       flex row runs wider than the screen and pushes "Get Started" off-screen entirely --
       drop the in-page anchor links (Support still has its own footer link, and the
       sections are one scroll away) so Sign In + Get Started always stay on-screen. */
    @media (max-width: 640px) {
      header.site { padding: 14px 16px; }
      header.site nav a.navlink { display: none; }
      header.site nav a.signin { margin-left: 0; margin-right: 12px; font-size: 13px; }
      header.site nav a.cta { margin-left: 0; padding: 8px 14px; font-size: 12px; }
    }
    footer.site {
      border-top: 1px solid rgba(148,163,184,0.15); padding: 36px 24px; text-align: center;
      color: #64748B; font-size: 13px; margin-top: 40px;
    }
    footer.site a { color: #94A3B8; }
    footer.site .links { margin-bottom: 8px; }
    footer.site .links a { margin: 0 10px; }
    h1 { font-size: 38px; margin: 0 0 12px; letter-spacing: -0.5px; }
    h2 { font-size: 26px; margin: 0 0 8px; letter-spacing: -0.3px; }
    h3 { font-size: 16px; margin: 0 0 6px; }
    p.lead { color: #B9C2D0; font-size: 17px; max-width: 640px; }
  </style>
</head>
<body>
  <header class="site">
    <a class="logo" href="/">SiteSpark</a>
    <nav>
      <a class="navlink" href="/#features">Features</a>
      <a class="navlink" href="/#pricing">Pricing</a>
      <a class="navlink" href="/support">Support</a>
      <a class="signin" href="${WEBAPP_URL}">Sign In</a>
      <a class="cta" href="${WEBAPP_URL}">Get Started</a>
    </nav>
  </header>
  ${bodyHtml}
  <footer class="site">
    <div class="links">
      <a href="/privacy">Privacy Policy</a>
      <a href="/returns">Return &amp; Refund Policy</a>
      <a href="/support">Support</a>
    </div>
    <div>&copy; ${new Date().getFullYear()} SiteSpark &middot; <a href="mailto:support@buildsitespark.com">support@buildsitespark.com</a></div>
  </footer>
</body>
</html>`;
}

const PAGE_TYPES: { name: string; icon: string; accent: string }[] = [
  { name: 'Website', icon: '&#127760;', accent: '#818CF8' },
  { name: 'Video', icon: '&#127909;', accent: '#F472B6' },
  { name: 'Social (9:16)', icon: '&#128241;', accent: '#67E8F9' },
  { name: 'Logo', icon: '&#10024;', accent: '#FBBF24' },
];

const FEATURES: { title: string; body: string; icon: string; accent: string }[] = [
  {
    title: 'Manual canvas editor',
    body: 'Drag-and-drop text, images, shapes, icons, buttons, slideshows, and real trimmed video with an optional synced audio overlay.',
    icon: '&#127912;',
    accent: '#818CF8',
  },
  {
    title: 'Real AI Site Builder',
    body: 'Describe your site in up to 4,000 words and a real AI pipeline writes the copy and generates the images, laid out on an editable canvas.',
    icon: '&#129504;',
    accent: '#F472B6',
  },
  {
    title: 'Spark, the AI assistant',
    body: 'A persistent chat assistant that answers questions and can open the right screen for you, on every screen of the app.',
    icon: '&#10024;',
    accent: '#67E8F9',
  },
  {
    title: 'Real publishing & domains',
    body: 'Every project publishes instantly to a free subdomain like <code>yourproject.buildsitespark.com</code>, or connect a domain you own, or buy a brand-new one without leaving the app.',
    icon: '&#127760;',
    accent: '#FBBF24',
  },
];

const PLANS: { name: string; price: string; credits: string; popular?: boolean }[] = [
  { name: 'Beginner', price: '$64.99/mo', credits: '200 credits/mo' },
  { name: 'Middle Class', price: '$109.99/mo', credits: '460 credits/mo', popular: true },
  { name: 'Advanced', price: '$149.99/mo', credits: '1,000 credits/mo' },
];

export function renderLandingPageHtml(): string {
  const body = `
  <section class="wrap" style="padding:88px 24px 64px;text-align:center;">
    <div style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.4px;color:#C4B5FD;background:rgba(129,140,248,0.12);border:1px solid rgba(129,140,248,0.35);border-radius:999px;padding:6px 16px;margin-bottom:22px;">
      NOW ON THE APP STORE
    </div>
    <h1>Build a real website — by hand, or with a real AI builder</h1>
    <p class="lead" style="margin:0 auto 28px;">Website, video, social, and logo pages, published at their own real
    link the moment you're done. No mockups, no "coming soon" placeholders inside the app itself.</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
      <a href="${WEBAPP_URL}" style="text-decoration:none;font-weight:700;font-size:15px;color:#0B1220;padding:14px 28px;border-radius:12px;background:linear-gradient(90deg,#818CF8,#E879F9);box-shadow:0 10px 30px rgba(129,140,248,0.35);">Get Started Free</a>
      <a href="/#features" style="text-decoration:none;font-weight:700;font-size:15px;color:#F8FAFC;padding:14px 28px;border-radius:12px;border:1px solid rgba(148,163,184,0.3);">See how it works</a>
    </div>
  </section>

  <section id="features" class="wrap" style="padding:40px 24px 64px;">
    <h2 style="text-align:center;margin-bottom:28px;">Four kinds of pages, two ways to build them</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:48px;">
      ${PAGE_TYPES.map(
        (t) =>
          `<div style="background:linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015));border:1px solid rgba(148,163,184,0.16);border-radius:16px;padding:22px 16px;text-align:center;">
            <div style="font-size:26px;margin-bottom:8px;">${t.icon}</div>
            <div style="font-weight:700;color:${t.accent};">${escapeHtml(t.name)}</div>
          </div>`
      ).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;">
      ${FEATURES.map(
        (f) =>
          `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(148,163,184,0.12);border-radius:16px;padding:22px;">
            <div style="width:40px;height:40px;border-radius:10px;background:${f.accent}22;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:12px;">${f.icon}</div>
            <h3>${escapeHtml(f.title)}</h3>
            <p style="color:#98A2B3;font-size:14px;">${f.body}</p>
          </div>`
      ).join('')}
    </div>
  </section>

  <section id="pricing" class="wrap" style="padding:48px 24px 80px;">
    <h2 style="text-align:center;margin-bottom:28px;">Plans</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;">
      ${PLANS.map(
        (p) => `
      <div style="position:relative;background:${p.popular ? 'linear-gradient(160deg,rgba(129,140,248,0.16),rgba(232,121,249,0.08))' : 'rgba(255,255,255,0.03)'};border:1px solid ${p.popular ? 'rgba(165,180,252,0.55)' : 'rgba(148,163,184,0.14)'};border-radius:18px;padding:30px 26px;text-align:center;${p.popular ? 'box-shadow:0 14px 34px rgba(129,140,248,0.22);' : ''}">
        ${p.popular ? '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;letter-spacing:0.4px;color:#0B1220;background:linear-gradient(90deg,#818CF8,#E879F9);padding:4px 14px;border-radius:999px;">MOST POPULAR</div>' : ''}
        <div style="font-weight:700;font-size:17px;margin-bottom:6px;">${escapeHtml(p.name)}</div>
        <div style="font-size:28px;font-weight:800;margin-bottom:6px;background:linear-gradient(90deg,#F8FAFC,#C7D2FE);-webkit-background-clip:text;background-clip:text;color:transparent;">${escapeHtml(p.price)}</div>
        <div style="color:#98A2B3;font-size:14px;">${escapeHtml(p.credits)}</div>
      </div>`
      ).join('')}
    </div>
    <p style="text-align:center;color:#7C8797;font-size:13px;margin-top:26px;">
      Plus one-time credit packs and luxury theme unlocks, available from inside the app.
    </p>
  </section>`;
  return marketingShell('SiteSpark — build a real website, by hand or with AI', body);
}

// Mirrors src/data/policies.ts -- functions run in a separate Node project from the app
// (no shared `@/` alias across them), so this is duplicated rather than imported. Keep in
// sync by hand if either side's policy copy changes.
const PRIVACY_POLICY_UPDATED = 'Last updated: 20 July 2026';
const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'What we collect',
    body:
      'Account info: your email, phone number, or Google/Apple account details, handled by Firebase Authentication. ' +
      'Content you create: text, images, video/audio clips, and site layouts you add to your projects. ' +
      'AI prompts: what you type into the AI Site Builder or the Spark assistant. ' +
      'Payment-adjacent info: for domain purchases/transfers, the real registrant contact (name, address, phone, ' +
      'email) required by ICANN for domain registration. We never see or store your card details directly.',
  },
  {
    heading: 'Who we share it with, and why',
    body:
      'Firebase/Google Cloud hosts your account, projects, and files, and runs the backend that powers this app. ' +
      'OpenAI processes AI Site Builder prompts and the Spark assistant’s conversation to generate copy, layouts, ' +
      'and images — per OpenAI’s API terms, this data is not used to train their models. ' +
      'Stripe processes real payments for domain purchases; we receive confirmation of payment, never your full ' +
      'card number. Namecheap is our domain registrar partner — for any domain you buy, register, or transfer ' +
      'through the app, your registrant contact is submitted to them to complete the real ICANN registration; ' +
      'free WHOIS privacy protection is requested automatically so it isn’t publicly visible in WHOIS lookups. ' +
      'Apple processes subscription and credit-pack purchases through In-App Purchase. Google AdMob serves the ' +
      'app-open, banner, and rewarded-credit ads inside the app — ads are requested as non-personalized, so ' +
      'AdMob does not receive advertising identifiers or build a profile of you for tracking.',
  },
  {
    heading: 'Publishing makes content public',
    body:
      'When you publish a project, its content (text, images, video) becomes a real, publicly reachable web page ' +
      'that anyone with the link — or your connected domain — can view. Unpublishing takes it back down. ' +
      'Don’t publish anything you don’t want visible to the public.',
  },
  {
    heading: 'Your choices',
    body:
      'You can delete individual projects at any time from the Projects screen. To delete your account entirely, ' +
      'go to Account → Delete Account — this immediately and permanently removes your projects, published sites, ' +
      'credit balance, order history, and assistant chat history from our systems; no need to contact support. ' +
      'Domain registrations already submitted to Namecheap follow that registrar’s own account/data rules, since ' +
      'the domain itself is a real-world asset independent of this app.',
  },
  {
    heading: 'Contact',
    body: 'Questions about this policy or your data: support@buildsitespark.com or +61 408 680 813.',
  },
];

const RETURN_POLICY_UPDATED = 'Last updated: 20 July 2026';
const RETURN_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Subscriptions and credit packs',
    body:
      'Plans (Beginner/Middle Class/Advanced) and credit packs are purchased through Apple’s In-App Purchase. ' +
      'Apple processes all payments for these and handles refund requests directly — SiteSpark does not have ' +
      'the ability to issue refunds for IAP purchases itself. Request a refund at reportaproblem.apple.com or ' +
      'through your Apple ID purchase history.',
  },
  {
    heading: 'Theme unlocks',
    body:
      'Luxury theme unlocks ($189) and luxury-crazy theme unlocks ($399) are one-time Apple In-App Purchases, ' +
      'subject to the same Apple-handled refund process as above.',
  },
  {
    heading: 'Domain purchases and transfers',
    body:
      'Buying or transferring a real domain is processed as a one-time Stripe payment, separate from Apple IAP, ' +
      'because a registered domain is a real-world asset rather than digital app content. If a domain registration ' +
      'or transfer fails on our end (for example, the registrar rejects it), you are not charged — payment is ' +
      'only captured, and the domain only registered, once both succeed. Once a domain is successfully registered ' +
      'or an inbound transfer completes, it generally cannot be refunded, in line with standard domain industry and ' +
      'ICANN practice — the underlying registration cost has already been paid to the registry. If something ' +
      'goes wrong on your purchase, contact support below and we’ll look into it.',
  },
  {
    heading: 'Contact',
    body: 'Billing or refund questions: support@buildsitespark.com or +61 408 680 813.',
  },
];

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'How do free credits work?',
    answer:
      'Every new account gets 38 free credits to try the AI Site Builder. Building a site costs credits based on ' +
      'how detailed you ask it to be.',
  },
  {
    question: 'Can I edit an AI-generated site afterward?',
    answer:
      'Yes — once the AI Site Builder finishes, it opens straight into the regular canvas editor, where you ' +
      'can move, resize, or replace anything it created.',
  },
  {
    question: 'What happens if I unpublish a project?',
    answer: 'Its public page stops being reachable immediately. Your project isn’t deleted — you can republish any time.',
  },
  {
    question: 'Do I need to own a domain to publish?',
    answer: 'No — every published project gets a real, working link automatically. Connecting or buying a custom domain is optional.',
  },
  {
    question: 'Is my card information stored by SiteSpark?',
    answer:
      'No. Domain purchases are processed by Stripe, and subscriptions/credit packs by Apple’s In-App ' +
      'Purchase — SiteSpark never sees or stores your full card details.',
  },
  {
    question: 'How do the "watch an ad for credits", banner, and app-open ads work?',
    answer:
      'Every 2 days, you can watch a short rewarded ad from Google AdMob for 15 free credits — the button on ' +
      'your Projects screen shows when it’s available again. You may also see a banner ad on the Projects ' +
      'screen and, occasionally, a full-screen ad when you return to the app after switching away. Ads shown ' +
      'in the app are non-personalized and don’t track you across other apps or websites.',
  },
  {
    question: 'Can I use SiteSpark from a computer, not just the iOS app?',
    answer:
      'Yes — sign in at app.buildsitespark.com with the same Google, Apple, or phone number account to access ' +
      'your projects from a browser.',
  },
];

function renderPolicyPage(title: string, updated: string, sections: { heading: string; body: string }[]): string {
  const body = `
  <section class="wrap" style="padding:56px 24px 72px;max-width:720px;">
    <h1 style="font-size:28px;">${escapeHtml(title)}</h1>
    <p style="color:#64748B;font-size:13px;margin-bottom:32px;">${escapeHtml(updated)}</p>
    ${sections
      .map(
        (s) => `
    <div style="margin-bottom:26px;">
      <h2 style="font-size:18px;">${escapeHtml(s.heading)}</h2>
      <p style="color:#CBD5E1;font-size:15px;">${escapeHtml(s.body)}</p>
    </div>`
      )
      .join('')}
  </section>`;
  return marketingShell(`${title} — SiteSpark`, body);
}

// This is accurate-to-the-code, not legally reviewed -- see ROADMAP.md.
export function renderPrivacyPolicyHtml(): string {
  return renderPolicyPage('Privacy Policy', PRIVACY_POLICY_UPDATED, PRIVACY_SECTIONS);
}

export function renderReturnPolicyHtml(): string {
  return renderPolicyPage('Return & Refund Policy', RETURN_POLICY_UPDATED, RETURN_SECTIONS);
}

export function renderSupportHtml(): string {
  const body = `
  <section class="wrap" style="padding:56px 24px 72px;max-width:720px;">
    <h1 style="font-size:28px;">Support</h1>
    <p style="color:#94A3B8;font-size:15px;margin-bottom:8px;">
      Email <a href="mailto:support@buildsitespark.com">support@buildsitespark.com</a> or call
      <a href="tel:+61408680813">+61 408 680 813</a>.
    </p>
    <h2 style="font-size:20px;margin-top:40px;margin-bottom:16px;">Frequently asked questions</h2>
    ${FAQ_ITEMS.map(
      (item) => `
    <div style="margin-bottom:20px;">
      <h3 style="font-size:15px;">${escapeHtml(item.question)}</h3>
      <p style="color:#CBD5E1;font-size:14px;">${escapeHtml(item.answer)}</p>
    </div>`
    ).join('')}
  </section>`;
  return marketingShell('Support — SiteSpark', body);
}

// Served in place of a project's real published HTML once enforceBillingSuspensions has
// marked its PublishedSite doc `suspended` (see index.ts) -- a failed subscription payment
// that went unresolved past the grace period. Distinct from renderLandingPageHtml (that's the
// bare product-domain fallback); this page is scoped to the one project that's actually down,
// so a visitor isn't left thinking the whole site is broken with no explanation.
export function renderSuspendedSiteHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Site unavailable</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0B1220;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      padding: 24px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #94A3B8; font-size: 15px; line-height: 1.5; max-width: 420px; margin: 0 auto; }
  </style>
</head>
<body>
  <div>
    <h1>This site is temporarily unavailable</h1>
    <p>The owner's subscription payment could not be processed. The site will come back
    online automatically as soon as it's resolved.</p>
  </div>
</body>
</html>`;
}
