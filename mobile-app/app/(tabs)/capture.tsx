import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar } from 'react-native';
import * as Speech from 'expo-speech';
import { useTelemetryStore } from '../../src/store/telemetry';
import { formatLapTime } from '../../src/gt7/telemetry';

const STATUS_COLORS: Record<string, string> = {
  idle: '#6B7280',
  ok: '#22C55E',
  rate_limited: '#EAB308',
  error: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'IDLE',
  ok: 'SENDING OK',
  rate_limited: 'RATE LIMITED',
  error: 'SEND ERROR',
};

/** "1 23 point 4" -> TTS reads "one twenty-three point four". */
function lapTimeToSpeech(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  if (minutes > 0) {
    return `${minutes} ${String(seconds).padStart(2, '0')} point ${tenths}`;
  }
  return `${seconds} point ${tenths}`;
}

export default function CaptureScreen() {
  const isCapturing = useTelemetryStore((s) => s.isCapturing);
  const ps5Ip = useTelemetryStore((s) => s.ps5Ip);
  const apiKey = useTelemetryStore((s) => s.apiKey);
  const ingestUrl = useTelemetryStore((s) => s.ingestUrl);
  const error = useTelemetryStore((s) => s.error);
  const currentPacket = useTelemetryStore((s) => s.currentPacket);
  const lastPacketAt = useTelemetryStore((s) => s.lastPacketAt);
  const packetsReceived = useTelemetryStore((s) => s.packetsReceived);
  const pointsSent = useTelemetryStore((s) => s.pointsSent);
  const droppedPoints = useTelemetryStore((s) => s.droppedPoints);
  const ingestStatus = useTelemetryStore((s) => s.ingestStatus);
  const currentLap = useTelemetryStore((s) => s.currentLap);
  const lastLapMs = useTelemetryStore((s) => s.lastLapMs);
  const bestLapMs = useTelemetryStore((s) => s.bestLapMs);
  const voiceEnabled = useTelemetryStore((s) => s.voiceEnabled);
  const trackName = useTelemetryStore((s) => s.trackName);
  const startCapture = useTelemetryStore((s) => s.startCapture);
  const stopCapture = useTelemetryStore((s) => s.stopCapture);

  const configured = !!(ps5Ip && apiKey && ingestUrl);

  // 1s tick so the PS5 connection status can go stale without new packets.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isCapturing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isCapturing]);

  const receiving =
    isCapturing && lastPacketAt !== null && now - lastPacketAt < 3000;
  const psStatusLabel = !isCapturing
    ? 'NOT CAPTURING'
    : receiving
      ? 'PS5 CONNECTED'
      : 'WAITING FOR PS5...';
  const psStatusColor = !isCapturing ? '#6B7280' : receiving ? '#22C55E' : '#EAB308';

  // Voice race engineer: announce when a lap completes (lastLapMs changes).
  // The first value seen after capture starts is treated as a baseline so a
  // lap finished before capture began is not announced.
  const announcedLapRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isCapturing) {
      announcedLapRef.current = null;
      return;
    }
    if (lastPacketAt === null) return;
    if (announcedLapRef.current === null) {
      announcedLapRef.current = lastLapMs;
      return;
    }
    if (lastLapMs > 0 && lastLapMs !== announcedLapRef.current) {
      announcedLapRef.current = lastLapMs;
      if (voiceEnabled) {
        const completedLap = Math.max(1, currentLap - 1);
        Speech.speak(`Lap ${completedLap}: ${lapTimeToSpeech(lastLapMs)}`, {
          language: 'en-US',
        });
      }
    }
  }, [isCapturing, lastPacketAt, lastLapMs, currentLap, voiceEnabled]);

  const handleToggleCapture = () => {
    if (isCapturing) {
      void stopCapture();
    } else {
      startCapture();
    }
  };

  const speedKph = currentPacket ? Math.round(currentPacket.speedMs * 3.6) : 0;
  const rpm = currentPacket ? Math.round(currentPacket.rpm) : 0;
  const gear = currentPacket
    ? currentPacket.gear === 0
      ? 'R'
      : String(currentPacket.gear)
    : '-';

  const tires = [
    { label: 'FL', value: currentPacket?.tireTempFl },
    { label: 'FR', value: currentPacket?.tireTempFr },
    { label: 'RL', value: currentPacket?.tireTempRl },
    { label: 'RR', value: currentPacket?.tireTempRr },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* PS5 connection status */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: psStatusColor }]} />
        <Text style={[styles.statusText, { color: psStatusColor }]}>{psStatusLabel}</Text>
      </View>

      {/* Current track (manual, from Settings) */}
      {trackName && <Text style={styles.trackText}>{trackName}</Text>}

      {/* Speed display */}
      <View style={styles.speedContainer}>
        <Text style={styles.speedValue}>{speedKph}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      {/* Telemetry cards */}
      <View style={styles.telemetryRow}>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryValue}>{rpm.toLocaleString()}</Text>
          <Text style={styles.telemetryLabel}>RPM</Text>
        </View>
        <View style={styles.telemetryCard}>
          <Text style={[styles.telemetryValue, { fontSize: 48 }]}>{gear}</Text>
          <Text style={styles.telemetryLabel}>GEAR</Text>
        </View>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryValue}>
            {currentPacket ? `${Math.round(currentPacket.throttle / 2.55)}%` : '--'}
          </Text>
          <Text style={styles.telemetryLabel}>THROTTLE</Text>
        </View>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryValue}>
            {currentPacket ? `${Math.round(currentPacket.brake / 2.55)}%` : '--'}
          </Text>
          <Text style={styles.telemetryLabel}>BRAKE</Text>
        </View>
      </View>

      {/* Lap state */}
      <View style={styles.lapRow}>
        <View style={styles.lapCard}>
          <Text style={styles.lapValue}>
            {currentLap > 0
              ? currentPacket && currentPacket.totalLaps > 0
                ? `${currentLap}/${currentPacket.totalLaps}`
                : String(currentLap)
              : '-'}
          </Text>
          <Text style={styles.lapLabel}>LAP</Text>
        </View>
        <View style={styles.lapCard}>
          <Text style={styles.lapValue}>{formatLapTime(lastLapMs)}</Text>
          <Text style={styles.lapLabel}>LAST</Text>
        </View>
        <View style={styles.lapCard}>
          <Text style={[styles.lapValue, { color: '#A78BFA' }]}>{formatLapTime(bestLapMs)}</Text>
          <Text style={styles.lapLabel}>BEST</Text>
        </View>
      </View>

      {/* Tire temps */}
      <View style={styles.tireRow}>
        {tires.map(({ label, value }) => (
          <View key={label} style={styles.tireCard}>
            <Text style={styles.tireLabel}>{label}</Text>
            <Text style={styles.tireTemp}>
              {typeof value === 'number' ? `${Math.round(value)}°C` : '--'}
            </Text>
          </View>
        ))}
      </View>

      {/* Capture stats + ingest status */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Packets {packetsReceived}</Text>
        <Text style={styles.metaText}>Sent {pointsSent}</Text>
        <Text style={[styles.metaText, droppedPoints > 0 && { color: '#EAB308' }]}>
          Drops {droppedPoints}
        </Text>
        <View style={styles.metaStatus}>
          <View
            style={[styles.statusDot, { backgroundColor: STATUS_COLORS[ingestStatus] }]}
          />
          <Text style={[styles.metaText, { color: STATUS_COLORS[ingestStatus] }]}>
            {STATUS_LABELS[ingestStatus]}
          </Text>
        </View>
      </View>

      {/* Start/Stop button */}
      <Pressable
        onPress={handleToggleCapture}
        style={[styles.button, isCapturing ? styles.buttonStop : styles.buttonStart]}
      >
        <Text style={styles.buttonText}>{isCapturing ? 'STOP' : 'START CAPTURE'}</Text>
      </Pressable>

      {!configured && !isCapturing && (
        <Text style={styles.hintText}>Configure PS5 IP, API key and URL in Settings</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 20,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  trackText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A78BFA',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  speedContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  speedValue: {
    fontSize: 96,
    fontWeight: 'bold',
    color: '#7C3AED',
    lineHeight: 100,
  },
  speedUnit: {
    fontSize: 24,
    color: '#A78BFA',
    fontWeight: '600',
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  telemetryCard: {
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 80,
  },
  telemetryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FAFAFA',
  },
  telemetryLabel: {
    fontSize: 10,
    color: '#A78BFA',
    fontWeight: '600',
    marginTop: 4,
  },
  lapRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    gap: 8,
  },
  lapCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#11111F',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  lapValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FAFAFA',
    fontVariant: ['tabular-nums'],
  },
  lapLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  tireRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  tireCard: {
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 50,
    width: 70,
    height: 70,
    justifyContent: 'center',
  },
  tireLabel: {
    fontSize: 12,
    color: '#A78BFA',
    fontWeight: '600',
  },
  tireTemp: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FAFAFA',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 14,
  },
  metaStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonStart: {
    backgroundColor: '#7C3AED',
  },
  buttonStop: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FAFAFA',
  },
  hintText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 13,
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
});
