import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

type GameType = "tap-reflex" | "memory-match" | "cipher-puzzle" | null;

interface GameCardProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  gradientColors: [string, string];
  onPress: () => void;
}

function GameCard({ icon, title, description, gradientColors, onPress }: GameCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.gameCard,
        { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <LinearGradient
        colors={gradientColors}
        style={styles.gameIconContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Feather name={icon} size={32} color="#FFFFFF" />
      </LinearGradient>
      <Text style={[styles.gameTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.gameDescription, { color: theme.textSecondary }]}>{description}</Text>
    </Pressable>
  );
}

function TapReflexGame({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [gameState, setGameState] = useState<"waiting" | "ready" | "tap" | "result">("waiting");
  const [startTime, setStartTime] = useState(0);
  const [reactionTime, setReactionTime] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const scale = useSharedValue(1);

  const startGame = () => {
    setGameState("ready");
    const delay = Math.random() * 3000 + 1500;
    setTimeout(() => {
      setStartTime(Date.now());
      setGameState("tap");
    }, delay);
  };

  const handleTap = () => {
    if (gameState === "tap") {
      const time = Date.now() - startTime;
      setReactionTime(time);
      if (!bestTime || time < bestTime) {
        setBestTime(time);
      }
      scale.value = withSequence(
        withSpring(1.2),
        withSpring(1)
      );
      setGameState("result");
    } else if (gameState === "ready") {
      setGameState("waiting");
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getColor = () => {
    switch (gameState) {
      case "waiting": return theme.primary;
      case "ready": return "#EF4444";
      case "tap": return "#22C55E";
      case "result": return theme.primary;
    }
  };

  const getMessage = () => {
    switch (gameState) {
      case "waiting": return "Tap to Start";
      case "ready": return "Wait...";
      case "tap": return "TAP NOW!";
      case "result": return `${reactionTime}ms`;
    }
  };

  return (
    <View style={[styles.gameContainer, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.gameHeader, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.gameHeaderTitle, { color: theme.text }]}>Tap Reflex</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.gameContent}>
        {bestTime && (
          <Text style={[styles.bestTimeText, { color: theme.textSecondary }]}>
            Best: {bestTime}ms
          </Text>
        )}

        <Pressable
          onPress={gameState === "waiting" || gameState === "result" ? startGame : handleTap}
          style={styles.tapArea}
        >
          <Animated.View
            style={[
              styles.tapCircle,
              { backgroundColor: getColor() },
              animatedStyle,
            ]}
          >
            <Text style={styles.tapText}>{getMessage()}</Text>
          </Animated.View>
        </Pressable>

        {gameState === "result" && (
          <Text style={[styles.resultHint, { color: theme.textSecondary }]}>
            Tap the circle to try again
          </Text>
        )}
      </View>
    </View>
  );
}

function MemoryMatchGame({ onBack, cardSize }: { onBack: () => void; cardSize: number }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<{ id: number; icon: string; isFlipped: boolean; isMatched: boolean }[]>([]);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const icons = ["heart", "star", "sun", "moon", "cloud", "zap", "music", "camera"];

  const initializeGame = useCallback(() => {
    const shuffled = [...icons, ...icons]
      .sort(() => Math.random() - 0.5)
      .map((icon, index) => ({
        id: index,
        icon,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(shuffled);
    setSelectedCards([]);
    setMoves(0);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const handleCardPress = (cardId: number) => {
    if (selectedCards.length >= 2) return;
    if (cards[cardId].isFlipped || cards[cardId].isMatched) return;

    const newCards = [...cards];
    newCards[cardId].isFlipped = true;
    setCards(newCards);

    const newSelected = [...selectedCards, cardId];
    setSelectedCards(newSelected);

    if (newSelected.length === 2) {
      setMoves((m) => m + 1);
      const [first, second] = newSelected;
      if (cards[first].icon === cards[second].icon) {
        setTimeout(() => {
          const matchedCards = [...cards];
          matchedCards[first].isMatched = true;
          matchedCards[second].isMatched = true;
          setCards(matchedCards);
          setSelectedCards([]);

          if (matchedCards.every((c) => c.isMatched)) {
            setIsComplete(true);
          }
        }, 300);
      } else {
        setTimeout(() => {
          const resetCards = [...cards];
          resetCards[first].isFlipped = false;
          resetCards[second].isFlipped = false;
          setCards(resetCards);
          setSelectedCards([]);
        }, 1000);
      }
    }
  };

  return (
    <View style={[styles.gameContainer, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.gameHeader, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.gameHeaderTitle, { color: theme.text }]}>Memory Match</Text>
        <Pressable style={styles.backButton} onPress={initializeGame}>
          <Feather name="refresh-cw" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.gameContent}>
        <Text style={[styles.movesText, { color: theme.textSecondary }]}>Moves: {moves}</Text>

        {isComplete ? (
          <View style={styles.completeContainer}>
            <Feather name="award" size={64} color="#F59E0B" />
            <Text style={[styles.completeText, { color: theme.text }]}>
              You Won!
            </Text>
            <Text style={[styles.completeSubtext, { color: theme.textSecondary }]}>
              Completed in {moves} moves
            </Text>
            <Pressable
              style={[styles.playAgainButton, { backgroundColor: theme.primary }]}
              onPress={initializeGame}
            >
              <Text style={styles.playAgainText}>Play Again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardsGrid}>
            {cards.map((card) => (
              <Pressable
                key={card.id}
                style={[
                  styles.memoryCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    backgroundColor: card.isFlipped || card.isMatched
                      ? theme.primary
                      : theme.backgroundSecondary,
                  },
                ]}
                onPress={() => handleCardPress(card.id)}
              >
                {(card.isFlipped || card.isMatched) && (
                  <Feather
                    name={card.icon as keyof typeof Feather.glyphMap}
                    size={28}
                    color="#FFFFFF"
                  />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function CipherPuzzleGame({ onBack }: { onBack: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentWord, setCurrentWord] = useState("");
  const [encodedWord, setEncodedWord] = useState("");
  const [userGuess, setUserGuess] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);

  const words = ["SECURE", "ENCRYPT", "PRIVACY", "SECRET", "CIPHER", "DECODE", "HIDDEN", "PROTECT"];

  const encodeWord = (word: string, shift: number) => {
    return word
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      })
      .join("");
  };

  const startGame = useCallback(() => {
    const word = words[Math.floor(Math.random() * words.length)];
    const shift = Math.floor(Math.random() * 5) + 1;
    setCurrentWord(word);
    setEncodedWord(encodeWord(word, shift));
    setUserGuess([]);
    setTimeLeft(30);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!isPlaying || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setIsPlaying(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, timeLeft]);

  const handleLetterPress = (letter: string) => {
    if (userGuess.length >= currentWord.length) return;

    const newGuess = [...userGuess, letter];
    setUserGuess(newGuess);

    if (newGuess.length === currentWord.length) {
      if (newGuess.join("") === currentWord) {
        setScore((s) => s + 10);
        setTimeout(startGame, 500);
      } else {
        setUserGuess([]);
      }
    }
  };

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <View style={[styles.gameContainer, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.gameHeader, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.gameHeaderTitle, { color: theme.text }]}>Cipher Puzzle</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.gameContent}>
        {!isPlaying ? (
          <View style={styles.startContainer}>
            <Feather name="lock" size={64} color={theme.primary} />
            <Text style={[styles.cipherTitle, { color: theme.text }]}>
              Decode the Message
            </Text>
            <Text style={[styles.cipherSubtitle, { color: theme.textSecondary }]}>
              Decode encrypted words before time runs out
            </Text>
            {score > 0 && (
              <Text style={[styles.finalScore, { color: theme.primary }]}>
                Last Score: {score}
              </Text>
            )}
            <Pressable
              style={[styles.startButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                setScore(0);
                startGame();
              }}
            >
              <Text style={styles.startButtonText}>Start Game</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.cipherHeader}>
              <Text style={[styles.timerText, { color: timeLeft <= 10 ? "#EF4444" : theme.textSecondary }]}>
                Time: {timeLeft}s
              </Text>
              <Text style={[styles.scoreText, { color: theme.primary }]}>Score: {score}</Text>
            </View>

            <View style={styles.encodedContainer}>
              <Text style={[styles.encodedLabel, { color: theme.textSecondary }]}>Encoded:</Text>
              <Text style={[styles.encodedWord, { color: theme.text }]}>{encodedWord}</Text>
            </View>

            <View style={styles.guessContainer}>
              {currentWord.split("").map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.guessBox,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.guessLetter, { color: theme.text }]}>
                    {userGuess[index] || ""}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.keyboardContainer}>
              {alphabet.map((letter) => (
                <Pressable
                  key={letter}
                  style={[styles.keyboardKey, { backgroundColor: theme.backgroundSecondary }]}
                  onPress={() => handleLetterPress(letter)}
                >
                  <Text style={[styles.keyboardLetter, { color: theme.text }]}>{letter}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.clearButton, { borderColor: theme.border }]}
              onPress={() => setUserGuess([])}
            >
              <Text style={[styles.clearButtonText, { color: theme.text }]}>Clear</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

export default function MiniGamesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeGame, setActiveGame] = useState<GameType>(null);
  const { width: screenWidth } = useWindowDimensions();
  const cardSize = (screenWidth - Spacing.lg * 3) / 4;

  if (activeGame === "tap-reflex") {
    return <TapReflexGame onBack={() => setActiveGame(null)} />;
  }

  if (activeGame === "memory-match") {
    return <MemoryMatchGame onBack={() => setActiveGame(null)} cardSize={cardSize} />;
  }

  if (activeGame === "cipher-puzzle") {
    return <CipherPuzzleGame onBack={() => setActiveGame(null)} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.headerBackButton} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Mini Games</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <GameCard
          icon="zap"
          title="Tap Reflex"
          description="Test your reaction speed"
          gradientColors={["#8B5CF6", "#6366F1"]}
          onPress={() => setActiveGame("tap-reflex")}
        />

        <GameCard
          icon="grid"
          title="Memory Match"
          description="Match pairs of cards"
          gradientColors={["#22C55E", "#10B981"]}
          onPress={() => setActiveGame("memory-match")}
        />

        <GameCard
          icon="lock"
          title="Cipher Puzzle"
          description="Decode encrypted words"
          gradientColors={["#F59E0B", "#EF4444"]}
          onPress={() => setActiveGame("cipher-puzzle")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerBackButton: {
    marginRight: Spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  gameCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  gameIconContainer: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  gameTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  gameDescription: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  gameContainer: {
    flex: 1,
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  gameHeaderTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  gameContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  bestTimeText: {
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  tapArea: {
    alignItems: "center",
    justifyContent: "center",
  },
  tapCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  tapText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  resultHint: {
    marginTop: Spacing.xl,
    fontSize: 14,
  },
  movesText: {
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  memoryCard: {
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  completeContainer: {
    alignItems: "center",
  },
  completeText: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: Spacing.lg,
  },
  completeSubtext: {
    fontSize: 16,
    marginTop: Spacing.sm,
  },
  playAgainButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  playAgainText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  startContainer: {
    alignItems: "center",
  },
  cipherTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: Spacing.lg,
  },
  cipherSubtitle: {
    fontSize: 16,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  finalScore: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  startButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  startButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  cipherHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: Spacing.lg,
  },
  timerText: {
    fontSize: 16,
    fontWeight: "600",
  },
  scoreText: {
    fontSize: 16,
    fontWeight: "600",
  },
  encodedContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  encodedLabel: {
    fontSize: 14,
    marginBottom: Spacing.xs,
  },
  encodedWord: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 4,
  },
  guessContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  guessBox: {
    width: 40,
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  guessLetter: {
    fontSize: 24,
    fontWeight: "700",
  },
  keyboardContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    maxWidth: 320,
  },
  keyboardKey: {
    width: 36,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  keyboardLetter: {
    fontSize: 16,
    fontWeight: "600",
  },
  clearButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
