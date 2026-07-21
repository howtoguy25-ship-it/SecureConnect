import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { Project } from '@/types';
import { projectsStore } from '@/storage/projectsStore';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import RewardedAdCard from '@/components/RewardedAdCard';
import AdBanner from '@/components/AdBanner';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;

export default function ProjectsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const uid = user!.uid;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    const list = await projectsStore.list(uid);
    setProjects(list);
    setLoading(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const confirmDelete = (project: Project) => {
    showAlert('Delete project?', `"${project.name}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await projectsStore.remove(uid, project.id);
          load();
        },
      },
    ]);
  };

  const startRename = (project: Project) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await projectsStore.rename(uid, renamingId, renameValue.trim());
    }
    setRenamingId(null);
    load();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Account')} hitSlop={8} style={styles.accountButton}>
          <Ionicons name="person-circle-outline" size={28} color={theme.textMuted} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My Projects</Text>
        <Pressable
          style={[styles.createButton, { backgroundColor: theme.accent }]}
          onPress={() => navigation.navigate('NewProject')}
          hitSlop={8}
        >
          <Ionicons name="add" size={26} color={theme.accentText} />
        </Pressable>
      </View>

      <RewardedAdCard />

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator />
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="albums-outline" size={48} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No projects yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Tap the + button to start your first site, video page, social page, or logo.
          </Text>
          <Pressable style={[styles.emptyCta, { backgroundColor: theme.accent }]} onPress={() => navigation.navigate('NewProject')}>
            <Text style={[styles.emptyCtaText, { color: theme.accentText }]}>Create a project</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: theme.surface }]}
              onPress={() => navigation.navigate('Editor', { projectId: item.id })}
              onLongPress={() => startRename(item)}
            >
              <View style={[styles.thumb, { backgroundColor: item.backgroundColor, borderColor: theme.border }]}>
                <Ionicons
                  name={(PAGE_TYPE_INFO[item.pageType].icon as any) ?? 'globe-outline'}
                  size={22}
                  color="#00000080"
                />
              </View>
              <View style={styles.cardBody}>
                {renamingId === item.id ? (
                  <TextInput
                    style={[styles.renameInput, { color: theme.text, borderBottomColor: theme.border }]}
                    value={renameValue}
                    onChangeText={setRenameValue}
                    onSubmitEditing={commitRename}
                    onBlur={commitRename}
                    autoFocus
                  />
                ) : (
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                )}
                <Text style={[styles.cardSubtitle, { color: theme.textMuted }]}>{PAGE_TYPE_INFO[item.pageType].title}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <AdBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  accountButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 6 },
  emptyCta: {
    marginTop: 20,
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#FFFFFF', fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  cardSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  renameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
});
