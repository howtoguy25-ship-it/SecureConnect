import React, { useEffect, useMemo, useState } from 'react';
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
});
