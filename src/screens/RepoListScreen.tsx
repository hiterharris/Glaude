import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { getRepos, getAuthenticatedUser } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { GitHubRepo, GitHubUser, RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'RepoList'>;

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Java: '#b07219',
  Ruby: '#701516',
  PHP: '#4F5D95',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Dart: '#00B4AB',
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
};

const RepoListScreen: React.FC<Props> = ({ navigation }) => {
  const { logout } = useAuth();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [repoData, userData] = await Promise.all([getRepos(), getAuthenticatedUser()]);
      setRepos(repoData);
      setUser(userData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load repositories.';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const confirmLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={confirmLogout} style={{ marginRight: 16 }}>
          <Icon name="log-out-outline" size={22} color="#8b949e" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Icon name="cloud-offline-outline" size={48} color="#8b949e" />
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user && (
        <View style={styles.userBanner}>
          <Icon name="person-circle-outline" size={18} color="#58a6ff" />
          <Text style={styles.userText}>
            Signed in as <Text style={styles.userLogin}>{user.login}</Text>
          </Text>
        </View>
      )}

      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color="#8b949e" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter repositories…"
          placeholderTextColor="#8b949e"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#58a6ff"
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No repositories found.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('FileBrowser', { repo: item })}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Icon
                name={item.private ? 'lock-closed-outline' : 'book-outline'}
                size={16}
                color="#58a6ff"
              />
              <Text style={styles.repoName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.private && (
                <View style={styles.privateBadge}>
                  <Text style={styles.privateBadgeText}>private</Text>
                </View>
              )}
            </View>

            {item.description ? (
              <Text style={styles.repoDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            <View style={styles.cardMeta}>
              {item.language ? (
                <View style={styles.langPill}>
                  <View
                    style={[
                      styles.langDot,
                      { backgroundColor: LANG_COLORS[item.language] ?? '#8b949e' },
                    ]}
                  />
                  <Text style={styles.langText}>{item.language}</Text>
                </View>
              ) : null}
              <Text style={styles.updatedAt}>Updated {formatDate(item.updated_at)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  userBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    backgroundColor: '#161b22',
  },
  userText: { color: '#8b949e', fontSize: 13 },
  userLogin: { color: '#58a6ff', fontWeight: '600' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#e6edf3', fontSize: 14, paddingVertical: 10 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  card: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  repoName: { color: '#58a6ff', fontSize: 15, fontWeight: '600', flex: 1 },
  privateBadge: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  privateBadgeText: { color: '#8b949e', fontSize: 10 },
  repoDesc: { color: '#8b949e', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  langPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  langDot: { width: 10, height: 10, borderRadius: 5 },
  langText: { color: '#8b949e', fontSize: 12 },
  updatedAt: { color: '#8b949e', fontSize: 12 },
  errorTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  errorMsg: { color: '#8b949e', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: 20,
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryText: { color: '#e6edf3', fontSize: 14 },
  emptyText: { color: '#8b949e', fontSize: 14 },
});

export default RepoListScreen;
