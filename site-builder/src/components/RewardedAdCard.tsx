import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { showRewardedAd } from '@/services/rewardedAd';
import { claimAdReward } from '@/services/adReward';

const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;
const REWARD_CREDITS = 15;

function formatRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function RewardedAdCard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const [lastClaimedAt, setLastClaimedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => userAccountStore.subscribe(uid, (account) => setLastClaimedAt(account?.lastAdRewardClaimedAt ?? null)), [uid]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = lastClaimedAt ? COOLDOWN_MS - (now - lastClaimedAt) : 0;
  const eligible = remainingMs <= 0;

  const watchAd = async () => {
    setBusy(true);
    try {
      const earned = await showRewardedAd();
      if (!earned) {
        showAlert('No reward this time', 'The ad needs to be watched all the way through to earn credits.');
        return;
      }
      const result = await claimAdReward();
      showAlert('Credits added', `+${result.creditsAwarded} credits added to your account.`);
    } catch (err: any) {
      showAlert('Could not show ad', err?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={styles.card} onPress={watchAd} disabled={!eligible || busy}>
      <View style={styles.iconWrap}>
        <Ionicons name="play-circle-outline" size={26} color={eligible ? '#7C3AED' : '#94A3B8'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Watch an ad for {REWARD_CREDITS} free credits</Text>
        <Text style={styles.subtitle}>
          {eligible ? 'Available now' : `Available again in ${formatRemaining(remainingMs)}`}
        </Text>
      </View>
      {busy ? <ActivityIndicator color="#7C3AED" /> : <Ionicons name="chevron-forward" size={20} color="#94A3B8" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  iconWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
