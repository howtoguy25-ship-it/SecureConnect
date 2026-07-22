import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { CategoryFieldSpec } from "@/config/categories";

interface Props {
  fields: CategoryFieldSpec[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function CategoryFieldForm({ fields, values, onChange }: Props) {
  return (
    <View>
      {fields.map((field) => (
        <View key={field.key} style={styles.fieldBlock}>
          <Text style={styles.label}>
            {field.label}
            {field.required ? " *" : ""}
          </Text>
          {field.inputType === "select" && field.options ? (
            <View style={styles.optionsRow}>
              {field.options.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.option, values[field.key] === opt && styles.optionActive]}
                  onPress={() => onChange(field.key, opt)}
                >
                  <Text style={[styles.optionText, values[field.key] === opt && styles.optionTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TextInput
              style={[styles.input, field.inputType === "multiline" && styles.multiline]}
              value={values[field.key] ?? ""}
              onChangeText={(v) => onChange(field.key, v)}
              keyboardType={field.inputType === "number" ? "numeric" : "default"}
              multiline={field.inputType === "multiline"}
              placeholder={field.label}
              placeholderTextColor="#6B7280"
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: { marginBottom: 14 },
  label: { color: "#9CA3AF", fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: "#1F2937",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1F2937" },
  optionActive: { backgroundColor: "#4F46E5" },
  optionText: { color: "#9CA3AF", fontSize: 13 },
  optionTextActive: { color: "#fff", fontWeight: "600" },
});
