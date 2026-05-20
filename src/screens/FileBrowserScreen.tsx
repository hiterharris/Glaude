import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import {
  getFileTree,
  getBranches,
  createBranch,
} from '../services/github';
import {
  FlatTreeItem,
  GitHubBranch,
  GitHubTreeItem,
  RootStackParamList,
  TreeNode,
} from '../types';

type Props = StackScreenProps<RootStackParamList, 'FileBrowser'>;

// ── Tree helpers ─────────────────────────────────────────────────────────────

const buildTree = (items: GitHubTreeItem[]): TreeNode[] => {
  const nodeMap: Record<string, TreeNode> = {};

  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of sorted) {
    nodeMap[item.path] = {
      name: item.path.split('/').pop() ?? item.path,
      path: item.path,
      type: item.type,
      sha: item.sha,
      children: [],
    };
  }

  const roots: TreeNode[] = [];
  for (const item of sorted) {
    const node = nodeMap[item.path];
    const parts = item.path.split('/');
    if (parts.length === 1) {
      roots.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      nodeMap[parentPath]?.children.push(node);
    }
  }
  return roots;
};

const flattenTree = (
  nodes: TreeNode[],
  expandedPaths: Set<string>,
  depth = 0
): FlatTreeItem[] => {
  const result: FlatTreeItem[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.type === 'tree' && expandedPaths.has(node.path)) {
      result.push(...flattenTree(node.children, expandedPaths, depth + 1));
    }
  }
  return result;
};

const FILE_EXT_ICON: Record<string, string> = {
  ts: 'code-slash', tsx: 'code-slash', js: 'logo-javascript',
  jsx: 'logo-react', py: 'logo-python', go: 'code-slash',
  rs: 'code-slash', json: 'document-text', md: 'document-text',
  yml: 'settings', yaml: 'settings', sh: 'terminal',
  env: 'key', lock: 'lock-closed', png: 'image', jpg: 'image',
  jpeg: 'image', svg: 'image', gif: 'image',
};

const getFileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_EXT_ICON[ext] ?? 'document-outline';
};

const BINARY_EXT = new Set([
  'png','jpg','jpeg','gif','bmp','ico','svg','woff','woff2',
  'ttf','eot','zip','tar','gz','rar','pdf','mp3','mp4','mov',
  'exe','dll','so','dylib',
]);

const isBinary = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXT.has(ext);
};

// ── Component ────────────────────────────────────────────────────────────────

const FileBrowserScreen: React.FC<Props> = ({ navigation, route }) => {
  const { repo, initialBranch } = route.params;

  const [currentBranch, setCurrentBranch] = useState(
    initialBranch ?? repo.default_branch
  );
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Branch picker state
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);

  // ── Fetch tree ─────────────────────────────────────────────────────────────

  const fetchTree = useCallback(async () => {
    setTreeError(null);
    try {
      const data = await getFileTree(repo.owner.login, repo.name, currentBranch);
      setTree(buildTree(data.tree));
      setTruncated(data.truncated);
    } catch (err: unknown) {
      setTreeError(err instanceof Error ? err.message : 'Failed to load file tree.');
    }
  }, [repo, currentBranch]);

  useEffect(() => {
    setLoading(true);
    setExpandedPaths(new Set());
    fetchTree().finally(() => setLoading(false));
  }, [fetchTree]);

  // ── Header button ──────────────────────────────────────────────────────────

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('RepoAI', { repo, branch: currentBranch })}
          style={styles.headerAiBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.headerAiBtnText}>✦ AI Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, repo, currentBranch]);

  // ── Branch picker ──────────────────────────────────────────────────────────

  const openPicker = async () => {
    setShowPicker(true);
    setBranchError(null);
    setBranchQuery('');
    setLoadingBranches(true);
    try {
      const data = await getBranches(repo.owner.login, repo.name);
      setBranches(data);
    } catch (err: unknown) {
      setBranchError(err instanceof Error ? err.message : 'Failed to load branches.');
    } finally {
      setLoadingBranches(false);
    }
  };

  const selectBranch = (name: string) => {
    setCurrentBranch(name);
    setShowPicker(false);
    setBranchQuery('');
  };

  const handleCreateBranch = async (name: string) => {
    const source = branches.find((b) => b.name === currentBranch);
    if (!source) return;

    setCreatingBranch(true);
    setBranchError(null);
    try {
      await createBranch(repo.owner.login, repo.name, name, source.commit.sha);
      // Refresh branch list then switch to new branch
      const updated = await getBranches(repo.owner.login, repo.name);
      setBranches(updated);
      selectBranch(name);
    } catch (err: unknown) {
      setBranchError(err instanceof Error ? err.message : 'Failed to create branch.');
    } finally {
      setCreatingBranch(false);
    }
  };

  const filteredBranches = useMemo(() => {
    const q = branchQuery.toLowerCase().trim();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, branchQuery]);

  const newBranchName = branchQuery.trim();
  const canCreate =
    newBranchName.length > 0 &&
    !branches.find((b) => b.name === newBranchName) &&
    /^[a-zA-Z0-9._/-]+$/.test(newBranchName);

  // ── Tree interaction ───────────────────────────────────────────────────────

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const flatItems = useMemo(
    () => flattenTree(tree, expandedPaths),
    [tree, expandedPaths]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderBranchBar = () => (
    <TouchableOpacity style={styles.branchBar} onPress={openPicker} activeOpacity={0.7}>
      <Text style={styles.branchBarIcon}>⎇</Text>
      <Text style={styles.branchBarName} numberOfLines={1}>
        {currentBranch}
      </Text>
      {currentBranch !== repo.default_branch && (
        <View style={styles.nonDefaultBadge}>
          <Text style={styles.nonDefaultText}>non-default</Text>
        </View>
      )}
      <Text style={styles.branchBarCaret}>⌄</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        {renderBranchBar()}
        <View style={styles.centerBody}>
          <ActivityIndicator size="large" color="#58a6ff" />
          <Text style={styles.loadingText}>Loading file tree…</Text>
        </View>
      </View>
    );
  }

  if (treeError) {
    return (
      <View style={styles.center}>
        {renderBranchBar()}
        <View style={styles.centerBody}>
          <Icon name="cloud-offline-outline" size={48} color="#8b949e" />
          <Text style={styles.errorTitle}>Failed to load</Text>
          <Text style={styles.errorMsg}>{treeError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchTree}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderBranchBar()}

      {truncated && (
        <View style={styles.truncatedBanner}>
          <Icon name="warning-outline" size={14} color="#e3b341" />
          <Text style={styles.truncatedText}>
            Large repo — tree is truncated. Some files may not appear.
          </Text>
        </View>
      )}

      <FlatList
        data={flatItems}
        keyExtractor={(item) => item.node.path}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({ length: 44, offset: 44 * index, index })}
        renderItem={({ item }) => {
          const { node, depth } = item;
          const isDir = node.type === 'tree';
          const isExpanded = expandedPaths.has(node.path);
          const binary = !isDir && isBinary(node.path);

          return (
            <TouchableOpacity
              style={[styles.row, { paddingLeft: 16 + depth * 18 }]}
              onPress={() => {
                if (isDir) {
                  toggleExpand(node.path);
                } else if (!binary) {
                  const treeItem: GitHubTreeItem = {
                    path: node.path,
                    type: node.type,
                    sha: node.sha,
                    mode: '100644',
                    url: '',
                  };
                  navigation.navigate('Prompt', {
                    repo,
                    file: treeItem,
                    branch: currentBranch,
                  });
                }
              }}
              activeOpacity={0.6}
              disabled={binary}
            >
              <Icon
                name={
                  isDir
                    ? isExpanded ? 'chevron-down' : 'chevron-forward'
                    : getFileIcon(node.name)
                }
                size={14}
                color={isDir ? '#e3b341' : binary ? '#8b949e' : '#58a6ff'}
                style={styles.rowIcon}
              />
              {isDir && (
                <Icon
                  name={isExpanded ? 'folder-open' : 'folder'}
                  size={16}
                  color="#e3b341"
                  style={styles.folderIcon}
                />
              )}
              <Text
                style={[
                  styles.rowText,
                  isDir && styles.rowDir,
                  binary && styles.rowBinary,
                ]}
                numberOfLines={1}
              >
                {node.name}
              </Text>
              {binary && <Text style={styles.binaryTag}>binary</Text>}
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Branch picker modal ── */}
      <Modal
        visible={showPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPicker(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Branch</Text>
              <TouchableOpacity
                onPress={() => setShowPicker(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search / create input */}
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>⊕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Find or create a branch…"
                placeholderTextColor="#8b949e"
                value={branchQuery}
                onChangeText={setBranchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {branchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setBranchQuery('')}>
                  <Text style={styles.clearBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Create new branch row */}
            {canCreate && (
              <TouchableOpacity
                style={styles.createRow}
                onPress={() => handleCreateBranch(newBranchName)}
                disabled={creatingBranch}
                activeOpacity={0.8}
              >
                {creatingBranch ? (
                  <ActivityIndicator size="small" color="#58a6ff" />
                ) : (
                  <Text style={styles.createRowPlus}>+</Text>
                )}
                <View style={styles.createRowText}>
                  <Text style={styles.createRowName}>{newBranchName}</Text>
                  <Text style={styles.createRowSub}>
                    Create from <Text style={styles.createRowBranch}>{currentBranch}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {branchError ? (
              <View style={styles.branchErrorBox}>
                <Text style={styles.branchErrorText}>{branchError}</Text>
              </View>
            ) : null}

            {/* Branch list */}
            {loadingBranches ? (
              <View style={styles.branchLoading}>
                <ActivityIndicator size="small" color="#58a6ff" />
              </View>
            ) : (
              <FlatList
                data={filteredBranches}
                keyExtractor={(b) => b.name}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.branchList}
                ListEmptyComponent={
                  <Text style={styles.emptyBranches}>No branches match.</Text>
                }
                renderItem={({ item }) => {
                  const isActive = item.name === currentBranch;
                  return (
                    <TouchableOpacity
                      style={[styles.branchRow, isActive && styles.branchRowActive]}
                      onPress={() => selectBranch(item.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.branchRowIcon}>⎇</Text>
                      <Text
                        style={[styles.branchRowName, isActive && styles.branchRowNameActive]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.branchBadges}>
                        {item.protected && (
                          <View style={styles.protectedBadge}>
                            <Text style={styles.protectedText}>protected</Text>
                          </View>
                        )}
                        {item.name === repo.default_branch && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultText}>default</Text>
                          </View>
                        )}
                        {isActive && (
                          <Text style={styles.checkMark}>✓</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, backgroundColor: '#0d1117' },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // ── Branch bar ──
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  branchBarIcon: { color: '#8b949e', fontSize: 14 },
  branchBarName: { color: '#e6edf3', fontSize: 13, fontWeight: '500', flex: 1 },
  branchBarCaret: { color: '#8b949e', fontSize: 14 },
  nonDefaultBadge: {
    backgroundColor: '#272e38',
    borderWidth: 1,
    borderColor: '#444c56',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nonDefaultText: { color: '#8b949e', fontSize: 10 },

  // ── Header ──
  headerAiBtn: {
    marginRight: 14,
    backgroundColor: '#1f6feb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerAiBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  // ── Truncated ──
  truncatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#271d0b',
    borderBottomWidth: 1,
    borderBottomColor: '#3d2b00',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  truncatedText: { color: '#e3b341', fontSize: 12, flex: 1 },

  // ── File tree ──
  list: { paddingVertical: 8 },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#21262d',
  },
  rowIcon: { marginRight: 4 },
  folderIcon: { marginRight: 8 },
  rowText: { flex: 1, color: '#e6edf3', fontSize: 13, fontFamily: 'monospace' as any },
  rowDir: { color: '#e6edf3', fontWeight: '500' },
  rowBinary: { color: '#8b949e' },
  binaryTag: {
    color: '#8b949e', fontSize: 10,
    borderWidth: 1, borderColor: '#30363d',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },

  // ── Error / loading ──
  loadingText: { color: '#8b949e', marginTop: 12, fontSize: 14 },
  errorTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  errorMsg: { color: '#8b949e', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: 20, backgroundColor: '#21262d',
    borderWidth: 1, borderColor: '#30363d',
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24,
  },
  retryText: { color: '#e6edf3', fontSize: 14 },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#161b22',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#30363d',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  modalTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '700' },
  modalClose: { color: '#8b949e', fontSize: 18, fontWeight: '400' },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 14,
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: { color: '#8b949e', fontSize: 14 },
  searchInput: { flex: 1, color: '#e6edf3', fontSize: 14, paddingVertical: 10 },
  clearBtn: { color: '#8b949e', fontSize: 14, paddingLeft: 4 },

  // ── Create row ──
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#0d2418',
    borderWidth: 1,
    borderColor: '#238636',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  createRowPlus: { color: '#3fb950', fontSize: 20, fontWeight: '300', width: 20, textAlign: 'center' },
  createRowText: { flex: 1 },
  createRowName: { color: '#3fb950', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  createRowSub: { color: '#8b949e', fontSize: 12 },
  createRowBranch: { color: '#79c0ff' },

  // ── Branch error ──
  branchErrorBox: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#2d1215',
    borderWidth: 1,
    borderColor: '#6e1119',
    borderRadius: 8,
    padding: 10,
  },
  branchErrorText: { color: '#f85149', fontSize: 12, lineHeight: 17 },

  // ── Branch list ──
  branchLoading: { paddingVertical: 32, alignItems: 'center' },
  branchList: { paddingBottom: 40 },
  emptyBranches: { color: '#8b949e', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#21262d',
  },
  branchRowActive: { backgroundColor: '#0d1926' },
  branchRowIcon: { color: '#8b949e', fontSize: 14, width: 18 },
  branchRowName: { color: '#e6edf3', fontSize: 14, flex: 1 },
  branchRowNameActive: { color: '#58a6ff', fontWeight: '600' },
  branchBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  protectedBadge: {
    borderWidth: 1, borderColor: '#6e4400',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    backgroundColor: '#271d0b',
  },
  protectedText: { color: '#e3b341', fontSize: 10 },
  defaultBadge: {
    borderWidth: 1, borderColor: '#1f3244',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    backgroundColor: '#0d1926',
  },
  defaultText: { color: '#79c0ff', fontSize: 10 },
  checkMark: { color: '#3fb950', fontSize: 16, fontWeight: '700' },
});

export default FileBrowserScreen;
