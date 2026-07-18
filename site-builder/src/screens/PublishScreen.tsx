import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { projectsStore } from '@/storage/projectsStore';
import {
  publishProject,
  unpublishProject,
  connectDomain,
  getDomainStatus,
  disconnectDomain,
  DomainResult,
} from '@/services/publish';
import { Project } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Publish'>;

function liveUrl(project: Project): string | null {
  if (!project.publishSlug) return null;
  if (project.customDomain && project.domainStatus === 'active') return `https://${project.customDomain}`;
  // Cloud Functions computes the exact hosting domain server-side; this is just for
  // display before the first publish response comes back.
  return null;
}

export default function PublishScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { projectId } = route.params;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const [domainInput, setDomainInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);

  useEffect(() => {
    projectsStore.get(uid, projectId).then((p) => {
      setProject(p);
      setLoading(false);
      if (p) setPublishedUrl(liveUrl(p));
    });
  }, [uid, projectId]);

  const handlePublish = async () => {
    if (!project) return;
    setPublishing(true);
    try {
      const result = await publishProject(uid, project);
      setPublishedUrl(result.url);
      const refreshed = await projectsStore.get(uid, projectId);
      setProject(refreshed);
    } catch (err: any) {
      Alert.alert('Could not publish', err?.message ?? 'Try again in a moment.');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = () => {
    Alert.alert('Unpublish site?', 'Your live link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unpublish',
        style: 'destructive',
        onPress: async () => {
          await unpublishProject(projectId);
          setPublishedUrl(null);
          const refreshed = await projectsStore.get(uid, projectId);
          setProject(refreshed);
        },
      },
    ]);
  };

  const handleConnectDomain = async () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    if (!project?.publishSlug) {
      Alert.alert('Publish first', 'Publish your site before connecting a domain.');
      return;
    }
    setConnecting(true);
    try {
      const result = await connectDomain(projectId, domain);
      setDomainResult(result);
      const refreshed = await projectsStore.get(uid, projectId);
      setProject(refreshed);
    } catch (err: any) {
      Alert.alert('Could not connect domain', err?.message ?? 'Try again in a moment.');
    } finally {
      setConnecting(false);
    }
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const result = await getDomainStatus(projectId);
      setDomainResult(result);
      const refreshed = await projectsStore.get(uid, projectId);
      setProject(refreshed);
    } catch (err: any) {
      Alert.alert('Could not check status', err?.message ?? 'Try again in a moment.');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDisconnectDomain = () => {
    Alert.alert('Disconnect domain?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await disconnectDomain(projectId);
          setDomainResult(null);
          const refreshed = await projectsStore.get(uid, projectId);
          setProject(refreshed);
        },
      },
    ]);
  };

  if (loading || !project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#4338CA" />
        </View>
      </SafeAreaView>
    );
  }

  const isPublished = !!project.publishSlug;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Publish</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name={isPublished ? 'checkmark-circle' : 'cloud-upload-outline'} size={20} color={isPublished ? '#16A34A' : '#4338CA'} />
            <Text style={styles.cardTitle}>{isPublished ? 'Your site is live' : 'Publish your site'}</Text>
          </View>

          {isPublished && publishedUrl && (
            <Pressable onPress={() => Share.share({ message: publishedUrl, url: publishedUrl })}>
              <Text style={styles.link}>{publishedUrl}</Text>
            </Pressable>
          )}

          {!isPublished && (
            <Text style={styles.cardBody}>
              Publishing makes this project a real, publicly reachable website anyone can visit.
            </Text>
          )}

          <Pressable style={styles.primaryButton} onPress={handlePublish} disabled={publishing}>
            {publishing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{isPublished ? 'Republish latest changes' : 'Publish'}</Text>
            )}
          </Pressable>

          {isPublished && (
            <Pressable style={styles.secondaryButton} onPress={handleUnpublish}>
              <Text style={styles.secondaryButtonText}>Unpublish</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="globe-outline" size={20} color="#4338CA" />
            <Text style={styles.cardTitle}>Custom domain</Text>
          </View>

          {!project.customDomain ? (
            <>
              <Text style={styles.cardBody}>
                Already own a domain? Connect it here — you'll add a couple of DNS records at
                whatever registrar you use, no new accounts needed.
              </Text>
              <TextInput
                style={styles.input}
                value={domainInput}
                onChangeText={setDomainInput}
                placeholder="www.yoursite.com"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.primaryButton} onPress={handleConnectDomain} disabled={connecting}>
                {connecting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Connect</Text>}
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('BuyDomain', { projectId })}>
                <Text style={styles.secondaryButtonText}>Don't have one? Buy a new domain</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('TransferDomain')}>
                <Text style={styles.secondaryButtonText}>Own one elsewhere? Transfer it in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.cardBody}>
                {project.customDomain} — status: {project.domainStatus ?? 'pending'}
              </Text>
              {(domainResult?.dnsRecords ?? []).map((record, i) => (
                <View key={i} style={styles.dnsRow}>
                  <Text style={styles.dnsType}>{record.type}</Text>
                  <Text style={styles.dnsValue} selectable>
                    {record.domainName} → {record.requiredValue}
                  </Text>
                </View>
              ))}
              <Pressable style={styles.secondaryButton} onPress={handleCheckStatus} disabled={checkingStatus}>
                {checkingStatus ? <ActivityIndicator color="#4338CA" /> : <Text style={styles.secondaryButtonText}>Check status</Text>}
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={handleDisconnectDomain}>
                <Text style={[styles.secondaryButtonText, { color: '#DC2626' }]}>Disconnect domain</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20, gap: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  cardBody: { fontSize: 13, color: '#64748B', marginTop: 10, lineHeight: 19 },
  link: { fontSize: 14, color: '#4338CA', fontWeight: '700', marginTop: 10 },
  input: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: '#4338CA',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  secondaryButton: { marginTop: 10, alignItems: 'center', justifyContent: 'center', height: 40 },
  secondaryButtonText: { color: '#4338CA', fontWeight: '700', fontSize: 13 },
  dnsRow: { marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10 },
  dnsType: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  dnsValue: { fontSize: 12, color: '#0F172A', marginTop: 2 },
});
