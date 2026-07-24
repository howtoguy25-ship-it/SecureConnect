import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import { projectsStore } from '@/storage/projectsStore';
import { subscribeDomainPurchases, subscribeDomainTransfers } from '@/services/domains';
import { getDomainStatus, disconnectDomain, DomainResult } from '@/services/publish';
import { DomainPurchase, DomainTransfer, Project } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Domains'>;

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  registered: { bg: '#DCFCE7', fg: '#16A34A' },
  active: { bg: '#DCFCE7', fg: '#16A34A' },
  pending: { bg: '#FEF3C7', fg: '#B45309' },
  registering: { bg: '#FEF3C7', fg: '#B45309' },
  paid: { bg: '#FEF3C7', fg: '#B45309' },
  failed: { bg: '#FEE2E2', fg: '#DC2626' },
};

function StatusPill({ label }: { label: string }) {
  const colors = STATUS_COLORS[label.toLowerCase()] ?? { bg: '#F1F5F9', fg: '#64748B' };
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.pillText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

interface DomainRowData {
  domain: string;
  kind: 'purchase' | 'transfer';
  statusLabel: string;
  project: Project | null;
  errorMessage: string | null;
}

export default function DomainsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const { theme } = useAppTheme();

  const [purchases, setPurchases] = useState<DomainPurchase[]>([]);
  const [transfers, setTransfers] = useState<DomainTransfer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dnsByDomain, setDnsByDomain] = useState<Record<string, DomainResult>>({});
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null);
  const [dnsError, setDnsError] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    const unsubP = subscribeDomainPurchases(uid, setPurchases);
    const unsubT = subscribeDomainTransfers(uid, setTransfers);
    projectsStore.list(uid).then((list) => {
      setProjects(list);
      setLoadingProjects(false);
    });
    return () => {
      unsubP();
      unsubT();
    };
  }, [uid]);

  const rows: DomainRowData[] = [
    ...purchases.map((p): DomainRowData => ({
      domain: p.domain,
      kind: 'purchase',
      statusLabel: p.status,
      project: projects.find((proj) => proj.customDomain === p.domain || proj.id === p.projectId) ?? null,
      errorMessage: p.errorMessage,
    })),
    ...transfers.map((t): DomainRowData => ({
      domain: t.domain,
      kind: 'transfer',
      statusLabel: t.status,
      project: projects.find((proj) => proj.customDomain === t.domain) ?? null,
      errorMessage: t.errorMessage,
    })),
  ];

  const refreshDns = async (row: DomainRowData) => {
    if (!row.project) return;
    setCheckingDomain(row.domain);
    setDnsError((prev) => ({ ...prev, [row.domain]: '' }));
    try {
      const result = await getDomainStatus(row.project.id);
      setDnsByDomain((prev) => ({ ...prev, [row.domain]: result }));
    } catch (err: any) {
      setDnsError((prev) => ({ ...prev, [row.domain]: err?.message ?? 'Could not check DNS status right now.' }));
    } finally {
      setCheckingDomain(null);
    }
  };

  const toggleExpand = (row: DomainRowData) => {
    const next = expanded === row.domain ? null : row.domain;
    setExpanded(next);
    if (next && row.project && !dnsByDomain[row.domain]) {
      refreshDns(row);
    }
  };

  const handleDisconnect = (row: DomainRowData) => {
    if (!row.project) return;
    showAlert('Disconnect this domain?', `${row.domain} will stop pointing at ${row.project.name || 'this site'}. You keep ownership of the domain.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setDisconnecting(row.domain);
          try {
            await disconnectDomain(row.project!.id);
            setDnsByDomain((prev) => {
              const next = { ...prev };
              delete next[row.domain];
              return next;
            });
          } catch (err: any) {
            showAlert('Could not disconnect', err?.message ?? 'Try again in a moment.');
          } finally {
            setDisconnecting(null);
          }
        },
      },
    ]);
  };

  const loading = loadingProjects;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Domains</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="globe-outline" size={40} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No domains yet</Text>
            <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
              Buy a real domain from any project's Publish screen and it'll show up here with live DNS details.
            </Text>
          </View>
        ) : (
          rows.map((row) => {
            const isOpen = expanded === row.domain;
            const dns = dnsByDomain[row.domain];
            const err = dnsError[row.domain];
            return (
              <View key={`${row.kind}-${row.domain}`} style={[styles.card, { backgroundColor: theme.surface }]}>
                <Pressable style={styles.cardHeader} onPress={() => toggleExpand(row)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.domainName, { color: theme.text }]}>{row.domain}</Text>
                    <Text style={[styles.domainSub, { color: theme.textMuted }]}>
                      {row.kind === 'transfer' ? 'Transferred domain' : 'Purchased domain'}
                      {row.project ? ` · ${row.project.name || 'Untitled site'}` : ' · Not connected to a site'}
                    </Text>
                  </View>
                  <StatusPill label={row.statusLabel} />
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} style={{ marginLeft: 8 }} />
                </Pressable>

                {isOpen && (
                  <View style={[styles.cardBody, { borderTopColor: theme.border }]}>
                    {row.errorMessage && (
                      <Text style={styles.errorText}>{row.errorMessage}</Text>
                    )}

                    {!row.project && (
                      <Text style={[styles.helperText, { color: theme.textMuted }]}>
                        This domain isn't pointed at any of your published sites yet. Connect it from that project's Publish
                        screen to see real DNS setup here.
                      </Text>
                    )}

                    {row.project && (
                      <>
                        <View style={styles.dnsHeaderRow}>
                          <Text style={[styles.dnsHeading, { color: theme.text }]}>Real DNS records</Text>
                          <Pressable onPress={() => refreshDns(row)} disabled={checkingDomain === row.domain} style={styles.refreshBtn}>
                            {checkingDomain === row.domain ? (
                              <ActivityIndicator size="small" color={theme.accent} />
                            ) : (
                              <>
                                <Ionicons name="refresh" size={14} color={theme.accent} />
                                <Text style={[styles.refreshText, { color: theme.accent }]}>Refresh</Text>
                              </>
                            )}
                          </Pressable>
                        </View>

                        {err && <Text style={styles.errorText}>{err}</Text>}

                        {dns && (
                          <>
                            <Text style={[styles.helperText, { color: theme.textMuted, marginBottom: 8 }]}>
                              Hosting status: {dns.domainStatus ?? dns.status}. DNS changes can take a few minutes to a few hours
                              to fully propagate.
                            </Text>
                            {dns.dnsRecords.length === 0 ? (
                              <Text style={[styles.helperText, { color: theme.textMuted }]}>No pending DNS records -- this domain is fully set up.</Text>
                            ) : (
                              dns.dnsRecords.map((record, i) => (
                                <View key={i} style={[styles.dnsRow, { backgroundColor: theme.background }]}>
                                  <Text style={styles.dnsType}>{record.type}</Text>
                                  <Text style={[styles.dnsValue, { color: theme.text }]} selectable>
                                    {record.domainName} → {record.requiredValue}
                                  </Text>
                                </View>
                              ))
                            )}
                          </>
                        )}

                        <Pressable
                          style={styles.disconnectBtn}
                          onPress={() => handleDisconnect(row)}
                          disabled={disconnecting === row.domain}
                        >
                          {disconnecting === row.domain ? (
                            <ActivityIndicator size="small" color="#DC2626" />
                          ) : (
                            <>
                              <Ionicons name="unlink-outline" size={14} color="#DC2626" />
                              <Text style={styles.disconnectText}>Disconnect from {row.project.name || 'this site'}</Text>
                            </>
                          )}
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: { borderRadius: 14, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  domainName: { fontSize: 15, fontWeight: '700' },
  domainSub: { fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  cardBody: { padding: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  helperText: { fontSize: 12, lineHeight: 18 },
  errorText: { fontSize: 12, color: '#DC2626', marginBottom: 8, lineHeight: 18 },
  dnsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dnsHeading: { fontSize: 13, fontWeight: '700' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  refreshText: { fontSize: 12, fontWeight: '700' },
  dnsRow: { borderRadius: 8, padding: 10, marginBottom: 8 },
  dnsType: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  dnsValue: { fontSize: 12, marginTop: 2 },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 10 },
  disconnectText: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
});
