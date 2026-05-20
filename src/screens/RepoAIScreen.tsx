import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { getFileTree, getFileContent, decodeFileContent, commitFile } from '../services/github';
import { analyzeRepo, generateEdit } from '../services/claude';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'RepoAI'>;

type Phase = 'input' | 'analyzing' | 'review' | 'processing' | 'done';

interface FileProposal {
  path: string;
  change: string;
  selected: boolean;
}

interface FileResult {
  path: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  commitUrl?: string;
  error?: string;
}

const SKIP_EXT = new Set([
  'png','jpg','jpeg','gif','svg','ico','bmp','webp',
  'lock','sum','snap',
  'woff','woff2','ttf','eot','otf',
  'zip','tar','gz','rar',
  'pdf','mp3','mp4','mov','avi',
  'exe','dll','so','dylib','bin',
]);

const isSkippable = (path: string): boolean => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return (
    SKIP_EXT.has(ext) ||
    path.includes('node_modules/') ||
    path.startsWith('.git/') ||
    path.endsWith('.min.js') ||
    path.endsWith('.min.css')
  );
};

const RepoAIScreen: React.FC<Props> = ({ navigation, route }) => {
  const { repo, branch } = route.params;
  const { logout } = useAuth();

  const [phase, setPhase] = useState<Phase>('input');
  const [instruction, setInstruction] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [summary, setSummary] = useState('');
  const [proposals, setProposals] = useState<FileProposal[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');

  // ── Phase: input → analyzing → review ──────────────────────────────────────

  const handleAnalyze = async () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;

    setAnalyzeError(null);
    setPhase('analyzing');

    try {
      setStatusMsg('Fetching repository file tree…');
      const treeData = await getFileTree(repo.owner.login, repo.name, branch);

      const filePaths = treeData.tree
        .filter((item) => item.type === 'blob' && !isSkippable(item.path))
        .map((item) => item.path);

      if (filePaths.length === 0) {
        throw new Error('No editable source files found in this repository.');
      }

      setStatusMsg(`Asking Claude to plan changes across ${filePaths.length} files…`);
      const analysis = await analyzeRepo(repo.name, filePaths, trimmed);

      if (!analysis.files || analysis.files.length === 0) {
        throw new Error('Claude found no files that need changes for this instruction.');
      }

      setSummary(analysis.summary);
      setProposals(analysis.files.map((f) => ({ ...f, selected: true })));
      setPhase('review');
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed.');
      setPhase('input');
    }
  };

  // ── Phase: review → processing → done ──────────────────────────────────────

  const handleApply = async () => {
    const selected = proposals.filter((p) => p.selected);
    if (selected.length === 0) {
      Alert.alert('Nothing Selected', 'Select at least one file to modify.');
      return;
    }

    const initial: FileResult[] = selected.map((p) => ({
      path: p.path,
      status: 'pending',
    }));
    setResults(initial);
    setPhase('processing');

    for (let i = 0; i < selected.length; i++) {
      const proposal = selected[i];

      // mark current as processing
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: 'processing' } : r))
      );

      try {
        // Fetch existing file — treat 404 as "new file to create"
        let original = '';
        let fileSha: string | null = null;

        try {
          const fileData = await getFileContent(repo.owner.login, repo.name, proposal.path, branch);
          original = decodeFileContent(fileData.content);
          fileSha = fileData.sha;
        } catch (fetchErr: unknown) {
          const is404 =
            axios.isAxiosError(fetchErr) && fetchErr.response?.status === 404;
          if (!is404) throw fetchErr;
          // File doesn't exist yet — Claude will create it from scratch
          original = '';
          fileSha = null;
        }

        const fileName = proposal.path.split('/').pop() ?? proposal.path;
        const editInstruction = fileSha
          ? proposal.change
          : `Create this file from scratch. ${proposal.change}`;

        const newContent = await generateEdit(fileName, original, editInstruction);

        const autoMsg = `ai(${fileName}): ${instruction.slice(0, 55)}${instruction.length > 55 ? '…' : ''}`;
        const msg = commitMessage.trim() ? `${commitMessage.trim()} (${fileName})` : autoMsg;
        const committed = await commitFile(
          repo.owner.login,
          repo.name,
          proposal.path,
          newContent,
          fileSha,
          msg,
          branch
        );

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: 'done', commitUrl: committed.commit.html_url } : r
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed';
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: 'failed', error: errMsg } : r
          )
        );
      }
    }

    setPhase('done');
  };

  const toggleProposal = (path: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.path === path ? { ...p, selected: !p.selected } : p))
    );
  };

  const selectedCount = proposals.filter((p) => p.selected).length;
  const doneCount = results.filter((r) => r.status === 'done').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const hasScopeError = useMemo(
    () => results.some((r) => r.error?.startsWith('TOKEN_SCOPE:')),
    [results]
  );

  // ── Renders ─────────────────────────────────────────────────────────────────

  if (phase === 'analyzing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#58a6ff" />
        <Text style={styles.analyzeStatus}>{statusMsg}</Text>
      </View>
    );
  }

  if (phase === 'processing') {
    const total = results.length;
    const done = results.filter((r) => r.status === 'done' || r.status === 'failed').length;

    return (
      <View style={styles.container}>
        <View style={styles.processingHeader}>
          <Text style={styles.processingTitle}>Applying changes…</Text>
          <Text style={styles.processingProgress}>{done} / {total} files</Text>
        </View>

        <ScrollView contentContainerStyle={styles.resultsList}>
          {results.map((r) => (
            <View key={r.path} style={styles.resultRow}>
              <View style={styles.resultStatusIcon}>
                {r.status === 'pending' && <View style={styles.dotPending} />}
                {r.status === 'processing' && (
                  <ActivityIndicator size="small" color="#58a6ff" />
                )}
                {r.status === 'done' && (
                  <Text style={styles.iconDone}>✓</Text>
                )}
                {r.status === 'failed' && (
                  <Text style={styles.iconFailed}>✕</Text>
                )}
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultPath} numberOfLines={1}>
                  {r.path}
                </Text>
                {r.status === 'failed' && r.error ? (
                  <Text style={styles.resultError} numberOfLines={2}>{r.error}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={styles.container}>
        <View style={styles.doneHeader}>
          <Text style={styles.doneIcon}>{failedCount === 0 ? '✓' : '⚠'}</Text>
          <Text style={styles.doneTitle}>
            {doneCount} file{doneCount !== 1 ? 's' : ''} updated
            {failedCount > 0 ? `, ${failedCount} failed` : ''}
          </Text>
          <Text style={styles.doneSummary}>{summary}</Text>
        </View>

        {hasScopeError && (
          <View style={styles.scopeErrorBox}>
            <Text style={styles.scopeErrorTitle}>Write permission required</Text>
            <Text style={styles.scopeErrorBody}>
              One or more commits were rejected because your token lacks write access.
              Sign out and sign back in to re-authorize with the <Text style={styles.mono}>repo</Text> scope.
              {'\n'}For org repos, an org admin must also approve Glaude in GitHub org settings.
            </Text>
            <TouchableOpacity style={styles.signOutBtn} onPress={logout} activeOpacity={0.8}>
              <Text style={styles.signOutText}>Sign Out &amp; Re-authenticate</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.resultsList}>
          {results.map((r) => (
            <View key={r.path} style={styles.resultRow}>
              <Text style={r.status === 'done' ? styles.iconDone : styles.iconFailed}>
                {r.status === 'done' ? '✓' : '✕'}
              </Text>
              <View style={styles.resultInfo}>
                <Text style={styles.resultPath} numberOfLines={1}>{r.path}</Text>
                {r.status === 'done' && r.commitUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(r.commitUrl!)}>
                    <Text style={styles.viewCommit}>View commit ↗</Text>
                  </TouchableOpacity>
                ) : r.error ? (
                  <Text style={styles.resultError} numberOfLines={2}>
                    {r.error.replace('TOKEN_SCOPE: ', '')}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.doneActions}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.popToTop()}
            activeOpacity={0.8}
          >
            <Icon name="arrow-back-outline" size={16} color="#e6edf3" />
            <Text style={styles.backBtnText}>Back to Repositories</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'review') {
    return (
      <View style={styles.container}>
        <View style={styles.summaryBanner}>
          <Icon name="sparkles" size={14} color="#58a6ff" />
          <Text style={styles.summaryText}>{summary}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.proposalList}>
          <Text style={styles.sectionLabel}>
            FILES TO MODIFY — {selectedCount} of {proposals.length} selected
          </Text>

          {proposals.map((p) => (
            <TouchableOpacity
              key={p.path}
              style={styles.proposalRow}
              onPress={() => toggleProposal(p.path)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  p.selected && styles.checkboxSelected,
                ]}
              >
                {p.selected && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <View style={styles.proposalInfo}>
                <Text style={styles.proposalPath} numberOfLines={1}>
                  {p.path}
                </Text>
                <Text style={styles.proposalChange} numberOfLines={2}>
                  {p.change}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.commitMsgWrap}>
          <Text style={styles.commitMsgLabel}>COMMIT MESSAGE (optional)</Text>
          <TextInput
            style={styles.commitMsgInput}
            value={commitMessage}
            onChangeText={setCommitMessage}
            placeholder={`ai: ${instruction.slice(0, 50)}…`}
            placeholderTextColor="#8b949e"
            multiline={false}
            returnKeyType="done"
            maxLength={150}
          />
        </View>

        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.cancelReviewBtn}
            onPress={() => setPhase('input')}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelReviewText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.applyBtn,
              selectedCount === 0 && styles.applyBtnDisabled,
            ]}
            onPress={handleApply}
            disabled={selectedCount === 0}
            activeOpacity={0.8}
          >
            <Icon name="checkmark" size={16} color="#ffffff" />
            <Text style={styles.applyBtnText}>
              Apply to {selectedCount} file{selectedCount !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Input phase ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        contentContainerStyle={styles.inputContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.repoHeader}>
          <Icon name="git-branch" size={16} color="#58a6ff" />
          <Text style={styles.repoName}>{repo.full_name}</Text>
          <View style={styles.branchPill}>
            <Text style={styles.branchPillText}>⎇ {branch}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>Global AI Edit</Text>
        <Text style={styles.heroSubtitle}>
          Describe a change and Claude will identify which files to update and
          apply the edits across the whole repository.
        </Text>

        <View style={styles.examples}>
          {[
            'Add JSDoc comments to all exported functions',
            'Replace console.log with a logger utility throughout',
            'Add input validation to all API handler functions',
            'Convert all callbacks to async/await',
          ].map((ex) => (
            <TouchableOpacity
              key={ex}
              style={styles.exampleChip}
              onPress={() => setInstruction(ex)}
              activeOpacity={0.7}
            >
              <Text style={styles.exampleText}>{ex}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>INSTRUCTION</Text>
        <TextInput
          style={styles.instructionInput}
          placeholder="Describe the change you want across the repo…"
          placeholderTextColor="#8b949e"
          value={instruction}
          onChangeText={setInstruction}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoFocus
        />

        {analyzeError ? (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={14} color="#f85149" />
            <Text style={styles.errorText}>{analyzeError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            !instruction.trim() && styles.analyzeBtnDisabled,
          ]}
          onPress={handleAnalyze}
          disabled={!instruction.trim()}
          activeOpacity={0.8}
        >
          <Icon name="sparkles" size={16} color="#ffffff" />
          <Text style={styles.analyzeBtnText}>Analyze Repository</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Claude will scan your file tree, identify affected files, then fetch and
          edit each one individually. You can review the file list before anything
          is committed.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  analyzeStatus: { color: '#8b949e', fontSize: 14, marginTop: 16, textAlign: 'center' },

  // ── Input ──
  inputContent: { padding: 20, paddingBottom: 40 },
  repoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  repoName: { color: '#58a6ff', fontSize: 14, fontWeight: '600', flex: 1 },
  branchPill: {
    backgroundColor: '#0d1926',
    borderWidth: 1,
    borderColor: '#1f3244',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  branchPillText: { color: '#79c0ff', fontSize: 11 },
  heroTitle: { color: '#e6edf3', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  heroSubtitle: { color: '#8b949e', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  exampleChip: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exampleText: { color: '#8b949e', fontSize: 12 },
  inputLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  instructionInput: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    fontSize: 14,
    lineHeight: 20,
    padding: 14,
    minHeight: 110,
    marginBottom: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#2d1215',
    borderWidth: 1,
    borderColor: '#6e1119',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: '#f85149', fontSize: 13, flex: 1, lineHeight: 18 },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 16,
  },
  analyzeBtnDisabled: { opacity: 0.4 },
  analyzeBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  disclaimer: { color: '#8b949e', fontSize: 12, lineHeight: 17, textAlign: 'center' },

  // ── Commit message (shared by review and diff screens) ──
  commitMsgWrap: {
    backgroundColor: '#161b22',
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  commitMsgLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  commitMsgInput: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'monospace' as any,
  },

  // ── Review ──
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#0d1926',
    borderBottomWidth: 1,
    borderBottomColor: '#1f3244',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryText: { color: '#79c0ff', fontSize: 13, lineHeight: 18, flex: 1 },
  proposalList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  sectionLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#30363d',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxSelected: { borderColor: '#238636', backgroundColor: '#238636' },
  checkboxTick: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  proposalInfo: { flex: 1 },
  proposalPath: {
    color: '#58a6ff',
    fontSize: 13,
    fontFamily: 'monospace' as any,
    marginBottom: 4,
  },
  proposalChange: { color: '#8b949e', fontSize: 12, lineHeight: 17 },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    backgroundColor: '#161b22',
  },
  cancelReviewBtn: {
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelReviewText: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 13,
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },

  // ── Processing / Done ──
  processingHeader: {
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  processingTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '600' },
  processingProgress: { color: '#8b949e', fontSize: 13, marginTop: 2 },
  resultsList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#21262d',
  },
  resultStatusIcon: { width: 22, alignItems: 'center', paddingTop: 1 },
  dotPending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#30363d',
    marginTop: 3,
  },
  iconDone: { color: '#3fb950', fontSize: 16, fontWeight: '700' },
  iconFailed: { color: '#f85149', fontSize: 16, fontWeight: '700' },
  resultInfo: { flex: 1 },
  resultPath: {
    color: '#e6edf3',
    fontSize: 13,
    fontFamily: 'monospace' as any,
    marginBottom: 2,
  },
  resultError: { color: '#f85149', fontSize: 12, lineHeight: 16, marginTop: 2 },
  viewCommit: { color: '#58a6ff', fontSize: 12, marginTop: 2 },

  // ── Done header ──
  doneHeader: {
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneIcon: { fontSize: 40, marginBottom: 8 },
  doneTitle: { color: '#e6edf3', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  doneSummary: { color: '#8b949e', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  doneActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    backgroundColor: '#161b22',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 13,
  },
  backBtnText: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },

  // ── Scope error banner ──
  scopeErrorBox: {
    margin: 16,
    backgroundColor: '#2d1215',
    borderWidth: 1,
    borderColor: '#6e1119',
    borderRadius: 10,
    padding: 16,
  },
  scopeErrorTitle: { color: '#f85149', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  scopeErrorBody: { color: '#c9d1d9', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  mono: { fontFamily: 'monospace' as any, color: '#79c0ff' },
  signOutBtn: {
    backgroundColor: '#da3633',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  signOutText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});

export default RepoAIScreen;
