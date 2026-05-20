import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';
const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.EXPO_PUBLIC_GITHUB_CLIENT_SECRET ?? '';
import { useAuth } from '../context/AuthContext';
import { getAuthenticatedUser, setAccessToken } from '../services/github';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
};

type Mode = 'choose' | 'oauth' | 'pat';

const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── OAuth ────────────────────────────────────────────────────────────────
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'glaude' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GITHUB_CLIENT_ID,
      scopes: ['repo', 'read:user'],
      redirectUri,
      usePKCE: false,
    },
    discovery
  );

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      handleCodeExchange(response.params.code);
    } else if (response.type === 'error') {
      setError(response.error?.message ?? 'Authentication was cancelled or failed.');
    }
  }, [response]);

  const handleCodeExchange = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const tokenRes = await axios.post(
        'https://github.com/login/oauth/access_token',
        { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri },
        { headers: { Accept: 'application/json' } }
      );
      const { access_token, error: tokenError, error_description } = tokenRes.data;
      if (tokenError) throw new Error(error_description ?? tokenError);
      if (!access_token) throw new Error('No access token received from GitHub.');
      await login(access_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── PAT ──────────────────────────────────────────────────────────────────
  const [pat, setPat] = useState('');
  const patRef = useRef<TextInput>(null);

  const handlePatLogin = async () => {
    const token = pat.trim();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Validate token by fetching the authenticated user
      setAccessToken(token);
      await getAuthenticatedUser();
      await login(token);
    } catch (err: unknown) {
      setAccessToken('');
      const msg = err instanceof Error ? err.message : 'Invalid token.';
      setError(
        msg.includes('401') || msg.includes('invalid') || msg.includes('Bad credentials')
          ? 'Invalid token — check that it has the repo scope and hasn\'t expired.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setMode('choose');
    setError(null);
    setPat('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderHero = () => (
    <View style={styles.hero}>
      <View style={styles.logoWrap}>
        <Text style={styles.logoIcon}>⎇</Text>
      </View>
      <Text style={styles.title}>Glaude</Text>
      <Text style={styles.tagline}>
        Edit GitHub repositories with natural language, powered by Claude AI.
      </Text>
    </View>
  );

  const renderError = () =>
    error ? (
      <View style={styles.errorBox}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    ) : null;

  // ── Choose mode ───────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {renderHero()}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { setError(null); setMode('oauth'); }}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnIcon}>⌥</Text>
            <Text style={styles.primaryBtnText}>Sign in with GitHub OAuth</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => { setError(null); setMode('pat'); setTimeout(() => patRef.current?.focus(), 100); }}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnIcon}>⌘</Text>
            <Text style={styles.secondaryBtnText}>Use a Personal Access Token</Text>
          </TouchableOpacity>

          <View style={styles.patRecommended}>
            <Text style={styles.patRecommendedBadge}>Recommended for org repos</Text>
            <Text style={styles.patRecommendedBody}>
              OAuth tokens require org admin approval. A PAT with{' '}
              <Text style={styles.mono}>repo</Text> scope works immediately on any
              repo you have access to.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── OAuth mode ────────────────────────────────────────────────────────────
  if (mode === 'oauth') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {renderHero()}

          <View style={styles.redirectBox}>
            <Text style={styles.redirectLabel}>GitHub OAuth callback URL</Text>
            <Text style={styles.redirectUri} selectable>{redirectUri}</Text>
            <Text style={styles.redirectHint}>
              Register this URL in your GitHub OAuth App → Authorization callback URL
            </Text>
          </View>

          <View style={styles.permissionsBox}>
            <Text style={styles.permissionsTitle}>Permissions requested</Text>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionCheck}>✓</Text>
              <Text style={styles.permissionText}>Read and write access to commit &amp; push code changes</Text>
            </View>
            <View style={styles.permissionRow}>
              <Text style={styles.permissionCheck}>✓</Text>
              <Text style={styles.permissionText}>Read your GitHub profile</Text>
            </View>
            <View style={styles.permissionDivider} />
            <Text style={styles.permissionsNote}>
              GitHub will ask you to choose{' '}
              <Text style={styles.permissionsNoteBold}>All repositories</Text> or{' '}
              <Text style={styles.permissionsNoteBold}>Only select repositories</Text>{' '}
              before granting access.
            </Text>
          </View>

          {renderError()}

          {loading ? (
            <ActivityIndicator size="large" color="#58a6ff" style={styles.spinner} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, !request && styles.btnDisabled]}
              onPress={() => { setError(null); promptAsync(); }}
              disabled={!request}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnIcon}>⌥</Text>
              <Text style={styles.primaryBtnText}>Continue with GitHub</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={goBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── PAT mode ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {renderHero()}

          <View style={styles.patInstructions}>
            <Text style={styles.patInstructionsTitle}>Create a Personal Access Token</Text>
            <Text style={styles.patSectionLabel}>CLASSIC TOKEN (all repos)</Text>
            <Text style={styles.patStep}>1. Go to <Text style={styles.mono}>github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)</Text></Text>
            <Text style={styles.patStep}>2. Click <Text style={styles.bold}>Generate new token (classic)</Text></Text>
            <Text style={styles.patStep}>3. Check the <Text style={styles.mono}>repo</Text> scope (enables commit &amp; push)</Text>
            <Text style={styles.patStep}>4. Click <Text style={styles.bold}>Generate token</Text> and paste it below</Text>
            <View style={styles.patDivider} />
            <Text style={styles.patSectionLabel}>FINE-GRAINED TOKEN (selected repos)</Text>
            <Text style={styles.patStep}>1. Go to <Text style={styles.mono}>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens</Text></Text>
            <Text style={styles.patStep}>2. Click <Text style={styles.bold}>Generate new token</Text></Text>
            <Text style={styles.patStep}>3. Under <Text style={styles.bold}>Repository access</Text>, choose specific repos</Text>
            <Text style={styles.patStep}>4. Under <Text style={styles.bold}>Permissions → Repository</Text>, set <Text style={styles.mono}>Contents</Text> to <Text style={styles.bold}>Read and write</Text></Text>
            <Text style={styles.patStep}>5. Click <Text style={styles.bold}>Generate token</Text> and paste it below</Text>
          </View>

          <Text style={styles.inputLabel}>PERSONAL ACCESS TOKEN</Text>
          <TextInput
            ref={patRef}
            style={styles.patInput}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            placeholderTextColor="#8b949e"
            value={pat}
            onChangeText={setPat}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handlePatLogin}
          />

          {renderError()}

          {loading ? (
            <ActivityIndicator size="large" color="#58a6ff" style={styles.spinner} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, !pat.trim() && styles.btnDisabled]}
              onPress={handlePatLogin}
              disabled={!pat.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnIcon}>✓</Text>
              <Text style={styles.primaryBtnText}>Sign In</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={goBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d1117' },
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  // ── Hero ──
  hero: { alignItems: 'center', marginBottom: 36 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d',
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  logoIcon: { fontSize: 36, color: '#58a6ff' },
  title: { fontSize: 34, fontWeight: '700', color: '#e6edf3', letterSpacing: -0.5, marginBottom: 8 },
  tagline: { fontSize: 14, color: '#8b949e', textAlign: 'center', lineHeight: 21 },

  // ── Buttons ──
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#238636', borderRadius: 8,
    paddingVertical: 14, width: '100%', marginBottom: 12,
  },
  primaryBtnIcon: { color: '#ffffff', fontSize: 18 },
  primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', borderRadius: 8,
    paddingVertical: 14, width: '100%', marginBottom: 16,
  },
  secondaryBtnIcon: { color: '#8b949e', fontSize: 16 },
  secondaryBtnText: { color: '#e6edf3', fontSize: 16, fontWeight: '500' },

  // ── Divider ──
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#30363d' },
  dividerLabel: { color: '#8b949e', fontSize: 13 },

  // ── PAT recommended callout ──
  patRecommended: {
    backgroundColor: '#0d1926', borderWidth: 1, borderColor: '#1f3244',
    borderRadius: 8, padding: 14,
  },
  patRecommendedBadge: {
    color: '#79c0ff', fontSize: 11, fontWeight: '700',
    letterSpacing: 0.5, marginBottom: 6,
  },
  patRecommendedBody: { color: '#8b949e', fontSize: 12, lineHeight: 18 },

  // ── OAuth redirect box ──
  redirectBox: {
    width: '100%', backgroundColor: '#161b22',
    borderWidth: 1, borderColor: '#30363d',
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  redirectLabel: { color: '#8b949e', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  redirectUri: { color: '#79c0ff', fontSize: 12, fontFamily: 'monospace' as any, lineHeight: 17 },
  redirectHint: { color: '#8b949e', fontSize: 11, marginTop: 6, lineHeight: 16 },

  // ── Permissions box ──
  permissionsBox: {
    backgroundColor: '#0d1f12', borderWidth: 1, borderColor: '#1e3a24',
    borderRadius: 8, padding: 14, marginBottom: 16,
  },
  permissionsTitle: { color: '#3fb950', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  permissionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  permissionCheck: { color: '#3fb950', fontSize: 13, lineHeight: 18 },
  permissionText: { color: '#8b949e', fontSize: 12, lineHeight: 18, flex: 1 },
  permissionDivider: { height: 1, backgroundColor: '#1e3a24', marginVertical: 10 },
  permissionsNote: { color: '#8b949e', fontSize: 12, lineHeight: 18 },
  permissionsNoteBold: { color: '#e6edf3', fontWeight: '600' },

  // ── PAT instructions ──
  patInstructions: {
    backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 8, padding: 14, marginBottom: 20,
  },
  patInstructionsTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  patSectionLabel: { color: '#58a6ff', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  patDivider: { height: 1, backgroundColor: '#30363d', marginVertical: 12 },
  patStep: { color: '#8b949e', fontSize: 12, lineHeight: 20 },
  bold: { color: '#e6edf3', fontWeight: '600' },
  mono: { fontFamily: 'monospace' as any, color: '#79c0ff' },

  // ── PAT input ──
  inputLabel: { color: '#8b949e', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  patInput: {
    backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 8, color: '#e6edf3', fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'monospace' as any, marginBottom: 14, width: '100%',
  },

  // ── Error ──
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#2d1215', borderWidth: 1, borderColor: '#6e1119',
    borderRadius: 8, padding: 12, marginBottom: 14, width: '100%',
  },
  errorIcon: { color: '#f85149', fontSize: 14 },
  errorText: { color: '#f85149', fontSize: 13, flex: 1, lineHeight: 18 },

  // ── Misc ──
  spinner: { marginBottom: 12 },
  backLink: { alignItems: 'center', marginTop: 8, paddingVertical: 8 },
  backLinkText: { color: '#8b949e', fontSize: 14 },
});

export default LoginScreen;
