import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { getBusiness } from "@/services/businesses";
import { createStockItem, updateStockItem, getStockItem } from "@/services/stock";
import { uploadBusinessImage } from "@/services/storage";
import { getCategory } from "@/config/categories";
import { CategoryFieldForm } from "@/components/CategoryFieldForm";
import type { StockStatus } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "StockEditor">;

const STOCK_STATUSES: { value: StockStatus; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "coming_soon", label: "Coming soon" },
];

export function StockEditorScreen({ route, navigation }: Props) {
  const { businessId, itemId } = route.params;
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<StockStatus>("in_stock");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const business = await getBusiness(businessId);
      setCategoryId(business?.categoryId ?? "other");
      if (itemId) {
        const item = await getStockItem(businessId, itemId);
        if (item) {
          setName(item.name);
          setPrice(item.price != null ? String(item.price) : "");
          setStatus(item.stockStatus);
          setFields(item.fields || {});
          setImageUrl(item.imageUrl);
        }
        navigation.setOptions({ title: item?.name ?? "Item" });
      } else {
        navigation.setOptions({ title: "New item" });
      }
      setLoading(false);
    })();
  }, [businessId, itemId]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!user || !categoryId) return;
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (localImageUri) {
        finalImageUrl = await uploadBusinessImage(businessId, "stockItem", localImageUri, `${Date.now()}.jpg`);
      }

      const input = {
        categoryId,
        name: name.trim(),
        price: price.trim() ? Number(price) : null,
        currency: "USD",
        stockStatus: status,
        imageUrl: finalImageUrl,
        fields,
        updatedBy: user.uid,
      };

      if (itemId) {
        await updateStockItem(businessId, itemId, input);
      } else {
        await createStockItem(businessId, input);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save item", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !categoryId) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />
      </View>
    );
  }

  const category = getCategory(categoryId);
  const displayImage = localImageUri || imageUrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="camera-outline" size={28} color="#6B7280" />
            <Text style={styles.imagePlaceholderText}>Add photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>{category.itemNounSingular} name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={category.itemNounSingular} placeholderTextColor="#6B7280" />

      <Text style={styles.label}>Price (leave blank if not priced)</Text>
      <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>Availability</Text>
      <View style={styles.statusRow}>
        {STOCK_STATUSES.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.statusChip, status === s.value && styles.statusChipActive]}
            onPress={() => setStatus(s.value)}
          >
            <Text style={[styles.statusChipText, status === s.value && styles.statusChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginTop: 16 }}>
        <CategoryFieldForm
          fields={category.itemFields}
          values={fields}
          onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  imagePicker: { alignSelf: "center", marginBottom: 20 },
  image: { width: 120, height: 120, borderRadius: 12 },
  imagePlaceholder: { backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center", gap: 4 },
  imagePlaceholderText: { color: "#6B7280", fontSize: 11 },
  label: { color: "#9CA3AF", fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: "#1F2937", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1F2937" },
  statusChipActive: { backgroundColor: "#4F46E5" },
  statusChipText: { color: "#9CA3AF", fontSize: 12 },
  statusChipTextActive: { color: "#fff", fontWeight: "600" },
  saveButton: { backgroundColor: "#4F46E5", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24, marginBottom: 40 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
