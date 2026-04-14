import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar } from 'react-native';
import { Animated } from 'react-native';
import { useTelemetryStore } from '../../src/store/telemetry';
import { gt7UDPListener } from '../../src/gt7/udp-listener';
import { decryptGt7Packet } from '../../src/gt7/salsa20';
import { parsePacketType3, type Gt7Telemetry } from '../../src/gt7/parser';
import { sendTelemetryBatch } from '../../api/ingest';

export default function CaptureScreen() {
  const { isCapturing, ps5Ip, apiKey, currentPacket, ingestUrl, error } = useTelemetryStore();
  const { setCapturing, updatePacket, setError, batchBuffer, clearBuffer, sessionId, setSessionId } = useTelemetryStore();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [packetsReceived, setPacketsReceived] = useState(0);
  const [ingestStatus, setIngestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');

  useEffect(() => {
    if (!isCapturing || !ps5Ip || !apiKey || !ingestUrl) return;

    let packetCounter = 0;

    gt7UDPListener.start(ps5Ip, (rawPacket) => {
      const decrypted = decryptGt7Packet(rawPacket);
      if (!decrypted) return;

      try {
        const view = new DataView(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);
        const telemetry = parsePacketType3(view);
        telemetry.packetId = packetCounter++;
        updatePacket(telemetry);
        setPacketsReceived(prev => prev + 1);
      } catch (err) {
        console.warn('Parse error:', err);
      }
    });

    // Batch POST interval
    const interval = setInterval(async () => {
      if (batchBuffer.length === 0) return;
      setIngestStatus('sending');
      try {
        const points = [...batchBuffer];
        setIngestStatus('ok');
        const result = await sendTelemetryBatch(ingestUrl, apiKey, sessionId, points);
        if (result?.session_id && !sessionId) {
          setSessionId(result.session_id);
        }
        clearBuffer();
      } catch (err) {
        setIngestStatus('error');
        setError('Failed to send telemetry batch');
      }
    }, 500);

    return () => {
      gt7UDPListener.stop();
      clearInterval(interval);
    };
  }, [isCapturing, ps5Ip, apiKey, ingestUrl]);

  const handleToggleCapture = () => {
    setCapturing(!isCapturing);
    if (!isCapturing) {
      setPacketsReceived(0);
    }
  };

  const speedKph = currentPacket ? Math.round(currentPacket.speedMs * 3.6) : 0;
  const rpm = currentPacket ? Math.round(currentPacket.rpm) : 0;
  const gear = currentPacket?.gear ?? '-';

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <StatusBar barStyle="light-content" />

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
            {currentPacket ? `${Math.round(currentPacket.throttle)}%` : '--'}
          </Text>
          <Text style={styles.telemetryLabel}>THROTTLE</Text>
        </View>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryValue}>
            {currentPacket ? `${Math.round(currentPacket.brake)}%` : '--'}
          </Text>
          <Text style={styles.telemetryLabel}>BRAKE</Text>
        </View>
      </View>

      {/* Tire temps */}
      <View style={styles.tireRow}>
        {['FL', 'FR', 'RL', 'RR'].map((label) => {
          const temp = currentPacket ? (currentPacket as any)[`tireTemp${label}`] ?? '--' : '--';
          return (
            <View key={label} style={styles.tireCard}>
              <Text style={styles.tireLabel}>{label}</Text>
              <Text style={styles.tireTemp}>{typeof temp === 'number' ? `${Math.round(temp)}°C` : '--'}</Text>
            </View>
          );
        })}
      </View>

      {/* Packets received */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Packets: {packetsReceived}</Text>
        {ingestStatus === 'sending' && <Text style={styles.metaText}> Sending...</Text>}
        {ingestStatus === 'ok' && <Text style={styles.metaText}> ✓</Text>}
        {ingestStatus === 'error' && <Text style={styles.metaText}> ✗</Text>}
      </View>

      {/* Start/Stop button */}
      <Pressable
        onPress={handleToggleCapture}
        style={({ pressed }) => [
          styles.button,
          isCapturing ? styles.buttonStop : styles.buttonStart,
        ]}
      >
        <Animated.Text style={[styles.buttonText, { transform: [{ scale: scaleAnim }] }]}>
          {isCapturing ? 'STOP' : 'START CAPTURE'}
        </Animated.Text>
      </Pressable>

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
    marginBottom: 20,
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
    marginBottom: 20,
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
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
  },
});
