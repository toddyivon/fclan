import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#0A0A0A', borderTopColor: '#1A1A2E' }, tabBarActiveTintColor: '#7C3AED', tabBarInactiveTintColor: '#6B7280' }}>
      <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
