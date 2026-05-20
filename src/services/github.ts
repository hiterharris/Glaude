import axios, { AxiosError } from 'axios';
import {
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubTreeResponse,
  GitHubFileContent,
  GitHubCommitResponse,
} from '../types';

const BASE = 'https://api.github.com';

let _token = '';

export const setAccessToken = (token: string): void => {
  _token = token;
};

const headers = () => ({
  Authorization: `Bearer ${_token}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
});

// Extract the human-readable message GitHub sends in error response bodies
const extractGitHubError = (err: unknown): Error => {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{
      message?: string;
      errors?: Array<{ message?: string }>;
      documentation_url?: string;
    }>;
    const status = axiosErr.response?.status;
    const data = axiosErr.response?.data;
    const ghMsg = data?.message;
    const detail = data?.errors?.[0]?.message;

    if (status === 401) {
      return new Error('GitHub token is invalid or expired. Sign out and sign in again.');
    }
    if (status === 403) {
      if (ghMsg?.toLowerCase().includes('resource not accessible by integration')) {
        return new Error(
          'TOKEN_SCOPE: Your GitHub token does not have write access. Sign out and sign back in to re-authorize, or (for org repos) ask an org admin to approve this OAuth app.'
        );
      }
      if (ghMsg?.toLowerCase().includes('branch')) {
        return new Error(`Branch protection blocked the commit: ${ghMsg}`);
      }
      if (ghMsg?.toLowerCase().includes('push access')) {
        return new Error('You don\'t have write access to this repository.');
      }
      return new Error(
        ghMsg
          ? `GitHub refused the request (403): ${ghMsg}`
          : 'Forbidden (403) — check repo write access and branch protection rules.'
      );
    }
    if (status === 404) {
      return new Error(ghMsg ?? 'Resource not found (404).');
    }
    if (status === 409) {
      return new Error(
        'Conflict (409) — the file was modified on GitHub since you opened it. Go back and try again.'
      );
    }
    if (status === 422 && detail) {
      return new Error(`Validation error: ${detail}`);
    }
    if (ghMsg) {
      return new Error(`GitHub API (${status}): ${ghMsg}`);
    }
    return new Error(`GitHub API request failed with status ${status ?? 'unknown'}.`);
  }
  return err instanceof Error ? err : new Error('Unknown error.');
};

// Wrap every API call so errors always surface with real GitHub messages
const ghGet = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => {
  try {
    const res = await axios.get<T>(url, { headers: headers(), params });
    return res.data;
  } catch (err) {
    throw extractGitHubError(err);
  }
};

const ghPut = async <T>(url: string, body: unknown): Promise<T> => {
  try {
    const res = await axios.put<T>(url, body, { headers: headers() });
    return res.data;
  } catch (err) {
    throw extractGitHubError(err);
  }
};

export const getAuthenticatedUser = (): Promise<GitHubUser> =>
  ghGet<GitHubUser>(`${BASE}/user`);

export const getRepos = (): Promise<GitHubRepo[]> =>
  ghGet<GitHubRepo[]>(`${BASE}/user/repos`, {
    per_page: 100,
    sort: 'updated',
    affiliation: 'owner,collaborator',
  });

export const getBranches = (owner: string, repo: string): Promise<GitHubBranch[]> =>
  ghGet<GitHubBranch[]>(`${BASE}/repos/${owner}/${repo}/branches`, { per_page: 100 });

export const createBranch = async (
  owner: string,
  repo: string,
  name: string,
  fromSha: string
): Promise<GitHubBranch> => {
  try {
    const res = await axios.post<{ ref: string; object: { sha: string } }>(
      `${BASE}/repos/${owner}/${repo}/git/refs`,
      { ref: `refs/heads/${name}`, sha: fromSha },
      { headers: headers() }
    );
    return { name, commit: { sha: res.data.object.sha }, protected: false };
  } catch (err) {
    throw extractGitHubError(err);
  }
};

export const getFileTree = async (
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeResponse> => {
  const branchData = await ghGet<{ commit: { commit: { tree: { sha: string } } } }>(
    `${BASE}/repos/${owner}/${repo}/branches/${branch}`
  );
  const treeSha = branchData.commit.commit.tree.sha;
  return ghGet<GitHubTreeResponse>(
    `${BASE}/repos/${owner}/${repo}/git/trees/${treeSha}`,
    { recursive: 1 }
  );
};

export const getFileContent = async (
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GitHubFileContent> =>
  ghGet<GitHubFileContent>(
    `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    ref ? { ref } : undefined
  );

export const decodeFileContent = (base64Content: string): string => {
  const cleaned = base64Content.replace(/\n/g, '');
  try {
    return decodeURIComponent(
      Array.from(atob(cleaned))
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return atob(cleaned);
  }
};

export const encodeFileContent = (content: string): string => {
  try {
    return btoa(
      encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  } catch {
    return btoa(content);
  }
};

export const commitFile = async (
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string | null, // null = create new file; string = update existing
  message: string,
  branch?: string
): Promise<GitHubCommitResponse> => {
  const body: Record<string, string> = {
    message,
    content: encodeFileContent(content),
  };
  if (sha) body.sha = sha;       // omit entirely for new files
  if (branch) body.branch = branch;

  return ghPut<GitHubCommitResponse>(
    `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    body
  );
};
