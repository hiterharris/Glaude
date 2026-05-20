import axios, { AxiosError } from 'axios';
import { ANTHROPIC_API_KEY } from '@env';
import { RepoAnalysis } from '../types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// Extract a human-readable message from Anthropic API error responses
const extractError = (err: unknown): Error => {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{
      error?: { message?: string; type?: string };
      message?: string;
    }>;
    const status = axiosErr.response?.status;
    const data = axiosErr.response?.data;
    const apiMsg = data?.error?.message ?? data?.message;

    if (status === 401) {
      return new Error('Invalid Anthropic API key. Check your ANTHROPIC_API_KEY in .env.');
    }
    if (status === 400 && apiMsg) {
      return new Error(`Anthropic API: ${apiMsg}`);
    }
    if (status === 429) {
      return new Error('Anthropic rate limit reached. Wait a moment and try again.');
    }
    if (status === 529) {
      return new Error('Anthropic API is overloaded. Try again shortly.');
    }
    if (apiMsg) {
      return new Error(`Anthropic API error (${status}): ${apiMsg}`);
    }
    return new Error(`Anthropic API request failed with status ${status ?? 'unknown'}.`);
  }
  return err instanceof Error ? err : new Error('Unknown error.');
};

const assertApiKey = () => {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_api_key') {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file and restart Expo.');
  }
};

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

const post = async (
  system: string,
  userContent: string,
  maxTokens: number
): Promise<string> => {
  assertApiKey();
  try {
    const response = await axios.post<AnthropicResponse>(
      API_URL,
      {
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 120_000,
      }
    );
    const block = response.data.content.find((b) => b.type === 'text');
    if (!block) throw new Error('Claude returned an empty response.');
    return block.text;
  } catch (err) {
    throw extractError(err);
  }
};

// ── Single-file edit ─────────────────────────────────────────────────────────

const EDIT_SYSTEM = `You are a precise code editing assistant. When given a file's content and an editing instruction, return ONLY the complete updated file content — no explanations, no markdown code fences, no preamble, no trailing commentary. Return the raw file exactly as it should be saved to disk. Preserve all original formatting, indentation style, and newlines unless the instruction explicitly asks to change them.`;

export const generateEdit = async (
  fileName: string,
  fileContent: string,
  instruction: string
): Promise<string> => {
  const userMessage = `File: ${fileName}

Current content:
${fileContent}

Instruction: ${instruction}`;

  return post(EDIT_SYSTEM, userMessage, 8192);
};

// ── Repo-wide analysis ───────────────────────────────────────────────────────

const ANALYZE_SYSTEM = `You are a senior software engineer planning a codebase-wide change. Given a repository file tree and an instruction, identify which source files need to change and describe the specific edit needed in each file.

Respond with ONLY valid JSON — no explanation, no markdown fences. Use this exact schema:
{
  "summary": "One sentence describing the overall change",
  "files": [
    {"path": "relative/path/to/file.ext", "change": "Specific, actionable edit instruction for this file"}
  ]
}

Rules:
- Only include files that genuinely need modification for the given instruction.
- Skip lock files, build artifacts, images, minified files, and auto-generated files.
- If creating a new file (e.g. README.md), include it with path and a full description of its contents.
- Limit to 15 files maximum.
- Each "change" must be a complete, self-contained instruction that Claude can execute on the file in isolation.`;

export const analyzeRepo = async (
  repoName: string,
  filePaths: string[],
  instruction: string
): Promise<RepoAnalysis> => {
  const treeText = filePaths.slice(0, 300).join('\n');

  const userContent = `Repository: ${repoName}

File tree:
${treeText}

Instruction: ${instruction}`;

  const text = await post(ANALYZE_SYSTEM, userContent, 2048);

  // Robustly extract JSON even if Claude wraps it in extra prose
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Claude did not return a valid JSON plan. Try rephrasing your instruction.');
  }

  try {
    return JSON.parse(match[0]) as RepoAnalysis;
  } catch {
    throw new Error("Could not parse Claude's plan. Try rephrasing your instruction.");
  }
};
