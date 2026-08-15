import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RichTextRun } from '@/types';

const COLORS = ['#1E293B', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#2563EB', '#7C3AED', '#DB2777'];

// A segment-based rich text editor -- real bold/underline/color/link formatting without a
// full selection-based WYSIWYG (not realistic to build from scratch in plain React Native).
// The user types one chunk of text at a time, picks its formatting with the toolbar below,
// then taps Add -- each chunk becomes one real, individually-editable RichTextRun. A run with
// a link automatically renders underlined and blue, both here and on the published site,
// matching "insert a link and it becomes a real clickable link once saved."
export default function RichTextEditor({
  paragraphs,
  onChange,
}: {
  paragraphs: RichTextRun[][];
  onChange: (paragraphs: RichTextRun[][]) => void;
}) {
  const [draftText, setDraftText] = useState('');
  const [bold, setBold] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [editing, setEditing] = useState<{ pIndex: number; rIndex: number } | null>(null);

  const resetDraft = () => {
    setDraftText('');
    setBold(false);
    setUnderline(false);
    setColor(null);
    setLinkMode(false);
    setLinkUrl('');
    setEditing(null);
  };

  const startEdit = (pIndex: number, rIndex: number) => {
    const run = paragraphs[pIndex][rIndex];
    setDraftText(run.text);
    setBold(!!run.bold);
    setUnderline(!!run.underline);
    setColor(run.color ?? null);
    setLinkMode(!!run.link);
    setLinkUrl(run.link ?? '');
    setEditing({ pIndex, rIndex });
  };

  const deleteRun = (pIndex: number, rIndex: number) => {
    const next = paragraphs.map((p, i) => (i === pIndex ? p.filter((_, j) => j !== rIndex) : p)).filter((p, i) => p.length > 0 || paragraphs.length === 1);
    onChange(next.length > 0 ? next : [[]]);
    resetDraft();
  };

  const commit = () => {
    if (!draftText.trim()) return;
    const run: RichTextRun = {
      text: draftText,
      bold: bold || undefined,
      underline: underline || undefined,
      color: color || undefined,
      link: linkMode && linkUrl.trim() ? linkUrl.trim() : undefined,
    };
    if (editing) {
      const next = paragraphs.map((p, i) => (i === editing.pIndex ? p.map((r, j) => (j === editing.rIndex ? run : r)) : p));
      onChange(next);
    } else {
      const next = [...paragraphs];
      const lastIndex = next.length - 1;
      next[lastIndex] = [...(next[lastIndex] ?? []), run];
      onChange(next);
    }
    resetDraft();
  };

  const newParagraph = () => {
    onChange([...paragraphs, []]);
    resetDraft();
  };

  return (
    <View>
      <View style={styles.preview}>
        {paragraphs.map((paragraph, pIndex) => (
          <Text key={pIndex} style={styles.previewParagraph}>
            {paragraph.length === 0 && <Text style={styles.previewEmpty}>(empty paragraph)</Text>}
            {paragraph.map((run, rIndex) => (
              <Text
                key={rIndex}
                onPress={() => startEdit(pIndex, rIndex)}
                style={{
                  fontWeight: run.bold ? '700' : '400',
                  textDecorationLine: run.underline || run.link ? 'underline' : 'none',
                  color: run.link ? '#2563EB' : run.color || '#1E293B',
                  backgroundColor: editing?.pIndex === pIndex && editing?.rIndex === rIndex ? '#DBEAFE' : 'transparent',
                }}
              >
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
      </View>

      <View style={styles.toolbarRow}>
        <Pressable style={[styles.toolBtn, bold && styles.toolBtnActive]} onPress={() => setBold((v) => !v)}>
          <Text style={[styles.toolBtnText, { fontWeight: '800' }]}>B</Text>
        </Pressable>
        <Pressable style={[styles.toolBtn, underline && styles.toolBtnActive]} onPress={() => setUnderline((v) => !v)}>
          <Text style={[styles.toolBtnText, { textDecorationLine: 'underline' }]}>U</Text>
        </Pressable>
        <Pressable
          style={[styles.toolBtn, linkMode && styles.toolBtnActive]}
          onPress={() => setLinkMode((v) => !v)}
        >
          <Ionicons name="link" size={15} color={linkMode ? '#2563EB' : '#334155'} />
        </Pressable>
        {editing && (
          <Pressable style={styles.toolBtn} onPress={() => deleteRun(editing.pIndex, editing.rIndex)}>
            <Ionicons name="trash-outline" size={15} color="#DC2626" />
          </Pressable>
        )}
      </View>

      <View style={styles.colorRow}>
        <Pressable
          style={[styles.colorSwatch, { backgroundColor: '#94A3B8' }, color === null && styles.colorSwatchSelected]}
          onPress={() => setColor(null)}
        />
        {COLORS.map((c) => (
          <Pressable
            key={c}
            style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchSelected]}
            onPress={() => setColor(c)}
          />
        ))}
      </View>

      {linkMode && (
        <TextInput
          style={styles.linkInput}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://example.com, mailto:you@site.com, or tel:+15551234567"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      )}

      <View style={styles.composeRow}>
        <TextInput
          style={styles.composeInput}
          value={draftText}
          onChangeText={setDraftText}
          placeholder={linkMode ? 'Link display text' : 'Type text, then tap Add'}
          placeholderTextColor="#94A3B8"
          multiline
        />
        <Pressable style={styles.addBtn} onPress={commit}>
          <Text style={styles.addBtnText}>{editing ? 'Update' : 'Add'}</Text>
        </Pressable>
      </View>
      {editing && (
        <Pressable onPress={resetDraft}>
          <Text style={styles.cancelEditText}>Cancel edit</Text>
        </Pressable>
      )}

      <Pressable style={styles.newParagraphBtn} onPress={newParagraph}>
        <Ionicons name="return-down-forward" size={14} color="#334155" />
        <Text style={styles.newParagraphText}>New paragraph</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    minHeight: 80,
    backgroundColor: '#FFFFFF',
  },
  previewParagraph: { marginBottom: 10, fontSize: 14, lineHeight: 21 },
  previewEmpty: { color: '#CBD5E1', fontStyle: 'italic', fontSize: 13 },
  toolbarRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  toolBtnActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  toolBtnText: { fontSize: 14, color: '#334155' },
  colorRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  colorSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#00000022' },
  colorSwatchSelected: { borderWidth: 2, borderColor: '#0F172A' },
  linkInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  composeRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  composeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 100,
  },
  addBtn: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  cancelEditText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginTop: 6 },
  newParagraphBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  newParagraphText: { color: '#334155', fontSize: 13, fontWeight: '600' },
});
