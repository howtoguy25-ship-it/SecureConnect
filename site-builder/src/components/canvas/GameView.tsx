import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GameElement } from '@/types';

// Real, playable mini-games -- not mockups. Each works standalone off just the GameElement's
// own data, so the exact same rules/state machine described here is mirrored in plain JS for
// the published site (see siteHtml.ts's renderGameHtml), just translated from RN components to
// DOM manipulation. Tic-Tac-Toe/Connect Four/Rock Paper Scissors are real 2-player games, so
// each gets a mode picker (vs Computer / 2 Players same device) here in the editor; the
// published site adds a third real "Play Online" mode matched against another visitor (see
// the multiplayer JS in siteHtml.ts) -- that needs two distinct real people, which the editor
// preview can't provide, so it isn't offered here.

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function tttWinner(board: (null | 'X' | 'O')[]): 'X' | 'O' | null {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

// `depth` biases the score toward faster wins / slower losses -- without it, minimax treats
// every winning line as equally good and can happily ignore an immediate win sitting on the
// board in favor of a slower one, which still never loses but looks obviously wrong to a
// real player watching the computer skip a free win.
function tttMinimaxScore(board: (null | 'X' | 'O')[], me: 'X' | 'O', opp: 'X' | 'O', maximizing: boolean, depth: number): number {
  const w = tttWinner(board);
  if (w === me) return 10 - depth;
  if (w === opp) return depth - 10;
  if (board.every((c) => c !== null)) return 0;
  let best = maximizing ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const next = [...board];
    next[i] = maximizing ? me : opp;
    const score = tttMinimaxScore(next, me, opp, !maximizing, depth + 1);
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

// Real minimax -- unbeatable. The board is tiny (9 cells) so a full search every move is
// instant, no pruning needed.
function tttBestMove(board: (null | 'X' | 'O')[], me: 'X' | 'O', opp: 'X' | 'O'): number {
  let bestScore = -Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const next = [...board];
    next[i] = me;
    const score = tttMinimaxScore(next, me, opp, false, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

function TicTacToeGame({ compact, vsComputer }: { compact: boolean; vsComputer: boolean }) {
  const [board, setBoard] = useState<(null | 'X' | 'O')[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [thinking, setThinking] = useState(false);

  const winner = tttWinner(board);
  const draw = !winner && board.every((c) => c !== null);

  const tap = (i: number) => {
    if (board[i] || winner || draw || thinking) return;
    if (vsComputer && turn === 'O') return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setTurn(turn === 'X' ? 'O' : 'X');
  };

  useEffect(() => {
    if (!vsComputer || turn !== 'O' || winner || draw) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const move = tttBestMove(board, 'O', 'X');
      if (move !== -1) {
        const next = [...board];
        next[move] = 'O';
        setBoard(next);
        setTurn('X');
      }
      setThinking(false);
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, vsComputer, board.join(''), winner, draw]);

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn('X');
  };

  const cell = compact ? 26 : 44;
  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        {winner ? `${winner} wins!` : draw ? "It's a draw!" : thinking ? 'Computer thinking…' : `${turn}'s turn`}
      </Text>
      <View style={{ width: cell * 3, flexDirection: 'row', flexWrap: 'wrap' }}>
        {board.map((v, i) => (
          <Pressable key={i} onPress={() => tap(i)} style={[styles.tttCell, { width: cell, height: cell }]}>
            <Text style={{ fontSize: cell * 0.5, fontWeight: '800', color: v === 'X' ? '#4338CA' : '#DC2626' }}>{v ?? ''}</Text>
          </Pressable>
        ))}
      </View>
      {(winner || draw) && (
        <Pressable style={styles.smallResetBtn} onPress={reset}>
          <Text style={styles.smallResetBtnText}>Play Again</Text>
        </Pressable>
      )}
    </View>
  );
}

const C4_ROWS = 6;
const C4_COLS = 7;
type C4Cell = null | 'R' | 'Y';
type C4Board = C4Cell[][];

function c4Empty(): C4Board {
  return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null));
}
function c4Clone(board: C4Board): C4Board {
  return board.map((row) => [...row]);
}
function c4DropRow(board: C4Board, col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) if (!board[r][col]) return r;
  return -1;
}
function c4ValidCols(board: C4Board): number[] {
  const out: number[] = [];
  for (let c = 0; c < C4_COLS; c++) if (!board[0][c]) out.push(c);
  return out;
}
function c4Winner(board: C4Board): C4Cell {
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      if (c + 3 < C4_COLS && cell === board[r][c + 1] && cell === board[r][c + 2] && cell === board[r][c + 3]) return cell;
      if (r + 3 < C4_ROWS && cell === board[r + 1][c] && cell === board[r + 2][c] && cell === board[r + 3][c]) return cell;
      if (r + 3 < C4_ROWS && c + 3 < C4_COLS && cell === board[r + 1][c + 1] && cell === board[r + 2][c + 2] && cell === board[r + 3][c + 3])
        return cell;
      if (r + 3 < C4_ROWS && c - 3 >= 0 && cell === board[r + 1][c - 1] && cell === board[r + 2][c - 2] && cell === board[r + 3][c - 3])
        return cell;
    }
  }
  return null;
}
function c4Full(board: C4Board): boolean {
  return board[0].every((c) => c !== null);
}
function c4WindowScore(cells: C4Cell[], me: C4Cell, opp: C4Cell): number {
  const meCount = cells.filter((c) => c === me).length;
  const oppCount = cells.filter((c) => c === opp).length;
  const emptyCount = cells.filter((c) => c === null).length;
  if (meCount === 4) return 100000;
  if (meCount === 3 && emptyCount === 1) return 50;
  if (meCount === 2 && emptyCount === 2) return 10;
  if (oppCount === 3 && emptyCount === 1) return -60;
  return 0;
}
function c4Score(board: C4Board, me: C4Cell, opp: C4Cell): number {
  let score = 0;
  const centerCol = Math.floor(C4_COLS / 2);
  for (let r = 0; r < C4_ROWS; r++) if (board[r][centerCol] === me) score += 3;
  for (let r = 0; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS - 3; c++) score += c4WindowScore([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], me, opp);
  for (let c = 0; c < C4_COLS; c++)
    for (let r = 0; r < C4_ROWS - 3; r++) score += c4WindowScore([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], me, opp);
  for (let r = 0; r < C4_ROWS - 3; r++)
    for (let c = 0; c < C4_COLS - 3; c++)
      score += c4WindowScore([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], me, opp);
  for (let r = 3; r < C4_ROWS; r++)
    for (let c = 0; c < C4_COLS - 3; c++)
      score += c4WindowScore([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]], me, opp);
  return score;
}
function c4Minimax(board: C4Board, depth: number, alpha: number, beta: number, maximizing: boolean, me: C4Cell, opp: C4Cell): number {
  const winner = c4Winner(board);
  if (winner === me) return 1000000 + depth;
  if (winner === opp) return -1000000 - depth;
  if (c4Full(board) || depth === 0) return c4Score(board, me, opp);
  const cols = c4ValidCols(board);
  if (maximizing) {
    let best = -Infinity;
    for (const c of cols) {
      const b2 = c4Clone(board);
      const r = c4DropRow(b2, c);
      b2[r][c] = me;
      best = Math.max(best, c4Minimax(b2, depth - 1, alpha, beta, false, me, opp));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const c of cols) {
    const b2 = c4Clone(board);
    const r = c4DropRow(b2, c);
    b2[r][c] = opp;
    best = Math.min(best, c4Minimax(b2, depth - 1, alpha, beta, true, me, opp));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}
// A strong (not literally solved/perfect) computer opponent: immediate win/block checks plus
// a 5-ply alpha-beta search -- Connect Four is only fully solved with much deeper search, out
// of proportion for a casual embedded game, but this plays very well.
function c4BestMove(board: C4Board, me: C4Cell, opp: C4Cell): number {
  for (const c of c4ValidCols(board)) {
    const b2 = c4Clone(board);
    const r = c4DropRow(b2, c);
    b2[r][c] = me;
    if (c4Winner(b2) === me) return c;
  }
  for (const c of c4ValidCols(board)) {
    const b2 = c4Clone(board);
    const r = c4DropRow(b2, c);
    b2[r][c] = opp;
    if (c4Winner(b2) === opp) return c;
  }
  let bestCol = c4ValidCols(board)[0];
  let bestVal = -Infinity;
  for (const c of c4ValidCols(board)) {
    const b2 = c4Clone(board);
    const r = c4DropRow(b2, c);
    b2[r][c] = me;
    const val = c4Minimax(b2, 4, -Infinity, Infinity, false, me, opp);
    if (val > bestVal) {
      bestVal = val;
      bestCol = c;
    }
  }
  return bestCol;
}

function ConnectFourGame({ compact, vsComputer }: { compact: boolean; vsComputer: boolean }) {
  const [board, setBoard] = useState<C4Board>(c4Empty);
  const [turn, setTurn] = useState<'R' | 'Y'>('R');
  const [thinking, setThinking] = useState(false);

  const winner = c4Winner(board);
  const full = c4Full(board);

  const tap = (col: number) => {
    if (winner || full || thinking) return;
    if (vsComputer && turn === 'Y') return;
    const row = c4DropRow(board, col);
    if (row === -1) return;
    const next = c4Clone(board);
    next[row][col] = turn;
    setBoard(next);
    setTurn(turn === 'R' ? 'Y' : 'R');
  };

  useEffect(() => {
    if (!vsComputer || turn !== 'Y' || winner || full) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const col = c4BestMove(board, 'Y', 'R');
      const row = c4DropRow(board, col);
      if (row !== -1) {
        const next = c4Clone(board);
        next[row][col] = 'Y';
        setBoard(next);
        setTurn('R');
      }
      setThinking(false);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, vsComputer, JSON.stringify(board), winner, full]);

  const reset = () => {
    setBoard(c4Empty());
    setTurn('R');
  };

  const cell = compact ? 18 : 26;
  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        {winner
          ? `${winner === 'R' ? 'Red' : 'Yellow'} wins!`
          : full
            ? "It's a draw!"
            : thinking
              ? 'Computer thinking…'
              : `${turn === 'R' ? 'Red' : 'Yellow'}'s turn`}
      </Text>
      <View>
        {board.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((cellVal, c) => (
              <Pressable key={c} onPress={() => tap(c)} style={[styles.c4Cell, { width: cell, height: cell }]}>
                {cellVal && (
                  <View
                    style={[
                      styles.c4Disc,
                      { width: cell * 0.78, height: cell * 0.78, borderRadius: cell, backgroundColor: cellVal === 'R' ? '#DC2626' : '#EAB308' },
                    ]}
                  />
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {(winner || full) && (
        <Pressable style={styles.smallResetBtn} onPress={reset}>
          <Text style={styles.smallResetBtnText}>Play Again</Text>
        </Pressable>
      )}
    </View>
  );
}

const RPS_CHOICES = ['rock', 'paper', 'scissors'] as const;
type RPSChoice = (typeof RPS_CHOICES)[number];
const RPS_EMOJI: Record<RPSChoice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };
function rpsWinner(a: RPSChoice, b: RPSChoice): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw';
  if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return 'a';
  return 'b';
}

function RockPaperScissorsGame({ compact, vsComputer }: { compact: boolean; vsComputer: boolean }) {
  const [myChoice, setMyChoice] = useState<RPSChoice | null>(null);
  const [oppChoice, setOppChoice] = useState<RPSChoice | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  // In local (same-device) mode, player 1 picks first (hidden from player 2 in spirit -- both
  // are looking at the same screen in real life, but the flow still makes each pick blind to
  // the other's choice at the moment they make it, same as the real game).
  const [waitingForP2, setWaitingForP2] = useState(false);

  const pick = (choice: RPSChoice) => {
    if (vsComputer) {
      const computerChoice = RPS_CHOICES[Math.floor(Math.random() * 3)];
      setMyChoice(choice);
      setOppChoice(computerChoice);
      const result = rpsWinner(choice, computerChoice);
      if (result === 'a') setScoreA((s) => s + 1);
      else if (result === 'b') setScoreB((s) => s + 1);
    } else if (myChoice === null) {
      setMyChoice(choice);
      setWaitingForP2(true);
    } else if (oppChoice === null) {
      setOppChoice(choice);
      setWaitingForP2(false);
      const result = rpsWinner(myChoice, choice);
      if (result === 'a') setScoreA((s) => s + 1);
      else if (result === 'b') setScoreB((s) => s + 1);
    }
  };

  const reset = () => {
    setMyChoice(null);
    setOppChoice(null);
    setWaitingForP2(false);
  };

  const showResult = myChoice !== null && oppChoice !== null;
  const emojiSize = compact ? 22 : 30;

  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        Player 1: {scoreA} · {vsComputer ? 'Computer' : 'Player 2'}: {scoreB}
      </Text>
      {!showResult && (
        <>
          <Text style={{ fontSize: compact ? 10 : 12, color: '#64748B' }}>
            {vsComputer ? 'Make your move' : waitingForP2 ? 'Player 2: make your move' : 'Player 1: make your move'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {RPS_CHOICES.map((c) => (
              <Pressable key={c} onPress={() => pick(c)} style={styles.rpsBtn}>
                <Text style={{ fontSize: emojiSize }}>{RPS_EMOJI[c]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {showResult && (
        <>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: emojiSize + 8 }}>{RPS_EMOJI[myChoice!]}</Text>
            <Text style={{ fontWeight: '700', color: '#64748B' }}>vs</Text>
            <Text style={{ fontSize: emojiSize + 8 }}>{RPS_EMOJI[oppChoice!]}</Text>
          </View>
          <Text style={[styles.statusText, { fontSize: compact ? 12 : 15 }]}>
            {rpsWinner(myChoice!, oppChoice!) === 'draw'
              ? "It's a tie!"
              : rpsWinner(myChoice!, oppChoice!) === 'a'
                ? 'Player 1 wins!'
                : `${vsComputer ? 'Computer' : 'Player 2'} wins!`}
          </Text>
          <Pressable style={styles.smallResetBtn} onPress={reset}>
            <Text style={styles.smallResetBtnText}>Play Again</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function ClickerGame({ label, target, compact }: { label: string; target: number; compact: boolean }) {
  const [count, setCount] = useState(0);
  const won = count >= target;
  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>{won ? 'You did it!' : `${count} / ${target}`}</Text>
      <Pressable
        style={[styles.clickerBtn, won && { backgroundColor: '#16A34A' }]}
        onPress={() => !won && setCount((c) => c + 1)}
      >
        <Text style={[styles.clickerBtnText, { fontSize: compact ? 13 : 17 }]}>{won ? '🎉' : label || 'Tap!'}</Text>
      </Pressable>
      {won && (
        <Pressable style={styles.smallResetBtn} onPress={() => setCount(0)}>
          <Text style={styles.smallResetBtnText}>Play Again</Text>
        </Pressable>
      )}
    </View>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function MemoryGame({ symbols, compact }: { symbols: string[]; compact: boolean }) {
  const usable = symbols.length >= 2 ? symbols : ['🍎', '🍋', '🍇', '🍓'];
  const deck = useMemo(() => shuffle(usable.flatMap((s) => [s, s])).map((symbol, id) => ({ id, symbol })), [usable.join('|')]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    if (deck[a].symbol === deck[b].symbol) {
      setMatched((prev) => new Set([...prev, a, b]));
      setFlipped([]);
    } else {
      const timer = setTimeout(() => setFlipped([]), 700);
      return () => clearTimeout(timer);
    }
  }, [flipped, deck]);

  const tap = (i: number) => {
    if (flipped.length === 2 || flipped.includes(i) || matched.has(i)) return;
    setFlipped((prev) => [...prev, i]);
  };

  const won = matched.size === deck.length;
  const cols = deck.length <= 12 ? 4 : 5;
  const cell = compact ? 24 : 38;

  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>{won ? 'All matched! 🎉' : 'Find the pairs'}</Text>
      <View style={{ width: cell * cols, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {deck.map((card, i) => {
          const shown = flipped.includes(i) || matched.has(i);
          return (
            <Pressable key={card.id} onPress={() => tap(i)} style={[styles.memoryCell, { width: cell, height: cell }]}>
              <Text style={{ fontSize: cell * 0.5 }}>{shown ? card.symbol : ''}</Text>
            </Pressable>
          );
        })}
      </View>
      {won && (
        <Pressable style={styles.smallResetBtn} onPress={() => { setFlipped([]); setMatched(new Set()); }}>
          <Text style={styles.smallResetBtnText}>Play Again</Text>
        </Pressable>
      )}
    </View>
  );
}

function TriviaGame({ questions, compact }: { questions: GameElement['questions']; compact: boolean }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  if (questions.length === 0) {
    return (
      <View style={styles.centerFill}>
        <Text style={styles.statusText}>Add questions in the inspector to play.</Text>
      </View>
    );
  }

  const finished = index >= questions.length;
  if (finished) {
    return (
      <View style={styles.centerFill}>
        <Text style={[styles.statusText, { fontSize: compact ? 13 : 16 }]}>
          Score: {score} / {questions.length}
        </Text>
        <Pressable
          style={styles.smallResetBtn}
          onPress={() => {
            setIndex(0);
            setScore(0);
            setSelected(null);
          }}
        >
          <Text style={styles.smallResetBtnText}>Play Again</Text>
        </Pressable>
      </View>
    );
  }

  const q = questions[index];
  const pick = (i: number) => {
    if (selected != null) return;
    setSelected(i);
    if (i === q.correctIndex) setScore((s) => s + 1);
  };
  const next = () => {
    setSelected(null);
    setIndex((i) => i + 1);
  };

  return (
    <View style={[styles.centerFill, { justifyContent: 'flex-start', paddingTop: compact ? 8 : 14 }]}>
      <Text style={[styles.triviaQuestion, { fontSize: compact ? 11 : 14 }]} numberOfLines={3}>
        {q.question}
      </Text>
      <View style={{ width: '100%', paddingHorizontal: 8 }}>
        {q.options.map((opt, i) => {
          const isCorrect = selected != null && i === q.correctIndex;
          const isWrongPick = selected === i && i !== q.correctIndex;
          return (
            <Pressable
              key={i}
              onPress={() => pick(i)}
              style={[
                styles.triviaOption,
                isCorrect && { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
                isWrongPick && { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
              ]}
            >
              <Text style={{ fontSize: compact ? 10 : 12, color: '#1E293B', fontWeight: '600' }} numberOfLines={2}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selected != null && (
        <Pressable style={styles.smallResetBtn} onPress={next}>
          <Text style={styles.smallResetBtnText}>{index + 1 >= questions.length ? 'See Score' : 'Next'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const SIMON_COLORS = ['#16A34A', '#DC2626', '#EAB308', '#2563EB'];

// Classic "repeat the sequence" memory game -- distinct from MemoryGame's pairs-matching.
// sequenceRef/playerIndexRef are refs (not state) because the setTimeout chain that plays
// back the sequence needs the real current value at fire time, not whatever was captured in
// the closure when the timer was scheduled -- state alone would go stale across the delays.
function SimonGame({ compact }: { compact: boolean }) {
  const sequenceRef = useRef<number[]>([]);
  const playerIndexRef = useRef(0);
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'showing' | 'waiting' | 'gameover'>('idle');
  const [level, setLevel] = useState(0);

  const playSequence = () => {
    setPhase('showing');
    const seq = sequenceRef.current;
    seq.forEach((panel, i) => {
      setTimeout(() => {
        setActivePanel(panel);
        setTimeout(() => setActivePanel(null), 350);
      }, i * 650);
    });
    setTimeout(() => {
      playerIndexRef.current = 0;
      setPhase('waiting');
    }, seq.length * 650);
  };

  const start = () => {
    sequenceRef.current = [Math.floor(Math.random() * 4)];
    playerIndexRef.current = 0;
    setLevel(1);
    setTimeout(playSequence, 400);
  };

  const tapPanel = (i: number) => {
    if (phase !== 'waiting') return;
    setActivePanel(i);
    setTimeout(() => setActivePanel(null), 200);
    if (i === sequenceRef.current[playerIndexRef.current]) {
      playerIndexRef.current += 1;
      if (playerIndexRef.current === sequenceRef.current.length) {
        sequenceRef.current = [...sequenceRef.current, Math.floor(Math.random() * 4)];
        setLevel(sequenceRef.current.length);
        setPhase('showing');
        setTimeout(playSequence, 500);
      }
    } else {
      setPhase('gameover');
    }
  };

  const size = compact ? 96 : 132;
  const half = size / 2 - 3;

  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        {phase === 'idle' ? 'Tap Start' : phase === 'gameover' ? `Game over — Level ${level}` : `Level ${level}`}
      </Text>
      {(phase === 'showing' || phase === 'waiting') && (
        <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {SIMON_COLORS.map((color, i) => (
            <Pressable
              key={i}
              onPress={() => tapPanel(i)}
              style={{ width: half, height: half, backgroundColor: color, opacity: activePanel === i ? 1 : 0.4, borderRadius: 8 }}
            />
          ))}
        </View>
      )}
      {(phase === 'idle' || phase === 'gameover') && (
        <Pressable style={styles.smallResetBtn} onPress={start}>
          <Text style={styles.smallResetBtnText}>{phase === 'gameover' ? 'Play Again' : 'Start'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const FLAPPY_GRAVITY = 0.8;
const FLAPPY_FLAP = -8;
const FLAPPY_PIPE_GAP = 90;
const FLAPPY_PIPE_WIDTH = 30;
const FLAPPY_BIRD_SIZE = 16;
const FLAPPY_TICK_MS = 40;
const FLAPPY_PIPE_SPEED = 3;
const FLAPPY_PIPE_SPACING = 130;

interface FlappyPipe {
  x: number;
  gapY: number;
  passed: boolean;
}

// Real-time physics (gravity + flap impulse), not a turn-based game like the others -- runs
// on a fixed-interval tick rather than requestAnimationFrame, matching how every other timed
// bit of behavior in this file (Simon's playback, the match-mismatch delay in MemoryGame)
// already uses setTimeout/setInterval. birdYRef/pipesRef/velocityRef hold the authoritative
// per-tick physics state; the matching useState calls exist only to trigger a re-render.
function FlappyBirdGame({ compact }: { compact: boolean }) {
  const playW = compact ? 160 : 220;
  const playH = compact ? 180 : 240;
  const birdX = Math.round(playW * 0.25);

  const birdYRef = useRef(playH / 2);
  const velocityRef = useRef(0);
  const pipesRef = useRef<FlappyPipe[]>([{ x: playW + 40, gapY: playH / 2, passed: false }]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [birdY, setBirdY] = useState(playH / 2);
  const [pipes, setPipes] = useState<FlappyPipe[]>(pipesRef.current);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');

  const stopLoop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const tick = () => {
    velocityRef.current += FLAPPY_GRAVITY;
    birdYRef.current += velocityRef.current;

    let newPipes = pipesRef.current.map((p) => ({ ...p, x: p.x - FLAPPY_PIPE_SPEED }));
    const last = newPipes[newPipes.length - 1];
    if (!last || last.x < playW - FLAPPY_PIPE_SPACING) {
      const margin = 40;
      const gapY = margin + Math.random() * (playH - margin * 2);
      newPipes = [...newPipes, { x: playW, gapY, passed: false }];
    }
    newPipes = newPipes.filter((p) => p.x > -FLAPPY_PIPE_WIDTH);

    let scoreDelta = 0;
    newPipes = newPipes.map((p) => {
      if (!p.passed && p.x + FLAPPY_PIPE_WIDTH < birdX) {
        scoreDelta += 1;
        return { ...p, passed: true };
      }
      return p;
    });
    if (scoreDelta) setScore((s) => s + scoreDelta);

    pipesRef.current = newPipes;
    setPipes(newPipes);

    let dead = birdYRef.current < 0 || birdYRef.current + FLAPPY_BIRD_SIZE > playH;
    for (const p of newPipes) {
      const birdLeft = birdX;
      const birdRight = birdX + FLAPPY_BIRD_SIZE;
      const pipeLeft = p.x;
      const pipeRight = p.x + FLAPPY_PIPE_WIDTH;
      if (birdRight > pipeLeft && birdLeft < pipeRight) {
        const gapTop = p.gapY - FLAPPY_PIPE_GAP / 2;
        const gapBottom = p.gapY + FLAPPY_PIPE_GAP / 2;
        if (birdYRef.current < gapTop || birdYRef.current + FLAPPY_BIRD_SIZE > gapBottom) dead = true;
      }
    }

    if (dead) {
      stopLoop();
      setPhase('gameover');
      return;
    }
    setBirdY(birdYRef.current);
  };

  const start = () => {
    birdYRef.current = playH / 2;
    velocityRef.current = 0;
    pipesRef.current = [{ x: playW + 40, gapY: playH / 2, passed: false }];
    setPipes(pipesRef.current);
    setBirdY(birdYRef.current);
    setScore(0);
    setPhase('playing');
    stopLoop();
    intervalRef.current = setInterval(tick, FLAPPY_TICK_MS);
  };

  const flap = () => {
    if (phase === 'ready' || phase === 'gameover') {
      start();
      return;
    }
    velocityRef.current = FLAPPY_FLAP;
  };

  useEffect(() => stopLoop, []);

  return (
    <Pressable style={styles.centerFill} onPress={flap}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        {phase === 'ready' ? 'Tap to start' : phase === 'gameover' ? `Game over — Score ${score}` : `Score: ${score}`}
      </Text>
      <View style={{ width: playW, height: playH, backgroundColor: '#BAE6FD', overflow: 'hidden', borderRadius: 8 }}>
        <View
          style={{
            position: 'absolute',
            left: birdX,
            top: birdY,
            width: FLAPPY_BIRD_SIZE,
            height: FLAPPY_BIRD_SIZE,
            backgroundColor: '#EAB308',
            borderRadius: FLAPPY_BIRD_SIZE / 2,
          }}
        />
        {pipes.map((p, i) => (
          <React.Fragment key={i}>
            <View
              style={{
                position: 'absolute',
                left: p.x,
                top: 0,
                width: FLAPPY_PIPE_WIDTH,
                height: Math.max(0, p.gapY - FLAPPY_PIPE_GAP / 2),
                backgroundColor: '#16A34A',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: p.x,
                top: p.gapY + FLAPPY_PIPE_GAP / 2,
                width: FLAPPY_PIPE_WIDTH,
                height: Math.max(0, playH - (p.gapY + FLAPPY_PIPE_GAP / 2)),
                backgroundColor: '#16A34A',
              }}
            />
          </React.Fragment>
        ))}
      </View>
    </Pressable>
  );
}

type TetrisPieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

interface TetrisPiece {
  type: TetrisPieceType;
  rotation: number;
  x: number;
  y: number;
}

const TETRIS_COLS = 8;
const TETRIS_ROWS = 14;
const TETRIS_BASE_TICK_MS = 700;

const TETRIS_COLORS: Record<TetrisPieceType, string> = {
  I: '#22D3EE',
  O: '#FACC15',
  T: '#A855F7',
  S: '#22C55E',
  Z: '#EF4444',
  J: '#3B82F6',
  L: '#F97316',
};

const TETRIS_SHAPES: Record<TetrisPieceType, number[][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

function tetrisRandomType(): TetrisPieceType {
  const types: TetrisPieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  return types[Math.floor(Math.random() * types.length)];
}

function tetrisSpawnPiece(): TetrisPiece {
  return { type: tetrisRandomType(), rotation: 0, x: Math.floor(TETRIS_COLS / 2) - 2, y: 0 };
}

function tetrisCells(piece: TetrisPiece): number[][] {
  return TETRIS_SHAPES[piece.type][piece.rotation].map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

function tetrisCollides(board: (TetrisPieceType | null)[][], piece: TetrisPiece): boolean {
  return tetrisCells(piece).some(([x, y]) => {
    if (x < 0 || x >= TETRIS_COLS || y >= TETRIS_ROWS) return true;
    if (y < 0) return false;
    return !!board[y][x];
  });
}

function tetrisEmptyBoard(): (TetrisPieceType | null)[][] {
  return Array.from({ length: TETRIS_ROWS }, () => Array(TETRIS_COLS).fill(null));
}

function tetrisLevelForLines(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

function TetrisGame({ compact }: { compact: boolean }) {
  const cellSize = compact ? 14 : 18;
  const playW = cellSize * TETRIS_COLS;
  const playH = cellSize * TETRIS_ROWS;

  const boardRef = useRef<(TetrisPieceType | null)[][]>(tetrisEmptyBoard());
  const pieceRef = useRef<TetrisPiece>(tetrisSpawnPiece());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesRef = useRef(0);

  const [displayBoard, setDisplayBoard] = useState<(TetrisPieceType | null)[][]>(boardRef.current);
  const [piece, setPiece] = useState<TetrisPiece>(pieceRef.current);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');

  const stopLoop = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const lockAndAdvance = (): boolean => {
    const board = boardRef.current;
    for (const [x, y] of tetrisCells(pieceRef.current)) {
      if (y >= 0 && y < TETRIS_ROWS && x >= 0 && x < TETRIS_COLS) board[y][x] = pieceRef.current.type;
    }
    let cleared = 0;
    const kept = board.filter((row) => {
      const full = row.every((cell) => cell !== null);
      if (full) cleared += 1;
      return !full;
    });
    while (kept.length < TETRIS_ROWS) kept.unshift(Array(TETRIS_COLS).fill(null));
    boardRef.current = kept;
    if (cleared > 0) {
      linesRef.current += cleared;
      const points = [0, 100, 300, 500, 800][cleared] * tetrisLevelForLines(linesRef.current - cleared);
      setScore((s) => s + points);
      setLevel(tetrisLevelForLines(linesRef.current));
    }
    const next = tetrisSpawnPiece();
    pieceRef.current = next;
    setDisplayBoard(boardRef.current.map((row) => [...row]));
    setPiece(next);
    if (tetrisCollides(boardRef.current, next)) {
      setPhase('gameover');
      stopLoop();
      return true;
    }
    return false;
  };

  const scheduleNext = () => {
    stopLoop();
    const delay = Math.max(150, TETRIS_BASE_TICK_MS - (tetrisLevelForLines(linesRef.current) - 1) * 60);
    timeoutRef.current = setTimeout(tick, delay);
  };

  const tick = () => {
    const moved = { ...pieceRef.current, y: pieceRef.current.y + 1 };
    let gameOver = false;
    if (tetrisCollides(boardRef.current, moved)) {
      gameOver = lockAndAdvance();
    } else {
      pieceRef.current = moved;
      setPiece(moved);
    }
    if (!gameOver) scheduleNext();
  };

  const start = () => {
    boardRef.current = tetrisEmptyBoard();
    linesRef.current = 0;
    const first = tetrisSpawnPiece();
    pieceRef.current = first;
    setDisplayBoard(boardRef.current.map((row) => [...row]));
    setPiece(first);
    setScore(0);
    setLevel(1);
    setPhase('playing');
    scheduleNext();
  };

  const move = (dx: number) => {
    if (phase !== 'playing') return;
    const moved = { ...pieceRef.current, x: pieceRef.current.x + dx };
    if (!tetrisCollides(boardRef.current, moved)) {
      pieceRef.current = moved;
      setPiece(moved);
    }
  };

  const rotate = () => {
    if (phase !== 'playing') return;
    const base = { ...pieceRef.current, rotation: (pieceRef.current.rotation + 1) % 4 };
    for (const kick of [0, -1, 1, -2, 2]) {
      const kicked = { ...base, x: base.x + kick };
      if (!tetrisCollides(boardRef.current, kicked)) {
        pieceRef.current = kicked;
        setPiece(kicked);
        return;
      }
    }
  };

  const softDrop = () => {
    if (phase !== 'playing') return;
    tick();
  };

  useEffect(() => stopLoop, []);

  const mergedGrid = useMemo(() => {
    const grid = displayBoard.map((row) => [...row]);
    if (phase === 'playing') {
      for (const [x, y] of tetrisCells(piece)) {
        if (y >= 0 && y < TETRIS_ROWS && x >= 0 && x < TETRIS_COLS) grid[y][x] = piece.type;
      }
    }
    return grid;
  }, [displayBoard, piece, phase]);

  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 13 }]}>
        {phase === 'ready' ? 'Tap Start to play' : phase === 'gameover' ? `Game over — Score ${score}` : `Score ${score} · Lvl ${level}`}
      </Text>
      <View style={{ width: playW, height: playH, backgroundColor: '#0F172A', borderRadius: 6, overflow: 'hidden' }}>
        {mergedGrid.map((row, ry) =>
          row.map((cell, rx) => (
            <View
              key={`${ry}-${rx}`}
              style={{
                position: 'absolute',
                left: rx * cellSize,
                top: ry * cellSize,
                width: cellSize - 1,
                height: cellSize - 1,
                backgroundColor: cell ? TETRIS_COLORS[cell] : '#1E293B',
                borderRadius: 2,
              }}
            />
          ))
        )}
      </View>
      {phase === 'playing' ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Pressable style={styles.tetrisBtn} onPress={() => move(-1)}>
            <Text style={styles.tetrisBtnText}>⬅</Text>
          </Pressable>
          <Pressable style={styles.tetrisBtn} onPress={rotate}>
            <Text style={styles.tetrisBtnText}>⟳</Text>
          </Pressable>
          <Pressable style={styles.tetrisBtn} onPress={softDrop}>
            <Text style={styles.tetrisBtnText}>⬇</Text>
          </Pressable>
          <Pressable style={styles.tetrisBtn} onPress={() => move(1)}>
            <Text style={styles.tetrisBtnText}>➡</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.smallResetBtn} onPress={start}>
          <Text style={styles.smallResetBtnText}>{phase === 'gameover' ? 'Play Again' : 'Start'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const TARGETRANGE_ROUND_SECONDS = 20;
const TARGETRANGE_DOT_SIZE = 34;

// The in-app editor has no real WebGL/native-GL pipeline (that would need expo-gl, a new
// native module requiring a fresh EAS build and carrying real App-Store-review risk), so this
// is a simplified 2D tap-the-dot stand-in just for previewing inside the editor -- the real
// Three.js 3D shooting range only renders once the site is published to a real browser.
function TargetRange3DPreview({ compact }: { compact: boolean }) {
  const playW = compact ? 160 : 220;
  const playH = compact ? 160 : 200;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [targetPos, setTargetPos] = useState({ x: playW / 2 - TARGETRANGE_DOT_SIZE / 2, y: playH / 2 - TARGETRANGE_DOT_SIZE / 2 });
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TARGETRANGE_ROUND_SECONDS);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'gameover'>('ready');

  const stopLoop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const randomizeTarget = () => {
    setTargetPos({
      x: Math.random() * (playW - TARGETRANGE_DOT_SIZE),
      y: Math.random() * (playH - TARGETRANGE_DOT_SIZE),
    });
  };

  const start = () => {
    setScore(0);
    setTimeLeft(TARGETRANGE_ROUND_SECONDS);
    setPhase('playing');
    randomizeTarget();
    stopLoop();
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          stopLoop();
          setPhase('gameover');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const hit = () => {
    if (phase !== 'playing') return;
    setScore((s) => s + 1);
    randomizeTarget();
  };

  useEffect(() => stopLoop, []);

  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 13 }]}>
        {phase === 'ready' ? 'Tap Start' : phase === 'gameover' ? `Time's up — Score ${score}` : `Score ${score} · ${timeLeft}s`}
      </Text>
      <View style={{ width: playW, height: playH, backgroundColor: '#1E293B', borderRadius: 8, overflow: 'hidden' }}>
        {phase === 'playing' && (
          <Pressable
            onPress={hit}
            style={{
              position: 'absolute',
              left: targetPos.x,
              top: targetPos.y,
              width: TARGETRANGE_DOT_SIZE,
              height: TARGETRANGE_DOT_SIZE,
              borderRadius: TARGETRANGE_DOT_SIZE / 2,
              backgroundColor: '#EF4444',
              borderWidth: 2,
              borderColor: '#FCA5A5',
            }}
          />
        )}
      </View>
      {phase !== 'playing' && (
        <Pressable style={styles.smallResetBtn} onPress={start}>
          <Text style={styles.smallResetBtnText}>{phase === 'gameover' ? 'Play Again' : 'Start'}</Text>
        </Pressable>
      )}
      <Text style={{ fontSize: 9, color: '#94A3B8', textAlign: 'center', marginTop: 4, paddingHorizontal: 6 }}>
        Simplified preview — the real 3D shooting range renders on your published site.
      </Text>
    </View>
  );
}

const TWO_PLAYER_KINDS = new Set(['tictactoe', 'connect4', 'rps']);

export default function GameView({ element, width, height }: { element: GameElement; width: number; height: number }) {
  const compact = width < 220 || height < 220;
  const [vsComputer, setVsComputer] = useState(true);
  const isTwoPlayerKind = TWO_PLAYER_KINDS.has(element.kind);

  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', padding: 8 }}>
      {!!element.title && (
        <Text style={[styles.gameTitle, { fontSize: compact ? 12 : 15 }]} numberOfLines={1}>
          {element.title}
        </Text>
      )}
      {isTwoPlayerKind && (
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, vsComputer && styles.modeBtnActive]} onPress={() => setVsComputer(true)}>
            <Text style={[styles.modeBtnText, vsComputer && styles.modeBtnTextActive]}>vs Computer</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, !vsComputer && styles.modeBtnActive]} onPress={() => setVsComputer(false)}>
            <Text style={[styles.modeBtnText, !vsComputer && styles.modeBtnTextActive]}>2 Players</Text>
          </Pressable>
        </View>
      )}
      <View style={{ flex: 1 }}>
        {element.kind === 'tictactoe' && <TicTacToeGame compact={compact} vsComputer={vsComputer} />}
        {element.kind === 'connect4' && <ConnectFourGame compact={compact} vsComputer={vsComputer} />}
        {element.kind === 'rps' && <RockPaperScissorsGame compact={compact} vsComputer={vsComputer} />}
        {element.kind === 'clicker' && <ClickerGame label={element.clickerLabel} target={element.clickerTarget} compact={compact} />}
        {element.kind === 'memory' && <MemoryGame symbols={element.memorySymbols} compact={compact} />}
        {element.kind === 'trivia' && <TriviaGame questions={element.questions} compact={compact} />}
        {element.kind === 'simon' && <SimonGame compact={compact} />}
        {element.kind === 'flappy' && <FlappyBirdGame compact={compact} />}
        {element.kind === 'tetris' && <TetrisGame compact={compact} />}
        {element.kind === 'targetrange3d' && <TargetRange3DPreview compact={compact} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gameTitle: { fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 4 },
  modeRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 6 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F5F9' },
  modeBtnActive: { backgroundColor: '#111827' },
  modeBtnText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  modeBtnTextActive: { color: '#FFFFFF' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { fontWeight: '700', color: '#334155' },
  tttCell: { borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  c4Cell: { borderWidth: 1, borderColor: '#93C5FD', backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  c4Disc: {},
  rpsBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  clickerBtn: { backgroundColor: '#4338CA', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  clickerBtnText: { color: '#FFFFFF', fontWeight: '800' },
  memoryCell: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', margin: 1 },
  smallResetBtn: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  smallResetBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  triviaQuestion: { fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 8, paddingHorizontal: 8 },
  triviaOption: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, marginBottom: 6, backgroundColor: '#F8FAFC' },
  tetrisBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  tetrisBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
