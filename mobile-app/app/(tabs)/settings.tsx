import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Alert, Switch } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useTelemetryStore } from '../../src/store/telemetry';

const KEY_API = 'gt7_api_key';
const KEY_INGEST = 'gt7_ingest_url';
const KEY_PS5 = 'gt7_ps5_ip';
const KEY_VOICE = 'gt7_voice_announce';
const KEY_TRACK = 'gt7_track_name';

export default function SettingsScreen() {
  const {
    apiKey, ingestUrl, ps5Ip, voiceEnabled,
    setApiKey, setIngestUrl, setPs5Ip, setVoiceEnabled, setTrackName, error,
  } = useTelemetryStore();
  const [localKey, setLocalKey] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [localIp, setLocalIp] = useState('');
  const [localTrack, setLocalTrack] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [k, u, ip, voice, track] = await Promise.all([
        SecureStore.getItemAsync(KEY_API),
        SecureStore.getItemAsync(KEY_INGEST),
        SecureStore.getItemAsync(KEY_PS5),
        SecureStore.getItemAsync(KEY_VOICE),
        SecureStore.getItemAsync(KEY_TRACK),
      ]);
      if (k) { setApiKey(k); setLocalKey(k); }
      if (u) { setIngestUrl(u); setLocalUrl(u); }
      if (ip) { setPs5Ip(ip); setLocalIp(ip); }
      if (voice !== null) { setVoiceEnabled(voice === 'true'); }
      if (track) { setTrackName(track); setLocalTrack(track); }
    })();
    // zustand setters are referentially stable
  }, [setApiKey, setIngestUrl, setPs5Ip, setVoiceEnabled, setTrackName]);

  async function save() {
    const url = localUrl.trim();
    if (url && !/^https:\/\//i.test(url)) {
      Alert.alert('Invalid URL', 'Ingest URL must start with https://');
      return;
    }
    await Promise.all([
      SecureStore.setItemAsync(KEY_API, localKey.trim()),
      SecureStore.setItemAsync(KEY_INGEST, url),
      SecureStore.setItemAsync(KEY_PS5, localIp.trim()),
      SecureStore.setItemAsync(KEY_TRACK, localTrack.trim()),
    ]);
    setApiKey(localKey.trim());
    setIngestUrl(url);
    setPs5Ip(localIp.trim());
    setTrackName(localTrack.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleVoice(enabled: boolean) {
    setVoiceEnabled(enabled);
    await SecureStore.setItemAsync(KEY_VOICE, enabled ? 'true' : 'false');
  }

  const configured = !!(apiKey && ingestUrl && ps5Ip);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>
        {configured ? '✓ Ready to capture' : 'Configure to start capturing'}
      </Text>

      <View style={styles.section}>
        <Text style={styles.label}>Ingest URL</Text>
        <Text style={styles.hint}>Your GT7 dashboard URL (must be HTTPS)</Text>
        <TextInput
          style={styles.input}
          value={localUrl}
          onChangeText={setLocalUrl}
          placeholder="https://gt7.yourdomain.com"
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>API Key</Text>
        <Text style={styles.hint}>Generate one at Settings → API Keys on the dashboard</Text>
        <TextInput
          style={styles.input}
          value={localKey}
          onChangeText={setLocalKey}
          placeholder="gt7_..."
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>PS5 IP Address</Text>
        <Text style={styles.hint}>Find in PS5 Settings → Network → Connection Status</Text>
        <TextInput
          style={styles.input}
          value={localIp}
          onChangeText={setLocalIp}
          placeholder="192.168.1.42"
          placeholderTextColor="#4B5563"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Track name</Text>
        <Text style={styles.hint}>Optional — tags sessions for the leaderboard</Text>
        <TextInput
          style={styles.input}
          value={localTrack}
          onChangeText={setLocalTrack}
          placeholder="e.g. Grand Valley Highway 1"
          placeholderTextColor="#4B5563"
          autoCorrect={false}
        />
      </View>

      <View style={[styles.section, styles.switchRow]}>
        <View style={styles.switchTextWrap}>
          <Text style={styles.label}>Voice lap announcements</Text>
          <Text style={styles.hint}>Speak each lap time as you cross the line</Text>
        </View>
        <Switch
          value={voiceEnabled}
          onValueChange={(v) => { void toggleVoice(v); }}
          trackColor={{ false: '#2A2A3E', true: '#7C3AED' }}
          thumbColor="#FAFAFA"
        />
      </View>

      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>{saved ? '✓ Saved' : 'Save'}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FAFAFA', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#A78BFA', marginBottom: 28 },
  section: { marginBottom: 20 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextWrap: { flex: 1 },
  label: { fontSize: 14, color: '#FAFAFA', fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, color: '#6B7280', marginBottom: 8 },
  input: {
    backgroundColor: '#1A1A2E',
    color: '#FAFAFA',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  button: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FAFAFA', fontWeight: 'bold', fontSize: 16 },
  error: { color: '#EF4444', marginTop: 12, textAlign: 'center' },
});
