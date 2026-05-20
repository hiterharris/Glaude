import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'CommitSuccess'>;

const CommitSuccessScreen: React.FC<Props> = ({ navigation, route }) => {
  const { commitUrl, commitSha, repoFullName } = route.params;
  const shortSha = commitSha.slice(0, 7);

  const openCommit = async () => {
    const supported = await Linking.canOpenURL(commitUrl);
    if (supported) {
      await Linking.openURL(commitUrl);
    } else {
      Alert.alert('Cannot Open', 'Unable to open the URL in your browser.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Icon name="checkmark-circle" size={72} color="#3fb950" />
      </View>

      <Text style={styles.title}>Committed Successfully</Text>
      <Text style={styles.repoName}>{repoFullName}</Text>

      <View style={styles.shaRow}>
        <Icon name="git-commit-outline" size={14} color="#8b949e" />
        <Text style={styles.sha}>{shortSha}</Text>
      </View>

      <TouchableOpacity
        style={styles.githubBtn}
        onPress={openCommit}
        activeOpacity={0.8}
      >
        <Icon name="logo-github" size={18} color="#ffffff" />
        <Text style={styles.githubBtnText}>View Commit on GitHub</Text>
        <Icon name="open-outline" size={14} color="#ffffff" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.repoBtn}
        onPress={() => navigation.popToTop()}
        activeOpacity={0.8}
      >
        <Icon name="arrow-back-outline" size={16} color="#e6edf3" />
        <Text style={styles.repoBtnText}>Back to Repositories</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 28,
    backgroundColor: '#0d2418',
    borderWidth: 1,
    borderColor: '#2ea043',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    color: '#e6edf3',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  repoName: {
    color: '#8b949e',
    fontSize: 14,
    marginBottom: 16,
  },
  shaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 36,
  },
  sha: {
    color: '#79c0ff',
    fontSize: 13,
    fontFamily: 'monospace' as any,
    letterSpacing: 0.5,
  },
  githubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    marginBottom: 12,
  },
  githubBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  repoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
  },
  repoBtnText: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
});

export default CommitSuccessScreen;
