import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { CATEGORIES } from "@/config/categories";
import { createBusiness } from "@/services/businesses";
import { createStockItem } from "@/services/stock";
import { draftStoreProfile } from "@/services/aiOnboarding";
import type { AiStoreDraft } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "BusinessOnboarding">;

export function BusinessOnboardingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { location } = useLocation();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [openedDate, setOpenedDate] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [draft, setDraft] = useState<AiStoreDraft | null>(null);
  const [includedItems, setIncludedItems] = useState<Record<number, boolean>>({});

  const [creating, setCreating] = useState(false);

  async function handleAiAssist() {
    if (!name.trim() || !address.trim()) {
      Alert.alert("Name and address needed", "Enter your business name and address first so the AI knows what to look for.");
      return;
    }
    setAiLoading(true);
    try {
      const result = await draftStoreProfile({ businessName: name, address, categoryId });
      setDraft(result);
      setIncludedItems(Object.fromEntries(result.suggestedItems.map((_, i) => [i, true])));
    } catch (err) {
      Alert.alert(
        "AI assist unavailable",
        err instanceof Error ? err.message : "Couldn't reach the AI research service -- you can still fill this in yourself."
      );
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiDescriptionAndCategory() {
    if (!draft) return;
    setDescription(draft.suggestedDescription);
    if (CATEGORIES.some((c) => c.id === draft.suggestedCategoryId)) {
      setCategoryId(draft.suggestedCategoryId);
    }
  }

  async function handleCreate() {
    if (!user) return;
    if (!name.trim() || !address.trim()) {
      Alert.alert("Missing details", "Business name and address are required.");
      return;
    }
    setCreating(true);
    try {
      const businessId = await createBusiness({
        ownerId: user.uid,
        ownerDisplayName: user.displayName || "Owner",
        name: name.trim(),
        categoryId,
        description: description.trim(),
        address: address.trim(),
        location: location
          ? { lat: location.coords.latitude, lng: location.coords.longitude }
          : { lat: 0, lng: 0 },
        openedDate: openedDate.trim() || undefined,
      });

      if (draft) {
        const itemsToCreate = draft.suggestedItems.filter((_, i) => includedItems[i]);
        await Promise.all(
          itemsToCreate.map((item) =>
            createStockItem(businessId, {
              categoryId,
              name: item.name,
              price: item.price,
              currency: "USD",
              stockStatus: "in_stock",
              fields: item.fields,
              updatedBy: user.uid,
            })
          )
        );
      }

      navigation.replace("BusinessVerification", { businessId });
    } catch (err) {
      Alert.alert("Couldn't create business", err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>Business name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Sunny Side Creamery" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.categoryChip, categoryId === c.id && styles.categoryChipActive]}
            onPress={() => setCategoryId(c.id)}
          >
            <Ionicons name={c.icon as any} size={16} color={categoryId === c.id ? "#fff" : "#9CA3AF"} />
            <Text style={[styles.categoryChipText, categoryId === c.id && styles.categoryChipTextActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street, city, state" placeholderTextColor="#6B7280" />
      <Text style={styles.hint}>
        {location ? "Your current location will be used to place this store on the map." : "Enable location for accurate placement, or it'll default to (0, 0) until edited later."}
      </Text>

      <Text style={styles.label}>Opened date (optional)</Text>
      <TextInput style={styles.input} value={openedDate} onChangeText={setOpenedDate} placeholder="YYYY-MM-DD" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What makes your store worth following?"
        placeholderTextColor="#6B7280"
        multiline
      />

      <TouchableOpacity style={styles.aiButton} onPress={handleAiAssist} disabled={aiLoading}>
        {aiLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.aiButtonText}>Ask AI to research my store</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.hint}>
        Looks up public info about your business online and drafts a description and starter item list for
        you to review -- nothing is published until you confirm it below and hit Create.
      </Text>

      {draft && (
        <View style={styles.draftBox}>
          <Text style={styles.draftTitle}>AI draft</Text>
          <Text style={styles.draftDescription}>{draft.suggestedDescription || "No description found."}</Text>
          <TouchableOpacity onPress={applyAiDescriptionAndCategory}>
            <Text style={styles.draftApplyLink}>Use this description & category</Text>
          </TouchableOpacity>

          {draft.suggestedItems.length > 0 ? (
            <>
              <Text style={styles.draftItemsHeader}>Suggested items -- untick any you don't want to add</Text>
              {draft.suggestedItems.map((item, i) => (
                <View key={i} style={styles.draftItemRow}>
                  <Switch
                    value={!!includedItems[i]}
                    onValueChange={(v) => setIncludedItems((prev) => ({ ...prev, [i]: v }))}
                  />
                  <Text style={styles.draftItemText}>
                    {item.name}
                    {item.price != null ? ` — $${item.price.toFixed(2)}` : ""}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.draftEmptyItems}>No specific items found -- add your own after creating.</Text>
          )}
          <Text style={styles.draftSourceNotes}>{draft.sourceNotes}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.createButton} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create business</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  label: { color: "#9CA3AF", fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: "#1F2937",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  hint: { color: "#6B7280", fontSize: 12, marginTop: 6 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1F2937",
  },
  categoryChipActive: { backgroundColor: "#4F46E5" },
  categoryChipText: { color: "#9CA3AF", fontSize: 12 },
  categoryChipTextActive: { color: "#fff", fontWeight: "600" },
  aiButton: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 20,
  },
  aiButtonText: { color: "#fff", fontWeight: "600" },
  draftBox: { backgroundColor: "#1F2937", borderRadius: 12, padding: 14, marginTop: 16 },
  draftTitle: { color: "#818CF8", fontSize: 12, textTransform: "uppercase", marginBottom: 6 },
  draftDescription: { color: "#E5E7EB", fontSize: 13 },
  draftApplyLink: { color: "#818CF8", fontSize: 13, marginTop: 8, fontWeight: "600" },
  draftItemsHeader: { color: "#9CA3AF", fontSize: 12, marginTop: 14, marginBottom: 6 },
  draftItemRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  draftItemText: { color: "#fff", fontSize: 13, flexShrink: 1 },
  draftEmptyItems: { color: "#6B7280", fontSize: 12, marginTop: 10 },
  draftSourceNotes: { color: "#6B7280", fontSize: 11, marginTop: 10, fontStyle: "italic" },
  createButton: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 40,
  },
  createButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
