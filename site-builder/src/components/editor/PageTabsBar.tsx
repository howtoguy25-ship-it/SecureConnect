import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { GradientFill, SitePage } from '@/types';
import GradientPickerRow from '@/components/inspector/GradientPickerRow';

// Lets a manually-built website have real, connected multiple pages (Home, About,
// Contact, ...) -- see EditorContext's page CRUD functions. Only ever rendered when
// project.pages exists (Social/Logo/Video projects, and every project built before this
// feature existed, never show this bar at all).
export default function PageTabsBar({
  pages,
  activePageId,
  onSwitch,
  onAdd,
  onRename,
  onRemove,
  onSetBackground,
}: {
  pages: SitePage[];
  activePageId: string | null;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onSetBackground: (id: string, patch: { backgroundColor?: string; backgroundGradient?: GradientFill | null }) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [editing, setEditing] = useState<SitePage | null>(null);
  const [editName, setEditName] = useState('');

  // Keeps the modal's snapshot live while it's open -- e.g. `onSetBackground` writes into
  // `pages` (the real source of truth) rather than `editing`, so without this the
  // Solid/Gradient toggle and swatch highlights would never reflect a tap back at the user.
  useEffect(() => {
    if (!editing) return;
    const latest = pages.find((p) => p.id === editing.id);
    if (latest && latest !== editing) setEditing(latest);
  }, [pages, editing]);

  const openAdd = () => {
    setAddName(`Page ${pages.length + 1}`);
    setAddOpen(true);
  };

  const confirmAdd = () => {
    if (!addName.trim()) return;
    onAdd(addName.trim());
    setAddOpen(false);
  };

  const openEdit = (page: SitePage) => {
    setEditName(page.name);
    setEditing(page);
  };

  const confirmRename = () => {
    if (!editing || !editName.trim()) return;
    onRename(editing.id, editName.trim());
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!editing) return;
    const page = editing;
    setEditing(null);
    showAlert('Delete this page?', `"${page.name}" and everything on it will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onRemove(page.id) },
    ]);
  };

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.barContent}>
        {pages.map((page) => {
          const active = page.id === activePageId;
          return (
            <Pressable
              key={page.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSwitch(page.id)}
              onLongPress={() => openEdit(page)}
            >
              <View style={[styles.colorDot, { backgroundColor: page.backgroundColor }]} />
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {page.name}
              </Text>
              {active && (
                <Pressable hitSlop={8} onPress={() => openEdit(page)}>
                  <Ionicons name="pencil" size={12} color="#2563EB" />
                </Pressable>
              )}
            </Pressable>
          );
        })}
        <Pressable style={styles.addChip} onPress={openAdd}>
          <Ionicons name="add" size={16} color="#334155" />
          <Text style={styles.addChipText}>Page</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New page</Text>
            <TextInput style={styles.nameInput} value={addName} onChangeText={setAddName} autoFocus placeholder="Page name" />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setAddOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={confirmAdd}>
                <Text style={styles.modalConfirmText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit page</Text>
            <TextInput style={styles.nameInput} value={editName} onChangeText={setEditName} placeholder="Page name" />
            {editing && (
              <GradientPickerRow
                label="Background"
                solidColor={editing.backgroundColor}
                onSolidColorChange={(backgroundColor) => onSetBackground(editing.id, { backgroundColor })}
                gradient={editing.backgroundGradient}
                onGradientChange={(backgroundGradient) => onSetBackground(editing.id, { backgroundGradient })}
              />
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={confirmDelete} disabled={pages.length <= 1}>
                <Ionicons name="trash-outline" size={16} color={pages.length <= 1 ? '#CBD5E1' : '#DC2626'} />
                <Text style={[styles.modalCancelText, { color: pages.length <= 1 ? '#CBD5E1' : '#DC2626' }]}>Delete</Text>
              </Pressable>
              <Pressable style={styles.modalConfirm} onPress={confirmRename}>
                <Text style={styles.modalConfirmText}>Save</Text>
              </Pressable>
            </View>
            <Pressable style={styles.doneBtn} onPress={() => setEditing(null)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0, backgroundColor: '#F8FAFC', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  barContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 140,
  },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  chipTextActive: { color: '#1D4ED8' },
  colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#00000022' },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  nameInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 14,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: { color: '#334155', fontWeight: '600' },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#111827' },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '600' },
  doneBtn: { marginTop: 10, alignItems: 'center' },
  doneBtnText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
