# Glaude

Edit GitHub repositories using natural language instructions, powered by Claude AI.

## Features

- **GitHub OAuth** — Secure login with GitHub; access token stored in the device keychain via `expo-secure-store`
- **Repository browser** — Lists all your repos with language, description, and last-updated date
- **Collapsible file tree** — Full recursive tree via the GitHub Git Trees API
- **Natural language editing** — Describe any change and Claude rewrites the file
- **Visual diff review** — Unified diff with green/red line highlighting before you commit
- **One-tap commit** — Sends the updated file directly to GitHub with an auto-generated commit message

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| Expo CLI | `npm install -g expo-cli` |
| Expo Go (optional) | iOS / Android app for development |
| EAS CLI (recommended) | `npm install -g eas-cli` |

---

## 1. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in the fields:
   - **Application name**: Glaude
   - **Homepage URL**: `https://github.com` (or any URL)
   - **Authorization callback URL** — depends on your build type:

| Build type | Redirect URI |
|-----------|-------------|
| Standalone / EAS build | `glaude://` |
| Expo Go (development) | `exp://127.0.0.1:8081/--/` — replace `127.0.0.1` with your machine's LAN IP if testing on a physical device |

> **Tip:** Register both URIs in your OAuth App so you can switch between development and production builds without changing settings.

3. Click **Register application** and note your **Client ID** and **Client Secret**.

---

## 2. Get an Anthropic API Key

1. Sign in at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. Copy the key — you'll need it in the next step

---

## 3. Configure Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
ANTHROPIC_API_KEY=sk-ant-...
```

> **Security note:** The `.env` file is listed in `.gitignore` and will not be committed. The client secret is embedded in the app binary — this is acceptable for a personal developer tool, but not for a public app. For production use, proxy the token exchange through a server.

---

## 4. Install Dependencies

```bash
cd Glaude
npm install
```

---

## 5. Run the App

### Expo Go (quickest)

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `i` for iOS simulator / `a` for Android emulator.

> When using Expo Go, set your GitHub OAuth callback URL to the `exp://` URL shown in the terminal output.

### EAS Build (recommended for OAuth to work reliably)

```bash
eas build --platform ios --profile development
# or
eas build --platform android --profile development
```

With EAS builds, the redirect URI is `glaude://` — register that in your GitHub OAuth App.

---

## Project Structure

```
Glaude/
├── App.tsx                        # Root component
├── app.json                       # Expo configuration + URI scheme
├── babel.config.js                # Babel + react-native-dotenv
├── .env                           # Secret keys (not committed)
└── src/
    ├── context/
    │   └── AuthContext.tsx        # Token storage + auth state
    ├── navigation/
    │   └── AppNavigator.tsx       # Stack navigator
    ├── screens/
    │   ├── LoginScreen.tsx        # GitHub OAuth login
    │   ├── RepoListScreen.tsx     # Repository list
    │   ├── FileBrowserScreen.tsx  # Collapsible file tree
    │   ├── PromptScreen.tsx       # File viewer + Claude prompt
    │   ├── DiffReviewScreen.tsx   # Unified diff display
    │   ├── CommitScreen.tsx       # Commit in progress
    │   └── CommitSuccessScreen.tsx# Success + link to commit
    ├── services/
    │   ├── github.ts              # All GitHub API calls
    │   └── claude.ts              # Anthropic API call
    └── types/
        ├── index.ts               # Shared TypeScript types
        └── env.d.ts               # @env module declaration
```

---

## How It Works

```
Login → GitHub OAuth → Token stored in SecureStore
  ↓
Repo List → GET /user/repos
  ↓
File Browser → GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1
  ↓
Prompt Screen → GET /repos/{owner}/{repo}/contents/{path} → Claude API
  ↓
Diff Review → Unified diff display
  ↓
Commit → PUT /repos/{owner}/{repo}/contents/{path}
  ↓
Success → Link to commit on GitHub
```

---

## Troubleshooting

**"bad_verification_code" on login**
The authorization code was already used or expired. Tap Sign In again to start a fresh OAuth flow.

**Blank screen after OAuth redirect**
Make sure `WebBrowser.maybeCompleteAuthSession()` is called at the top of `LoginScreen.tsx` (it is, by default). Also verify the redirect URI in your GitHub OAuth App matches exactly what `makeRedirectUri` produces.

**"Resource not accessible by integration"**
Your token doesn't have the `repo` scope. Sign out and sign in again to re-authorize with the correct scopes.

**File content looks garbled**
The file may use a non-UTF-8 encoding. Binary files are detected by extension and blocked in the file browser.

**Claude returns markdown fences**
The system prompt instructs Claude not to include fences. If this happens, try re-running the prompt or switching to a smaller instruction. The diff reviewer will show the fences as literal text.
# Glaude
