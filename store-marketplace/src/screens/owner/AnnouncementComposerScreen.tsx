import React, { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { postAnnouncement } from "@/services/announcements";
import type { AnnouncementType } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "AnnouncementComposer">;

const TYPES: { value: AnnouncementType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "new_item", label: "New item" },
  { value: "promotion", label: "Promotion" },
  { value: "stock_update", label: "Stock update" },
];

export function AnnouncementComposerScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [type, setType] = useState<AnnouncementType>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!user) return;
    if (!title.trim() || !body.trim()) {
      Alert.alert("Title and message required");
      return;
    }
    setPosting(true);
    try {
      await postAnnouncement(businessId, {
        authorId: user.uid,
        authorName: user.displayName || "Team",
        type,
        title: title.trim(),
        body: body.trim(),
        pinned,
        notifyFollowers,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't post announcement", err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <TouchableOpacity key={t.value} style={[styles.typeChip, type === t.value && styles.typeChipActive]} onPress={() => setType(t.value)}>
            <Text style={[styles.typeChipText, type === t.value && styles.typeChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Back in stock this week!" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>Message</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={body}
        onChangeText={setBody}
        placeholder="What do you want your followers to know?"
        placeholderTextColor="#6B7280"
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Pin to top</Text>
        <Switch value={pinned} onValueChange={setPinned} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Send push notification to followers</Text>
        <Switch value={notifyFollowers} onValueChange={setNotifyFollowers} />
      </View>

      <TouchableOpacity style={styles.postButton} onPress={handlePost} disabled={posting}>
        {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postButtonText}>Post</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  label: { color: "#9CA3AF", fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: "#1F2937", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1F2937" },
  typeChipActive: { backgroundColor: "#4F46E5" },
  typeChipText: { color: "#9CA3AF", fontSize: 12 },
  typeChipTextActive: { color: "#fff", fontWeight: "600" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 },
  switchLabel: { color: "#E5E7EB", fontSize: 14, flexShrink: 1, marginRight: 12 },
  postButton: { backgroundColor: "#4F46E5", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 28, marginBottom: 40 },
  postButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
