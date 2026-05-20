import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

// Self-contained icon component — no native font loading required.
// Maps Ionicons-style names to Unicode symbols rendered as Text.
const ICONS: Record<string, string> = {
  // Navigation
  'chevron-forward':      '›',
  'chevron-down':         '⌄',
  'arrow-back-outline':   '←',
  'open-outline':         '↗',
  'log-out-outline':      '⏏',
  // Status / feedback
  'checkmark':            '✓',
  'checkmark-circle':     '✓',
  'checkmark-circle-outline': '✓',
  'close':                '✕',
  'close-circle':         '✕',
  'alert-circle-outline': '⚠',
  'warning-outline':      '⚠',
  'cloud-offline-outline':'⊘',
  // Files
  'book-outline':         '◫',
  'document-text':        '≡',
  'document-text-outline':'≡',
  'document-outline':     '▭',
  'folder':               '▷',
  'folder-open':          '▽',
  'image':                '▣',
  'lock-closed':          '⊠',
  'lock-closed-outline':  '⊠',
  // Code / dev
  'code-slash':           '</>',
  'logo-javascript':      'JS',
  'logo-react':           '⚛',
  'logo-python':          'Py',
  'logo-github':          '⌥',
  'git-branch':           '⎇',
  'git-commit-outline':   '◉',
  'terminal':             '$',
  // Misc
  'search':               '⊕',
  'settings':             '⚙',
  'key':                  '⌘',
  'person-circle-outline':'◎',
  'sparkles':             '✦',
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

const Icon: React.FC<IconProps> = ({ name, size = 16, color = '#e6edf3', style }) => (
  <Text
    style={[
      {
        fontSize: name === 'code-slash' ? Math.floor(size * 0.72) : size,
        color,
        lineHeight: size * 1.4,
        textAlign: 'center',
      },
      style,
    ]}
  >
    {ICONS[name] ?? '•'}
  </Text>
);

export default Icon;
