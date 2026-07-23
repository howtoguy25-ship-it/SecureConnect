import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { GameElement } from '@/types';

// Four real, playable mini-games -- not mockups. Each works standalone off just the
// GameElement's own data, so the exact same rules/state machine described here is mirrored in
// plain JS for the published site (see siteHtml.ts's renderGameHtml), just translated from RN
// components to DOM manipulation.

function TicTacToeGame({ compact }: { compact: boolean }) {
  const [board, setBoard] = useState<(null | 'X' | 'O')[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const winner = LINES.map(([a, b, c]) => (board[a] && board[a] === board[b] && board[a] === board[c] ? board[a] : null)).find(Boolean) ?? null;
  const draw = !winner && board.every((c) => c !== null);

  const tap = (i: number) => {
    if (board[i] || winner) return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setTurn(turn === 'X' ? 'O' : 'X');
  };
  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn('X');
  };

  const cell = compact ? 26 : 44;
  return (
    <View style={styles.centerFill}>
      <Text style={[styles.statusText, { fontSize: compact ? 11 : 14 }]}>
        {winner ? `${winner} wins!` : draw ? "It's a draw!" : `${turn}'s turn`}
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

export default function GameView({ element, width, height }: { element: GameElement; width: number; height: number }) {
  const compact = width < 220 || height < 220;
  return (
    <View style={{ width, height, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', padding: 8 }}>
      {!!element.title && (
        <Text style={[styles.gameTitle, { fontSize: compact ? 12 : 15 }]} numberOfLines={1}>
          {element.title}
        </Text>
      )}
      <View style={{ flex: 1 }}>
        {element.kind === 'tictactoe' && <TicTacToeGame compact={compact} />}
        {element.kind === 'clicker' && <ClickerGame label={element.clickerLabel} target={element.clickerTarget} compact={compact} />}
        {element.kind === 'memory' && <MemoryGame symbols={element.memorySymbols} compact={compact} />}
        {element.kind === 'trivia' && <TriviaGame questions={element.questions} compact={compact} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gameTitle: { fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 4 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { fontWeight: '700', color: '#334155' },
  tttCell: { borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  clickerBtn: { backgroundColor: '#4338CA', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  clickerBtnText: { color: '#FFFFFF', fontWeight: '800' },
  memoryCell: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', margin: 1 },
  smallResetBtn: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  smallResetBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  triviaQuestion: { fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 8, paddingHorizontal: 8 },
  triviaOption: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 8, marginBottom: 6, backgroundColor: '#F8FAFC' },
});
