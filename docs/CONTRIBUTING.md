# Contributing to Ghost Writer

Thank you for your interest in contributing to Ghost Writer! This guide will help you get started.

---

## 🚀 Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/Ghost_Writer.git
cd Ghost_Writer
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Build the Rust native audio module
npm run build:native

# Verify everything works
npm run app:dev
```

### 3. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

---

## 📋 Development Guidelines

### Code Style

- **TypeScript** for all Electron and React code
- **Rust** for native audio modules
- **ESLint** for linting — run `npm run lint` before committing
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add multi-language transcription support
fix: resolve whisper-server port conflict
docs: update architecture diagram
refactor: extract audio DSP into separate module
perf: optimize embedding batch size
test: add e2e tests for meeting flow
chore: update dependencies
```

### Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation updates |
| `refactor/` | Code restructuring |
| `perf/` | Performance improvements |
| `test/` | Test additions |

---

## 🏗️ Architecture Overview

Before making changes, familiarize yourself with the [Architecture](ARCHITECTURE.md) document.

**Key directories:**

| Directory | What goes here |
|-----------|---------------|
| `electron/audio/` | Audio capture and whisper transcription |
| `electron/llm/` | LLM processing pipeline (prompts, intent classification) |
| `electron/rag/` | RAG pipeline (embeddings, vector store) |
| `electron/services/` | Credential management, install tracking |
| `electron/ipc/` | IPC handler modules |
| `src/components/` | React UI components |
| `native-module/src/` | Rust native audio capture |

---

## ✅ Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code compiles without errors (`npm run app:dev`)
- [ ] Lint passes (`npm run lint`)
- [ ] Native module builds (`npm run build:native`) if Rust code was changed
- [ ] New features include documentation updates
- [ ] Commit messages follow Conventional Commits format
- [ ] PR description explains the **why**, not just the **what**

---

## 🐛 Reporting Issues

When reporting bugs, please include:

1. **Steps to reproduce** — Exact steps to trigger the issue
2. **Expected behavior** — What should have happened
3. **Actual behavior** — What actually happened
4. **Environment** — OS version, GPU model, Node.js version
5. **Logs** — Console output or log files from `%APPDATA%\ghost-writer\logs\`

---

## 💡 Feature Requests

We welcome feature ideas! When proposing features:

1. Check existing [issues](https://github.com/Sasidhar-7302/Ghost_Writer/issues) to avoid duplicates
2. Describe the **use case**, not just the solution
3. Consider backward compatibility
4. Note any performance implications

---

## ⚖️ License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
