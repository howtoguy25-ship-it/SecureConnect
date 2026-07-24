import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { Project, GenerationSession } from '@/types';
import { projectsStore } from '@/storage/projectsStore';
import { generationSessionStore } from '@/storage/generationSessionStore';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import RewardedAdCard from '@/components/RewardedAdCard';
import AdBanner from '@/components/AdBanner';
import { downloadProjectZip, shareProjectZip } from '@/services/projectExport';

type Props = NativeStackScreenProps<RootStackParamList, 'Projects'>;

export default function ProjectsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { theme } = useAppTheme();
  const uid = user!.uid;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Keyed by previewProjectId -- lets a "Generating..." card show real live status and
  // route back to the AI build progress screen instead of opening an empty Editor, since
  // the build itself keeps running server-side even after leaving that screen.
  const [activeSessionsByProjectId, setActiveSessionsByProjectId] = useState<Record<string, GenerationSession>>({});
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<'download' | 'share' | null>(null);

  const load = useCallback(async () => {
    const [list, activeSessions] = await Promise.all([projectsStore.list(uid), generationSessionStore.listActive(uid)]);
    setProjects(list);
    setActiveSessionsByProjectId(Object.fromEntries(activeSessions.map((s) => [s.previewProjectId, s])));
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

  const menuProject = projects.find((p) => p.id === menuProjectId) ?? null;

  const handleDownloadZip = async (project: Project) => {
    setExportBusy('download');
    try {
      await downloadProjectZip(project);
      setMenuProjectId(null);
    } catch (err: any) {
      showAlert('Could not download', err?.message ?? 'Try again in a moment.');
    } finally {
      setExportBusy(null);
    }
  };

  const handleShareZip = async (project: Project) => {
    setExportBusy('share');
    try {
      await shareProjectZip(project);
      setMenuProjectId(null);
    } catch (err: any) {
      showAlert('Could not share', err?.message ?? 'Try again in a moment.');
    } finally {
      setExportBusy(null);
    }
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
          <View style={styles.emptyEmojiGrid}>
            {(Object.keys(PAGE_TYPE_INFO) as (keyof typeof PAGE_TYPE_INFO)[]).map((key) => {
              const info = PAGE_TYPE_INFO[key];
              return (
                <View key={key} style={[styles.emptyEmojiTile, { backgroundColor: info.accentSoft }]}>
                  <Text style={styles.emptyEmojiText}>{info.emoji}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No projects yet ✨</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Tap the + button to start your first site, video page, social page, or logo.
          </Text>
          <Pressable style={styles.emptyCta} onPress={() => navigation.navigate('NewProject')}>
            <LinearGradient
              colors={['#818CF8', '#E879F9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="add-circle" size={18} color="#0B1120" />
            <Text style={styles.emptyCtaText}>Create a project</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const activeSession = activeSessionsByProjectId[item.id];
            return (
              <Pressable
                style={[styles.card, { backgroundColor: theme.surface }]}
                onPress={() =>
                  activeSession
                    ? navigation.navigate('AIBuildProgress', {
                        sessionId: activeSession.id,
                        pageType: activeSession.pageType,
                        prompt: activeSession.prompt,
                        complexity: activeSession.complexity,
                      })
                    : navigation.navigate('Editor', { projectId: item.id })
                }
                onLongPress={() => startRename(item)}
              >
                <View style={styles.thumb}>
                  <LinearGradient
                    colors={PAGE_TYPE_INFO[item.pageType].gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {activeSession ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.thumbEmoji}>{PAGE_TYPE_INFO[item.pageType].emoji}</Text>
                  )}
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
                  <View style={styles.cardSubtitleRow}>
                    {!activeSession && (
                      <View style={[styles.typePill, { backgroundColor: PAGE_TYPE_INFO[item.pageType].accentSoft }]}>
                        <Text style={[styles.typePillText, { color: PAGE_TYPE_INFO[item.pageType].accent }]}>
                          {PAGE_TYPE_INFO[item.pageType].emoji} {PAGE_TYPE_INFO[item.pageType].title}
                        </Text>
                      </View>
                    )}
                    {activeSession && (
                      <Text style={[styles.cardSubtitle, { color: '#4338CA' }]} numberOfLines={1}>
                        ⚡ Building... {activeSession.statusMessage}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable hitSlop={8} onPress={() => setMenuProjectId(item.id)} style={styles.cardIconBtn}>
                  <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => confirmDelete(item)} style={styles.cardIconBtn}>
                  <Ionicons name="trash-outline" size={20} color={theme.textMuted} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!menuProject} transparent animationType="fade" onRequestClose={() => setMenuProjectId(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuProjectId(null)}>
          <Pressable style={[styles.menuSheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <Text style={[styles.menuTitle, { color: theme.text }]} numberOfLines={1}>
              {menuProject?.name}
            </Text>
            {menuProject?.publishSlug ? (
              <>
                <Pressable
                  style={styles.menuRow}
                  onPress={() => menuProject && handleDownloadZip(menuProject)}
                  disabled={!!exportBusy}
                >
                  {exportBusy === 'download' ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Ionicons name="download-outline" size={20} color={theme.text} />
                  )}
                  <Text style={[styles.menuRowText, { color: theme.text }]}>Download ZIP</Text>
                </Pressable>
                <Pressable
                  style={styles.menuRow}
                  onPress={() => menuProject && handleShareZip(menuProject)}
                  disabled={!!exportBusy}
                >
                  {exportBusy === 'share' ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Ionicons name="share-outline" size={20} color={theme.text} />
                  )}
                  <Text style={[styles.menuRowText, { color: theme.text }]}>Share Files</Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.menuHelper, { color: theme.textMuted }]}>
                Publish this site first to download or share its files as a ZIP.
              </Text>
            )}
            <Pressable style={styles.menuCancel} onPress={() => setMenuProjectId(null)}>
              <Text style={[styles.menuCancelText, { color: theme.textMuted }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  emptyEmojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 160 },
  emptyEmojiTile: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmojiText: { fontSize: 28 },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 20, letterSpacing: -0.3 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#818CF8',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  emptyCtaText: { color: '#0B1120', fontWeight: '800', fontSize: 14 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbEmoji: { fontSize: 24 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  cardSubtitleRow: { marginTop: 4 },
  cardSubtitle: { fontSize: 13, color: '#64748B' },
  typePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typePillText: { fontSize: 11, fontWeight: '700' },
  renameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  cardIconBtn: { padding: 4 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  menuTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuRowText: { fontSize: 15, fontWeight: '600' },
  menuHelper: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingVertical: 10 },
  menuCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  menuCancelText: { fontSize: 14, fontWeight: '700' },
});
