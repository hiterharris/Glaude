export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  updated_at: string;
  private: boolean;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
  download_url: string;
}

export interface GitHubCommitResponse {
  content: {
    path: string;
    sha: string;
  };
  commit: {
    sha: string;
    html_url: string;
    message: string;
  };
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  children: TreeNode[];
}

export interface FlatTreeItem {
  node: TreeNode;
  depth: number;
}

export interface RepoAnalysis {
  summary: string;
  files: Array<{ path: string; change: string }>;
}

export type RootStackParamList = {
  Login: undefined;
  RepoList: undefined;
  FileBrowser: {
    repo: GitHubRepo;
    initialBranch?: string;
  };
  RepoAI: {
    repo: GitHubRepo;
    branch: string;
  };
  Prompt: {
    repo: GitHubRepo;
    file: GitHubTreeItem;
    branch: string;
  };
  DiffReview: {
    repo: GitHubRepo;
    file: GitHubTreeItem;
    originalContent: string;
    newContent: string;
    fileSha: string | null;
    instruction: string;
    branch: string;
  };
  Commit: {
    repo: GitHubRepo;
    file: GitHubTreeItem;
    newContent: string;
    fileSha: string | null;
    instruction: string;
    branch: string;
    commitMessage: string;
  };
  CommitSuccess: {
    commitUrl: string;
    commitSha: string;
    repoFullName: string;
  };
};
