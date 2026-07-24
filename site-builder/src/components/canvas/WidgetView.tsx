import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { WidgetElement } from '@/types';

// A real, always-live utility -- not a static image. Ticks every second off the visitor's
// (or seller's, in the editor) own clock via Intl.DateTimeFormat, which handles DST/timezone
// math correctly with no manual offset arithmetic. The published-site version (see
// renderWidgetHtml in firebase/functions/src/siteHtml.ts) does the exact same
// setInterval + Intl.DateTimeFormat approach in plain JS.

function formatDigital(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(date);
  } catch {
    return '--:--:--';
  }
}

// formatToParts (rather than parsing the formatted string) is the reliable way to pull
// exact hour/minute/second numbers for a given IANA zone.
function getHandDegrees(date: Date, tz: string): { hour: number; minute: number; second: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const h = get('hour') % 12;
    const m = get('minute');
    const s = get('second');
    return { hour: (h + m / 60) * 30, minute: (m + s / 60) * 6, second: s * 6 };
  } catch {
    return { hour: 0, minute: 0, second: 0 };
  }
}

// React Native rotates a transform around the view's own center by default (no reliable
// cross-version transformOrigin) -- so each hand is really an outer container exactly the
// size of (and overlaid on) the clock face, rotated around ITS center (which is the clock's
// center), with the visible hand rectangle positioned inside it running from that center
// outward. Rotating the outer container therefore swings the hand correctly around the
// clock's center without needing any non-default transform origin.
function ClockHand({ faceSize, length, thickness, color, degrees }: { faceSize: number; length: number; thickness: number; color: string; degrees: number }) {
  return (
    <View style={{ position: 'absolute', width: faceSize, height: faceSize, top: 0, left: 0, transform: [{ rotate: `${degrees}deg` }] }}>
      <View
        style={{
          position: 'absolute',
          left: faceSize / 2 - thickness / 2,
          top: faceSize / 2 - length,
          width: thickness,
          height: length,
          borderRadius: thickness / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function AnalogClockFace({ tz, size }: { tz: string; size: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { hour, minute, second } = getHandDegrees(now, tz);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#0F172A', backgroundColor: '#FFFFFF' }}>
      <ClockHand faceSize={size} length={size * 0.26} thickness={3} color="#0F172A" degrees={hour} />
      <ClockHand faceSize={size} length={size * 0.36} thickness={2} color="#0F172A" degrees={minute} />
      <ClockHand faceSize={size} length={size * 0.4} thickness={1} color="#DC2626" degrees={second} />
      <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#0F172A', left: size / 2 - 3, top: size / 2 - 3 }} />
    </View>
  );
}

function DigitalClockFace({ label, tz, compact }: { label: string; tz: string; compact: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: compact ? 9 : 11, color: '#64748B', fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontSize: compact ? 14 : 18, color: '#0F172A', fontWeight: '800' }}>{formatDigital(now, tz)}</Text>
    </View>
  );
}

export default function WidgetView({ element, width, height }: { element: WidgetElement; width: number; height: number }) {
  const compact = width < 220 || height < 140;
  const timezones = element.timezones.length > 0 ? element.timezones : [{ label: 'Local Time', ianaTimezone: 'UTC' }];

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!!element.title && (
        <Text style={{ fontSize: compact ? 12 : 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 }} numberOfLines={1}>
          {element.title}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
        {timezones.map((tz, i) =>
          element.style === 'analog' ? (
            <View key={i} style={{ alignItems: 'center' }}>
              <AnalogClockFace tz={tz.ianaTimezone} size={compact ? 56 : 76} />
              <Text style={{ fontSize: compact ? 9 : 11, color: '#64748B', fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                {tz.label}
              </Text>
            </View>
          ) : (
            <DigitalClockFace key={i} label={tz.label} tz={tz.ianaTimezone} compact={compact} />
          )
        )}
      </View>
    </View>
  );
}
