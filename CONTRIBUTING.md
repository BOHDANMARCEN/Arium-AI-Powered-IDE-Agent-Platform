# Contributing to Arium

First of all — thank you for your interest in contributing!    
Arium is a collaborative project focused on building a powerful, transparent, and secure AI IDE and agent platform.

---

## 🧩 Code Style & Quality

- Arium uses **TypeScript** for core and UI.
- Follow the style enforced by ESLint + Prettier.
- Keep functions small, modular, and pure whenever possible.
- Add JSDoc / TSDoc comments for public APIs.
- Avoid hidden side effects.

---

## 🧪 Tests

- New features must include unit tests.
- Core engines (agent, tools, VFS) require integration tests.
- For UI components, add minimal snapshot tests where meaningful.

---

## 📁 Project Structure

Please follow the existing directory layout:

```
arium/
├── app/              # React frontend
├── core/             # Engines and backend logic
├── server/           # Optional backend server
├── docs/             # Documentation
└── assets/           # Logo, screenshots
```

---

## 🔀 Branching Model

- `main` — stable release
- `dev` — active development
- Feature branches: `feat/<feature-name>`
- Fix branches: `fix/<bug-name>`

---

## 📝 Commit Messages

Use conventional commits:

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring
- `docs:` — documentation changes
- `test:` — tests
- `chore:` — build or tooling updates

**Example:**

```
feat(agent): add basic reasoning loop implementation
```

---

## 🚀 Pull Request Rules

- PR must be focused — one feature or fix.
- Include description, motivation, and test results.
- Reference related issues.
- Keep diffs clean — no unrelated formatting noise.

---

## 🤝 Code of Conduct

Be respectful. Assume good intentions.    
We are here to build technology — no toxicity, no hostility.

---

## 🙏 Acknowledgements

Arium is co-created by **Bogdan Marcen** and **ChatGPT 5.1** as a human–AI engineering partnership.

Thank you for helping us build the next generation of AI development tools!

