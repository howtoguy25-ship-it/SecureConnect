import React, { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, FlatList, Pressable, ActivityIndicator, Modal, ScrollView } from "react-native";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";

interface GifPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
}

interface GifResult {
  id: string;
  media_formats: {
    gif: { url: string };
    tinygif: { url: string };
  };
}

const CATEGORIES = [
  { id: "trending", label: "Trending", query: "" },
  { id: "funny", label: "Funny", query: "funny" },
  { id: "reactions", label: "Reactions", query: "reaction" },
  { id: "love", label: "Love", query: "love heart" },
  { id: "happy", label: "Happy", query: "happy excited" },
  { id: "sad", label: "Sad", query: "sad crying" },
  { id: "celebrate", label: "Celebrate", query: "celebrate party" },
  { id: "thanks", label: "Thanks", query: "thank you" },
  { id: "yes", label: "Yes", query: "yes agree" },
  { id: "no", label: "No", query: "no nope" },
  { id: "applause", label: "Applause", query: "clapping applause" },
  { id: "facepalm", label: "Facepalm", query: "facepalm" },
  { id: "highfive", label: "High Five", query: "high five" },
  { id: "dance", label: "Dance", query: "dancing" },
  { id: "thinking", label: "Thinking", query: "thinking hmm" },
  { id: "shocked", label: "Shocked", query: "shocked surprised" },
];

export function GifPicker({ visible, onClose, onSelectGif }: GifPickerProps) {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("trending");

  useEffect(() => {
    if (visible) {
      setSelectedCategory("trending");
      setSearchQuery("");
      fetchTrending();
    }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const timer = setTimeout(() => searchGifs(searchQuery), 500);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  // Single fetcher that surfaces real failure reasons in-UI instead of a
  // mysterious "No GIFs found" — that empty state was hiding 401s, 503s
  // (no provider configured), and provider 4xx errors.
  const loadGifs = async (path: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const token = await getStoredToken();
      const response = await fetch(`${getApiUrl()}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({} as any));
        const reason =
          body?.error ||
          (response.status === 401
            ? "Please sign in again to load GIFs."
            : response.status === 503
              ? "GIF service isn't configured. Add GIPHY_API_KEY or TENOR_API_KEY."
              : `Server returned ${response.status}.`);
        setErrorMsg(reason);
        setGifs([]);
        return;
      }
      const data = await response.json();
      const results: GifResult[] = data.results || [];
      setGifs(results);
      if (results.length === 0) setErrorMsg("No GIFs found.");
    } catch (error: any) {
      console.error("GIF fetch failed:", error);
      setErrorMsg(error?.message || "Network error. Check your connection.");
      setGifs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrending = () => loadGifs("/api/gifs/trending?limit=40");
  const searchGifs = (query: string) => {
    if (!query.trim()) return;
    return loadGifs(`/api/gifs/search?q=${encodeURIComponent(query)}&limit=40`);
  };

  const handleCategorySelect = (category: typeof CATEGORIES[0]) => {
    setSelectedCategory(category.id);
    setSearchQuery("");
    if (category.id === "trending") {
      fetchTrending();
    } else {
      searchGifs(category.query);
    }
  };

  const handleSelectGif = (gif: GifResult) => {
    const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url;
    if (gifUrl) {
      onSelectGif(gifUrl);
      onClose();
      setSearchQuery("");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.header}>
            <ThemedText type="h3">GIFs</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search GIFs..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.length === 0) {
                  handleCategorySelect(CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0]);
                }
              }}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => {
                setSearchQuery("");
                handleCategorySelect(CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0]);
              }}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Sticky-style chip row: lives in its own fixed-height slot so
              the FlatList below it (which takes flex: 1) can never overlap
              or scroll under it. On native, RN doesn't honor position:
              sticky, but the parent is already a flex column so a fixed
              chip slot + flex-1 list achieves the same separation. */}
          <View style={[styles.categoriesSlot, { backgroundColor: theme.backgroundDefault, borderBottomColor: theme.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesContent}
            >
              {CATEGORIES.map((category) => (
                <Pressable
                  key={category.id}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selectedCategory === category.id ? theme.primary : theme.backgroundSecondary,
                    }
                  ]}
                  onPress={() => handleCategorySelect(category)}
                >
                  <ThemedText
                    style={[
                      styles.categoryText,
                      { color: selectedCategory === category.id ? "#FFFFFF" : theme.text }
                    ]}
                  >
                    {category.label}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={gifs}
              numColumns={2}
              keyExtractor={(item) => item.id}
              style={styles.grid}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => (
                <Pressable style={styles.gifItem} onPress={() => handleSelectGif(item)}>
                  <Image
                    source={{ uri: item.media_formats?.tinygif?.url }}
                    style={styles.gifImage}
                    contentFit="cover"
                  />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Feather
                    name={errorMsg ? "alert-circle" : "image"}
                    size={32}
                    color={theme.textSecondary}
                    style={{ marginBottom: Spacing.sm }}
                  />
                  <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                    {errorMsg || "No GIFs found"}
                  </ThemedText>
                  {errorMsg ? (
                    <Pressable
                      onPress={() => {
                        if (searchQuery) searchGifs(searchQuery);
                        else handleCategorySelect(
                          CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0],
                        );
                      }}
                      style={{ marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: theme.primary, borderRadius: BorderRadius.full }}
                    >
                      <ThemedText style={{ color: "#fff", fontWeight: "600" }}>Try again</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          )}

          <View style={[styles.poweredBy, { borderTopColor: theme.border }]}>
            <ThemedText style={[styles.poweredByText, { color: theme.textSecondary }]}>
              Powered by Tenor
            </ThemedText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    height: "80%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  categoriesSlot: {
    // Fixed slot above the grid. Height = chip padding (8+8) + line height
    // (~20) = ~36–40px; bump to 48 to leave breathing room and add a 1px
    // hairline divider so the boundary is unambiguous on every theme.
    height: 48,
    marginBottom: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    zIndex: 2,
  },
  categoriesContent: {
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  grid: {
    flex: 1,
    zIndex: 1,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loader: {
    marginTop: Spacing.xl,
  },
  gridContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  gifItem: {
    flex: 1,
    margin: Spacing.xs,
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  gifImage: {
    width: "100%",
    height: "100%",
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  poweredBy: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderTopWidth: 1,
  },
  poweredByText: {
    fontSize: 12,
  },
});
