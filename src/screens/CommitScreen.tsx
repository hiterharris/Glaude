import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { commitFile } from '../services/github';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'Commit'>;

const buildCommitMessage = (instruction: string, filePath: string): string => {
  const fileName = filePath.split('/').pop() ?? filePath;
  const truncated =
    instruction.length > 60 ? instruction.slice(0, 60).trimEnd() + '…' : instruction;
  return `ai(${fileName}): ${truncated}`;
};

const IS_SCOPE_ERROR = (msg: string) => msg.startsWith('TOKEN_SCOPE:');

const CommitScreen: React.FC<Props> = ({ navigation, route }) => {
  const { repo, file, newContent, fileSha, instruction, branch, commitMessage } = route.params;
  const { logout } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const doCommit = async () => {
      try {
        const message = commitMessage || buildCommitMessage(instruction, file.path);
        const result = await commitFile(
          repo.owner.login,
          repo.name,
          file.path,
          newContent,
          fileSha,
          message,
          branch
        );
        navigation.replace('CommitSuccess', {
          commitUrl: result.commit.html_url,
          commitSha: result.commit.sha,
          repoFullName: repo.full_name,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Commit failed.');
      }
    };
    doCommit();
  }, []);

  if (error) {
    const isScopeError = IS_SCOPE_ERROR(error);
    const displayMsg = isScopeError ? error.replace('TOKEN_SCOPE: ', '') : error;

    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>✕</Text>
        <Text style={styles.errorTitle}>Commit Failed</Text>
        <Text style={styles.errorMsg}>{displayMsg}</Text>

        {isScopeError ? (
          <>
            <View style={styles.stepsBox}>
              <Text style={styles.stepsTitle}>How to fix</Text>
              <Text style={styles.step}>1. Tap "Sign Out" below</Text>
              <Text style={styles.step}>2. Sign back in with GitHub</Text>
              <Text style={styles.step}>3. Approve the <Text style={styles.mono}>repo</Text> scope when prompted</Text>
              <Text style={styles.stepNote}>
                If this is an organization repo, an org admin must also approve the Glaude OAuth app at{'\n'}
                github.com → Org Settings → OAuth App Access
              </Text>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={logout} activeOpacity={0.8}>
              <Text style={styles.signOutText}>Sign Out &amp; Re-authenticate</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>
            Common causes: the file was modified on GitHub since you opened it, or you don't
            have write access to this repository.
          </Text>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#58a6ff" />
      <Text style={styles.title}>Committing changes…</Text>
      <Text style={styles.subtitle}>{file.path}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: { color: '#e6edf3', fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  subtitle: { color: '#8b949e', fontSize: 13, fontFamily: 'monospace' as any, textAlign: 'center' },
  errorIcon: { fontSize: 48, color: '#f85149', marginBottom: 12 },
  errorTitle: { color: '#e6edf3', fontSize: 18, fontWeight: '700', marginBottom: 10 },
  errorMsg: { color: '#f85149', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  stepsBox: {
    width: '100%',
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  stepsTitle: { color: '#e6edf3', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  step: { color: '#c9d1d9', fontSize: 13, lineHeight: 22 },
  stepNote: {
    color: '#8b949e',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    paddingTop: 10,
  },
  mono: { fontFamily: 'monospace' as any, color: '#79c0ff' },
  signOutBtn: {
    width: '100%',
    backgroundColor: '#da3633',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  signOutText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  backBtn: {
    width: '100%',
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  backText: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  hint: { color: '#8b949e', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});

export default CommitScreen;
