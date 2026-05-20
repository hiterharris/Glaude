import React, { useEffect, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Icon from '../components/Icon';
import { getFileContent, decodeFileContent } from '../services/github';
import { generateEdit } from '../services/claude';
import { RootStackParamList } from '../types';

type Props = StackScreenProps<RootStackParamList, 'Prompt'>;

const MAX_FILE_SIZE = 100_000;

const PromptScreen: React.FC<Props> = ({ navigation, route }) => {
  const { repo, file, branch } = route.params;
  const [originalContent, setOriginalContent] = useState<string>('');
  const [fileSha, setFileSha] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(true);
  const [loadingClaude, setLoadingClaude] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [claudeError, setClaudeError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const fetchFile = async () => {
      setFileError(null);
      try {
        const data = await getFileContent(repo.owner.login, repo.name, file.path, branch);
        if (data.size > MAX_FILE_SIZE) {
          setFileError(
            `File is too large (${(data.size / 1024).toFixed(0)} KB). Maximum supported size is 100 KB.`
          );
          return;
        }
        const decoded = decodeFileContent(data.content);
        setOriginalContent(decoded);
        setFileSha(data.sha);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load file.';
        setFileError(msg);
      } finally {
        setLoadingFile(false);
      }
    };
    fetchFile();
  }, [file, repo]);

  const handleSubmit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed) {
      Alert.alert('No Instruction', 'Please describe the change you want to make.');
      return;
    }

    setLoadingClaude(true);
    setClaudeError(null);
    try {
      const fileName = file.path.split('/').pop() ?? file.path;
      const newContent = await generateEdit(fileName, originalContent, trimmed);
      navigation.navigate('DiffReview', {
        repo,
        file,
        originalContent,
        newContent,
        fileSha,
        instruction: trimmed,
        branch,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Claude API error.';
      setClaudeError(msg);
    } finally {
      setLoadingClaude(false);
    }
  };

  if (loadingFile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#58a6ff" />
        <Text style={styles.loadingText}>Loading file…</Text>
      </View>
    );
  }

  if (fileError) {
    return (
      <View style={styles.center}>
        <Icon name="document-text-outline" size={48} color="#8b949e" />
        <Text style={styles.errorTitle}>Cannot open file</Text>
        <Text style={styles.errorMsg}>{fileError}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <View style={styles.fileMeta}>
        <Icon name="document-text-outline" size={14} color="#8b949e" />
        <Text style={styles.filePath} numberOfLines={1}>
          {file.path}
        </Text>
      </View>

      <View style={styles.contentWrap}>
        <Text style={styles.sectionLabel}>CURRENT CONTENT</Text>
        <ScrollView
          style={styles.codeScroll}
          contentContainerStyle={styles.codeContent}
          nestedScrollEnabled
        >
          <Text style={styles.codeText} selectable>
            {originalContent}
          </Text>
        </ScrollView>
      </View>

      <View style={styles.promptSection}>
        <Text style={styles.sectionLabel}>INSTRUCTION</Text>
        <TextInput
          ref={inputRef}
          style={styles.promptInput}
          placeholder="e.g. add error handling to all API calls"
          placeholderTextColor="#8b949e"
          value={instruction}
          onChangeText={setInstruction}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!loadingClaude}
          returnKeyType="default"
        />

        {claudeError ? (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={14} color="#f85149" />
            <Text style={styles.errorText}>{claudeError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            (loadingClaude || !instruction.trim()) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loadingClaude || !instruction.trim()}
          activeOpacity={0.8}
        >
          {loadingClaude ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.submitBtnText}>Generating with Claude…</Text>
            </>
          ) : (
            <>
              <Icon name="sparkles" size={16} color="#ffffff" />
              <Text style={styles.submitBtnText}>Generate Edit</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#8b949e', marginTop: 12, fontSize: 14 },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  filePath: { color: '#8b949e', fontSize: 12, fontFamily: 'monospace' as any, flex: 1 },
  contentWrap: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#30363d' },
  sectionLabel: {
    color: '#8b949e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  codeScroll: { flex: 1, backgroundColor: '#0d1117' },
  codeContent: { paddingHorizontal: 16, paddingBottom: 16 },
  codeText: {
    color: '#e6edf3',
    fontSize: 12,
    fontFamily: 'monospace' as any,
    lineHeight: 18,
  },
  promptSection: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    backgroundColor: '#161b22',
  },
  promptInput: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    color: '#e6edf3',
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    minHeight: 80,
    marginBottom: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#2d1215',
    borderWidth: 1,
    borderColor: '#6e1119',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: '#f85149', fontSize: 12, flex: 1, lineHeight: 17 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 13,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  errorTitle: { color: '#e6edf3', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  errorMsg: { color: '#8b949e', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  backBtn: {
    marginTop: 20,
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  backBtnText: { color: '#e6edf3', fontSize: 14 },
});

export default PromptScreen;
