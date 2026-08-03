import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WidgetElement, WidgetKind } from '@/types';

// A real, always-live/interactive utility -- never a static image. Each kind below ticks or
// responds off the visitor's (or seller's, in the editor) own device with no backend
// dependency, matching the exact same logic implemented in plain JS for the published site
// (see renderWidgetHtml in firebase/functions/src/siteHtml.ts).

// Each widget kind gets its own real color identity (gradient card background, accent for
// key numbers/buttons, an icon badge) instead of one flat white card for every kind --
// mirrors the same theme applied in siteHtml.ts's renderWidgetHtml for the published site.
export const WIDGET_THEME: Record<WidgetKind, { accent: string; soft: string; gradient: [string, string]; icon: keyof typeof Ionicons.glyphMap }> = {
  clock: { accent: '#4338CA', soft: '#E0E7FF', gradient: ['#EEF2FF', '#E0E7FF'], icon: 'time-outline' },
  countdown: { accent: '#EA580C', soft: '#FFEDD5', gradient: ['#FFF7ED', '#FFEDD5'], icon: 'hourglass-outline' },
  stopwatch: { accent: '#0D9488', soft: '#CCFBF1', gradient: ['#F0FDFA', '#CCFBF1'], icon: 'stopwatch-outline' },
  calculator: { accent: '#7C3AED', soft: '#EDE9FE', gradient: ['#F5F3FF', '#EDE9FE'], icon: 'calculator-outline' },
  unitconverter: { accent: '#0284C7', soft: '#E0F2FE', gradient: ['#F0F9FF', '#E0F2FE'], icon: 'swap-horizontal-outline' },
  // Never actually used to paint a gradient card (see WidgetView's kind==='accordion' branch,
  // which renders a plain white card using the site's own real accordionAccentColor instead)
  // -- present only so this lookup table stays a total function over every WidgetKind.
  accordion: { accent: '#0F172A', soft: '#F1F5F9', gradient: ['#FFFFFF', '#FFFFFF'], icon: 'list-outline' },
};

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

// Same center-pivot rotate trick as ClockHand, but for a fixed tick mark near the rim instead
// of a moving hand -- 12 of these (major/thicker at the 12-3-6-9 positions, matching where the
// numerals sit) is what turns a bare circle-with-hands into a real classroom-style clock face.
function ClockTick({ faceSize, degrees, major }: { faceSize: number; degrees: number; major: boolean }) {
  const length = major ? faceSize * 0.09 : faceSize * 0.05;
  const thickness = major ? 2.5 : 1.5;
  return (
    <View style={{ position: 'absolute', width: faceSize, height: faceSize, top: 0, left: 0, transform: [{ rotate: `${degrees}deg` }] }}>
      <View
        style={{
          position: 'absolute',
          left: faceSize / 2 - thickness / 2,
          top: 2,
          width: thickness,
          height: length,
          borderRadius: thickness / 2,
          backgroundColor: major ? '#334155' : '#94A3B8',
        }}
      />
    </View>
  );
}

const CLOCK_NUMERALS: { label: string; degrees: number }[] = [
  { label: '12', degrees: 0 },
  { label: '3', degrees: 90 },
  { label: '6', degrees: 180 },
  { label: '9', degrees: 270 },
];

// Rotates a container to the numeral's clock position, then counter-rotates the label back
// upright inside it -- the numeral itself never spins, only its position around the rim does.
function ClockNumeral({ faceSize, label, degrees, color }: { faceSize: number; label: string; degrees: number; color: string }) {
  return (
    <View style={{ position: 'absolute', width: faceSize, height: faceSize, top: 0, left: 0, transform: [{ rotate: `${degrees}deg` }] }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: faceSize * 0.08, alignItems: 'center', transform: [{ rotate: `${-degrees}deg` }] }}>
        <Text style={{ fontSize: faceSize * 0.13, fontWeight: '800', color }}>{label}</Text>
      </View>
    </View>
  );
}

export function AnalogClockFace({ tz, size, accent }: { tz: string; size: number; accent: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { hour, minute, second } = getHandDegrees(now, tz);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: accent,
        backgroundColor: '#FFFFFF',
        shadowColor: accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 3,
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <ClockTick key={i} faceSize={size} degrees={i * 30} major={i % 3 === 0} />
      ))}
      {CLOCK_NUMERALS.map((n) => (
        <ClockNumeral key={n.label} faceSize={size} label={n.label} degrees={n.degrees} color={accent} />
      ))}
      <ClockHand faceSize={size} length={size * 0.24} thickness={3} color={accent} degrees={hour} />
      <ClockHand faceSize={size} length={size * 0.34} thickness={2} color={accent} degrees={minute} />
      <ClockHand faceSize={size} length={size * 0.38} thickness={1} color="#DC2626" degrees={second} />
      <View
        style={{
          position: 'absolute',
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: accent,
          left: size / 2 - 3.5,
          top: size / 2 - 3.5,
          borderWidth: 1,
          borderColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

// Darkens a "#RRGGBB" accent color for a gradient's second stop -- every widget kind only
// defines one accent color (WIDGET_THEME), so this derives a matching deeper shade instead of
// needing a second color threaded through everywhere a gradient tile is built.
function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

export function DigitalClockFace({ label, tz, compact, accent }: { label: string; tz: string; compact: boolean; accent: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: 'center' }}>
      {!!label && (
        <Text style={{ fontSize: compact ? 9 : 11, color: '#64748B', fontWeight: '700', marginBottom: 3 }} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          shadowColor: accent,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 5,
          elevation: 3,
        }}
      >
        <LinearGradient
          colors={[accent, shadeColor(accent, -25)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: compact ? 10 : 14, paddingVertical: compact ? 6 : 8 }}
        >
          <Text style={{ fontSize: compact ? 13 : 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 }}>{formatDigital(now, tz)}</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

function ClockWidget({ element, compact }: { element: WidgetElement; compact: boolean }) {
  const accent = WIDGET_THEME.clock.accent;
  const timezones = element.timezones.length > 0 ? element.timezones : [{ label: 'Local Time', ianaTimezone: 'UTC' }];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
      {timezones.map((tz, i) =>
        element.style === 'analog' ? (
          <View key={i} style={{ alignItems: 'center' }}>
            <AnalogClockFace tz={tz.ianaTimezone} size={compact ? 56 : 76} accent={accent} />
            <Text style={{ fontSize: compact ? 9 : 11, color: '#64748B', fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
              {tz.label}
            </Text>
          </View>
        ) : (
          <DigitalClockFace key={i} label={tz.label} tz={tz.ianaTimezone} compact={compact} accent={accent} />
        )
      )}
    </View>
  );
}

function splitCountdown(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function CountdownWidget({ element, compact }: { element: WidgetElement; compact: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = Date.parse(element.countdownTargetIso || '');
  const remaining = Number.isFinite(target) ? target - now : 0;
  const reached = Number.isFinite(target) && remaining <= 0;
  const { days, hours, minutes, seconds } = splitCountdown(remaining);
  const unitSize = compact ? 20 : 26;
  const theme = WIDGET_THEME.countdown;
  const box = (value: number, label: string) => (
    <View key={label} style={{ alignItems: 'center', marginHorizontal: compact ? 3 : 5 }}>
      <View style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: compact ? 6 : 10, paddingVertical: compact ? 2 : 4 }}>
        <Text style={{ fontSize: unitSize, fontWeight: '800', color: '#FFFFFF' }}>{String(value).padStart(2, '0')}</Text>
      </View>
      <Text style={{ fontSize: compact ? 8 : 10, color: theme.accent, fontWeight: '700', marginTop: 3 }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ alignItems: 'center' }}>
      {!!element.countdownLabel && (
        <Text style={{ fontSize: compact ? 10 : 12, color: '#64748B', fontWeight: '600', marginBottom: 4 }} numberOfLines={1}>
          {element.countdownLabel}
        </Text>
      )}
      {reached ? (
        <Text style={{ fontSize: compact ? 16 : 20, fontWeight: '800', color: '#16A34A' }}>It's here!</Text>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          {box(days, 'DAYS')}
          {box(hours, 'HRS')}
          {box(minutes, 'MIN')}
          {box(seconds, 'SEC')}
        </View>
      )}
    </View>
  );
}

function formatStopwatch(ms: number): string {
  const totalCentiseconds = Math.floor(ms / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function StopwatchWidget({ compact }: { compact: boolean }) {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startRef.current), 50);
    return () => clearInterval(id);
  }, [running]);

  const toggle = () => {
    if (running) {
      setRunning(false);
    } else {
      startRef.current = Date.now() - elapsedMs;
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    setElapsedMs(0);
    setLaps([]);
  };
  const lap = () => {
    if (running) setLaps((prev) => [elapsedMs, ...prev].slice(0, 5));
  };

  const theme = WIDGET_THEME.stopwatch;
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Text style={{ fontSize: compact ? 22 : 32, fontWeight: '800', color: theme.accent, fontVariant: ['tabular-nums'] }}>{formatStopwatch(elapsedMs)}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable
          onPress={toggle}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: running ? '#DC2626' : '#16A34A' }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: compact ? 12 : 14 }}>{running ? 'Pause' : 'Start'}</Text>
        </Pressable>
        <Pressable onPress={lap} disabled={!running} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: running ? theme.soft : '#F1F5F9' }}>
          <Text style={{ color: running ? theme.accent : '#94A3B8', fontWeight: '700', fontSize: compact ? 12 : 14 }}>Lap</Text>
        </Pressable>
        <Pressable onPress={reset} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.soft }}>
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: compact ? 12 : 14 }}>Reset</Text>
        </Pressable>
      </View>
      {!compact && laps.length > 0 && (
        <View style={{ marginTop: 8, width: '100%' }}>
          {laps.map((l, i) => (
            <Text key={i} style={{ fontSize: 11, color: '#64748B', textAlign: 'center' }}>
              Lap {laps.length - i}: {formatStopwatch(l)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function computeCalc(a: number, op: string, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function formatCalcResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = Math.round(n * 1e8) / 1e8;
  return String(rounded);
}

const CALC_ROWS: string[][] = [
  ['C', '⌫', '±', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

function CalculatorWidget({ compact }: { compact: boolean }) {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const press = (label: string) => {
    if (/^[0-9]$/.test(label)) {
      setDisplay((prev) => (overwrite || prev === '0' ? label : prev.length < 12 ? prev + label : prev));
      setOverwrite(false);
      return;
    }
    if (label === '.') {
      setDisplay((prev) => (overwrite ? '0.' : prev.includes('.') ? prev : prev + '.'));
      setOverwrite(false);
      return;
    }
    if (label === 'C') {
      setDisplay('0');
      setStored(null);
      setOperator(null);
      setOverwrite(false);
      return;
    }
    if (label === '⌫') {
      setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      return;
    }
    if (label === '±') {
      setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : `-${prev}`));
      return;
    }
    if (label === '=') {
      if (operator && stored !== null) {
        const result = computeCalc(stored, operator, Number(display));
        setDisplay(formatCalcResult(result));
        setStored(null);
        setOperator(null);
        setOverwrite(true);
      }
      return;
    }
    // + - × ÷
    setStored((prevStored) => {
      if (prevStored !== null && operator) {
        return computeCalc(prevStored, operator, Number(display));
      }
      return Number(display);
    });
    setDisplay((prevDisplay) => {
      if (stored !== null && operator) return formatCalcResult(computeCalc(stored, operator, Number(prevDisplay)));
      return prevDisplay;
    });
    setOperator(label);
    setOverwrite(true);
  };

  const btnSize = compact ? 26 : 34;
  const theme = WIDGET_THEME.calculator;
  return (
    <View style={{ width: '100%' }}>
      <View style={{ alignItems: 'flex-end', marginBottom: 8, paddingHorizontal: 4 }}>
        <Text numberOfLines={1} style={{ fontSize: compact ? 20 : 28, fontWeight: '700', color: theme.accent }}>
          {display}
        </Text>
      </View>
      {CALC_ROWS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          {row.map((label) => (
            <Pressable
              key={label}
              onPress={() => press(label)}
              style={{
                flex: 1,
                height: btnSize,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: label === '=' ? theme.accent : ['+', '-', '×', '÷'].includes(label) ? theme.soft : '#F1F5F9',
              }}
            >
              <Text style={{ fontSize: compact ? 12 : 15, fontWeight: '700', color: label === '=' ? '#FFFFFF' : label.match(/[+\-×÷]/) ? theme.accent : '#0F172A' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

type UnitCategory = 'length' | 'weight' | 'volume' | 'temperature';

const UNIT_OPTIONS: Record<UnitCategory, { key: string; label: string }[]> = {
  length: [
    { key: 'mm', label: 'mm' },
    { key: 'cm', label: 'cm' },
    { key: 'm', label: 'm' },
    { key: 'km', label: 'km' },
    { key: 'in', label: 'in' },
    { key: 'ft', label: 'ft' },
    { key: 'yd', label: 'yd' },
    { key: 'mi', label: 'mi' },
  ],
  weight: [
    { key: 'mg', label: 'mg' },
    { key: 'g', label: 'g' },
    { key: 'kg', label: 'kg' },
    { key: 'oz', label: 'oz' },
    { key: 'lb', label: 'lb' },
    { key: 'st', label: 'st' },
  ],
  volume: [
    { key: 'ml', label: 'mL' },
    { key: 'l', label: 'L' },
    { key: 'tsp', label: 'tsp' },
    { key: 'tbsp', label: 'tbsp' },
    { key: 'floz', label: 'fl oz' },
    { key: 'cup', label: 'cup' },
    { key: 'qt', label: 'qt' },
    { key: 'gal', label: 'gal' },
  ],
  temperature: [
    { key: 'c', label: '°C' },
    { key: 'f', label: '°F' },
    { key: 'k', label: 'K' },
  ],
};

const LENGTH_FACTORS: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
const WEIGHT_FACTORS: Record<string, number> = { mg: 0.000001, g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 };
const VOLUME_FACTORS: Record<string, number> = { ml: 0.001, l: 1, tsp: 0.00492892, tbsp: 0.0147868, floz: 0.0295735, cup: 0.236588, qt: 0.946353, gal: 3.78541 };

function celsiusFrom(value: number, unit: string): number {
  if (unit === 'f') return ((value - 32) * 5) / 9;
  if (unit === 'k') return value - 273.15;
  return value;
}
function celsiusTo(celsius: number, unit: string): number {
  if (unit === 'f') return (celsius * 9) / 5 + 32;
  if (unit === 'k') return celsius + 273.15;
  return celsius;
}

function convertUnit(category: UnitCategory, value: number, fromKey: string, toKey: string): number {
  if (category === 'temperature') return celsiusTo(celsiusFrom(value, fromKey), toKey);
  const table = category === 'length' ? LENGTH_FACTORS : category === 'weight' ? WEIGHT_FACTORS : VOLUME_FACTORS;
  const base = value * (table[fromKey] ?? 1);
  return base / (table[toKey] ?? 1);
}

const CATEGORY_LABELS: { key: UnitCategory; label: string }[] = [
  { key: 'length', label: 'Length' },
  { key: 'weight', label: 'Weight' },
  { key: 'temperature', label: 'Temp' },
  { key: 'volume', label: 'Volume' },
];

function Chip({ label, active, onPress, compact, accent }: { label: string; active: boolean; onPress: () => void; compact: boolean; accent: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 6,
        borderRadius: 999,
        backgroundColor: active ? accent : '#F1F5F9',
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <Text style={{ fontSize: compact ? 10 : 12, fontWeight: '700', color: active ? '#FFFFFF' : '#0F172A' }}>{label}</Text>
    </Pressable>
  );
}

function UnitConverterWidget({ compact }: { compact: boolean }) {
  const [category, setCategory] = useState<UnitCategory>('length');
  const options = UNIT_OPTIONS[category];
  const [fromUnit, setFromUnit] = useState(options[0].key);
  const [toUnit, setToUnit] = useState(options[1]?.key ?? options[0].key);
  const [input, setInput] = useState('1');

  const changeCategory = (next: UnitCategory) => {
    setCategory(next);
    setFromUnit(UNIT_OPTIONS[next][0].key);
    setToUnit(UNIT_OPTIONS[next][1]?.key ?? UNIT_OPTIONS[next][0].key);
  };

  const swap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const numeric = Number(input);
  const result = Number.isFinite(numeric) ? convertUnit(category, numeric, fromUnit, toUnit) : NaN;
  const resultText = Number.isFinite(result) ? String(Math.round(result * 1e6) / 1e6) : '--';
  const theme = WIDGET_THEME.unitconverter;

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {CATEGORY_LABELS.map((c) => (
          <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => changeCategory(c.key)} compact={compact} accent={theme.accent} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          keyboardType="numeric"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.soft,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: compact ? 4 : 8,
            fontSize: compact ? 13 : 16,
            color: '#0F172A',
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginLeft: 8 }}>
          {options.map((u) => (
            <Chip key={u.key} label={u.label} active={fromUnit === u.key} onPress={() => setFromUnit(u.key)} compact={compact} accent={theme.accent} />
          ))}
        </View>
      </View>
      <Pressable onPress={swap} style={{ alignSelf: 'center', marginVertical: 4, padding: 4 }}>
        <Ionicons name="swap-vertical" size={compact ? 16 : 20} color={theme.accent} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.soft,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: compact ? 4 : 8,
            backgroundColor: theme.soft,
          }}
        >
          <Text numberOfLines={1} style={{ fontSize: compact ? 13 : 16, color: theme.accent, fontWeight: '800' }}>
            {resultText}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginLeft: 8 }}>
          {options.map((u) => (
            <Chip key={u.key} label={u.label} active={toUnit === u.key} onPress={() => setToUnit(u.key)} compact={compact} accent={theme.accent} />
          ))}
        </View>
      </View>
    </View>
  );
}

// A real "Our Services"/"Why Choose Us"-style list -- each item collapsed by default, tap
// its header to expand and reveal the description. Laid out as a real, always-scrollable
// (fixed outer height, never overflows onto whatever sits below it on the page) list of
// cards, 1 or 2 per row, so expanding an item never shifts the rest of the page -- mirrors
// the same behavior as renderAccordionWidgetHtml in firebase/functions/src/siteHtml.ts.
function AccordionWidget({ element, width, height }: { element: WidgetElement; width: number; height: number }) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());
  const items = element.accordionItems ?? [];
  const columns = element.accordionColumns === 2 ? 2 : 1;
  const accent = element.accordionAccentColor?.trim() || '#0F172A';
  const gap = 10;
  const cardWidth = columns === 2 ? (width - gap) / 2 : width;

  const toggle = (i: number) =>
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <ScrollView style={{ width, height }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap }} showsVerticalScrollIndicator={false}>
      {items.map((item, i) => {
        const open = openIndices.has(i);
        return (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            style={{
              width: cardWidth,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              borderRadius: 12,
              padding: 12,
              backgroundColor: '#FFFFFF',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' }} numberOfLines={2}>
                {item.label}
              </Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={accent} style={{ marginLeft: 8 }} />
            </View>
            {open && !!item.description && (
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 17 }}>{item.description}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function WidgetView({ element, width, height }: { element: WidgetElement; width: number; height: number }) {
  const compact = width < 220 || height < 140;
  const theme = WIDGET_THEME[element.kind] ?? WIDGET_THEME.clock;

  // A real branded list, not a small utility card -- skips the colorful gradient-card
  // treatment every other widget kind gets (see AccordionWidget's own comment).
  if (element.kind === 'accordion') {
    return <AccordionWidget element={element} width={width} height={height} />;
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.soft,
        overflow: 'hidden',
      }}
    >
      <LinearGradient colors={theme.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: 8, alignItems: 'center', justifyContent: 'center' }}>
        {!!element.title && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <View style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, borderRadius: compact ? 8 : 10, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={theme.icon} size={compact ? 10 : 12} color="#FFFFFF" />
            </View>
            <Text style={{ fontSize: compact ? 12 : 15, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
              {element.title}
            </Text>
          </View>
        )}
        {element.kind === 'countdown' ? (
          <CountdownWidget element={element} compact={compact} />
        ) : element.kind === 'stopwatch' ? (
          <StopwatchWidget compact={compact} />
        ) : element.kind === 'calculator' ? (
          <CalculatorWidget compact={compact} />
        ) : element.kind === 'unitconverter' ? (
          <UnitConverterWidget compact={compact} />
        ) : (
          <ClockWidget element={element} compact={compact} />
        )}
      </View>
    </View>
  );
}
