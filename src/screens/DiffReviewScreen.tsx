import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { diffLines, Change } from 'diff';
import { RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'DiffReview'>;

interface DiffLine {
  key: string;
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNum?: number;
}

const buildDiffLines = (original: string, modified: string): DiffLine[] => {
  const changes: Change[] = diffLines(original, modified);
  const lines: DiffLine[] = [];
  let idx = 0;
  let origLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const rawLines = change.value.split('\n');
    if (rawLines[rawLines.length - 1] === '') rawLines.pop();

    for (const text of rawLines) {
      if (change.added) {
        lines.push({ key: `a-${idx++}`, text, type: 'added', lineNum: newLine++ });
      } else if (change.removed) {
        lines.push({ key: `r-${idx++}`, text, type: 'removed', lineNum: origLine++ });
      } else {
        lines.push({ key: `u-${idx++}`, text, type: 'unchanged', lineNum: newLine++ });
        origLine++;
      }
    }
  }

  return lines;
};

const DiffReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { repo, file, originalContent, newContent, fileSha, instruction, branch } = route.params;

  const fileName = file.path.split('/').pop() ?? file.path;
  const defaultMsg = `ai(${fileName}): ${instruction.slice(0, 60)}${instruction.length > 60 ? '…' : ''}`;
  const [commitMessage, setCommitMessage] = useState(defaultMsg);

  const diffLines_ = useMemo(
    () => buildDiffLines(originalContent, newContent),
    [originalContent, newContent]
  );

  const addedCount = useMemo(
    () => diffLines_.filter((l) => l.type === 'added').length,
    [diffLines_]
  );
  const removedCount = useMemo(
    () => diffLines_.filter((l) => l.type === 'removed').length,
    [diffLines_]
  );
  const hasChanges = addedCount > 0 || removedCount > 0;

  const handleCancel = () => {
    Alert.alert('Discard Changes', 'Discard Claude\'s changes and go back to editing?', [
      { text: 'Keep Reviewing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const handleConfirm = () => {
    if (!hasChanges) {
      Alert.alert('No Changes', 'Claude returned identical content. Nothing to commit.');
      return;
    }
    navigation.navigate('Commit', {
      repo,
      file,
      newContent,
      fileSha,
      instruction,
      branch,
      commitMessage: commitMessage.trim() || defaultMsg,
    });
  };

  const renderLine = ({ item }: { item: DiffLine }) => {
    const bgColor =
      item.type === 'added'
        ? '#0d2418'
        : item.type === 'removed'
        ? '#2d1215'
        : 'transparent';

    const prefix =
      item.type === 'added' ? '+' : item.type === 'removed' ? '−' : ' ';

    const prefixColor =
      item.type === 'added'
        ? '#3fb950'
        : item.type === 'removed'
        ? '#f85149'
        : '#8b949e';

    return (
      <View style={[styles.diffRow, { backgroundColor: bgColor }]}>
        <Text style={[styles.prefix, { color: prefixColor }]}>{prefix}</Text>
        <Text
          style={[
            styles.diffText,
            item.type === 'added' && styles.addedText,
            item.type === 'removed' && styles.removedText,
          ]}
          selectable
        >
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Icon name="git-commit-outline" size={14} color="#8b949e" />
          <Text style={styles.statFile} numberOfLines={1}>
            {file.path}
          </Text>
        </View>
        <View style={styles.statCounts}>
          {addedCount > 0 && (
            <Text style={styles.added}>+{addedCount}</Text>
          )}
          {removedCount > 0 && (
            <Text style={styles.removed}>−{removedCount}</Text>
          )}
          {!hasChanges && <Text style={styles.noChange}>No changes</Text>}
        </View>
      </View>

      <View style={styles.instructionBanner}>
        <Icon name="sparkles" size={12} color="#58a6ff" />
        <Text style={styles.instructionText} numberOfLines={2}>
          {instruction}
        </Text>
      </View>

      <FlatList
        data={diffLines_}
        keyExtractor={(item) => item.key}
        style={styles.diffList}
        contentContainerStyle={styles.diffContent}
        getItemLayout={(_, index) => ({ length: 22, offset: 22 * index, index })}
        renderItem={renderLine}
        ListEmptyComponent={
          <View style={styles.emptyDiff}>
            <Icon name="checkmark-circle-outline" size={48} color="#3fb950" />
            <Text style={styles.emptyDiffText}>No differences found.</Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={88}
      >
        <View style={styles.commitMsgWrap}>
          <Text style={styles.commitMsgLabel}>COMMIT MESSAGE</Text>
          <TextInput
            style={styles.commitMsgInput}
            value={commitMessage}
            onChangeText={setCommitMessage}
            placeholder="Describe this change…"
            placeholderTextColor="#8b949e"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            maxLength={200}
          />
        </View>

        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            activeOpacity={0.8}
          >
            <Icon name="close" size={18} color="#e6edf3" />
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !hasChanges && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.8}
            disabled={!hasChanges}
          >
            <Icon name="checkmark" size={18} color="#ffffff" />
            <Text style={styles.confirmBtnText}>Commit</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  statFile: { color: '#8b949e', fontSize: 12, fontFamily: 'monospace' as any, flex: 1 },
  statCounts: { flexDirection: 'row', gap: 8 },
  added: { color: '#3fb950', fontSize: 13, fontWeight: '600' },
  removed: { color: '#f85149', fontSize: 13, fontWeight: '600' },
  noChange: { color: '#8b949e', fontSize: 12 },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0d1926',
    borderBottomWidth: 1,
    borderBottomColor: '#1f3244',
  },
  instructionText: { color: '#79c0ff', fontSize: 12, lineHeight: 16, flex: 1 },
  diffList: { flex: 1 },
  diffContent: { paddingBottom: 8 },
  diffRow: {
    flexDirection: 'row',
    minHeight: 22,
    paddingHorizontal: 8,
    alignItems: 'flex-start',
  },
  prefix: {
    width: 16,
    fontFamily: 'monospace' as any,
    fontSize: 12,
    lineHeight: 22,
    fontWeight: '600',
  },
  diffText: {
    flex: 1,
    color: '#8b949e',
    fontFamily: 'monospace' as any,
    fontSize: 12,
    lineHeight: 22,
  },
  addedText: { color: '#aff5b4' },
  removedText: { color: '#ffa198' },
  emptyDiff: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyDiffText: { color: '#8b949e', fontSize: 14, marginTop: 12 },
  commitMsgWrap: {
    backgroundColor: '#161b22',
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
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
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 54,
    fontFamily: 'monospace' as any,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    backgroundColor: '#161b22',
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 13,
  },
  cancelBtnText: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 13,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});

export default DiffReviewScreen;
