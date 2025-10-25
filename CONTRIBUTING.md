# Contributing to WAMR

Thank you for your interest in contributing to WAMR (WhatsApp Media Request Manager)! We welcome contributions from the community and are excited to have you on board.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Conventions](#coding-conventions)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Testing Guidelines](#testing-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed** and what you expected
- **Include screenshots or animated GIFs** if applicable
- **Include your environment details** (OS, Node version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List any alternative solutions** you've considered

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Simple issues suitable for beginners
- `help wanted` - Issues where we'd appreciate community help
- `documentation` - Documentation improvements

### Pull Requests

We actively welcome your pull requests! Here's how to contribute code:

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes
4. Make sure your code lints
5. Issue that pull request!

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git

### Setup Development Environment

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/wamr.git
   cd wamr
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   # Backend
   cd backend
   cp .env.example .env
   # Edit .env with your configuration

   # Frontend
   cd ../frontend
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Generate security keys**

   ```bash
   # JWT Secret
   openssl rand -base64 32

   # Encryption Key
   openssl rand -hex 32
   ```

5. **Setup database**

   ```bash
   cd backend
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

6. **Start development servers**

   ```bash
   cd ..
   npm run dev
   ```

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features (if used)
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes
- `docs/*` - Documentation updates

### Creating a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Making Changes

1. Make your changes in the feature branch
2. Follow the [coding conventions](#coding-conventions)
3. Write or update tests as needed
4. Ensure all tests pass: `npm run test`
5. Ensure code lints: `npm run lint`
6. Format your code: `npm run format`

### Committing Changes

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git add .
git commit -m "feat: add new feature"
```

See [Commit Message Guidelines](#commit-message-guidelines) for details.

## Coding Conventions

### TypeScript

- Use TypeScript for all new code
- Define types explicitly rather than using `any`
- Use interfaces for object shapes
- Use type aliases for unions and complex types
- Export types from dedicated `types/` files

### Code Style

We use ESLint and Prettier to maintain consistent code style:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

**Key conventions:**

- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons
- Use trailing commas in multi-line objects/arrays
- Use arrow functions over function expressions
- Use `const` over `let` when possible
- Avoid `var`

### File Organization

- Group related functionality in modules
- Keep files focused and under 300 lines when possible
- Use index files to export public APIs
- Place tests alongside the code they test

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Components**: `PascalCase.tsx`
- **Variables/Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`
- **Private members**: prefix with `_`

### Backend Conventions

- Use dependency injection where appropriate
- Separate concerns: routes → controllers → services → repositories
- Validate all inputs using Zod schemas
- Use proper error handling with custom error codes
- Log important events using the provided logger
- Never log sensitive information (passwords, tokens, etc.)

### Frontend Conventions

- Use functional components with hooks
- Keep components small and focused
- Use custom hooks for reusable logic
- Use React Query for server state
- Use Zustand for client state
- Follow the component structure:
  ```tsx
  // Imports
  // Types
  // Component
  // Exports
  ```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build, etc.)
- `ci`: CI/CD changes
- `revert`: Reverting a previous commit

### Scope (Optional)

The scope should be the name of the affected module:

- `auth`
- `whatsapp`
- `media`
- `api`
- `ui`
- `db`
- `config`

### Examples

```bash
feat(auth): add JWT refresh token support

fix(whatsapp): resolve connection timeout issue

docs: update installation instructions

style(api): format code with prettier

refactor(media): simplify search logic

test(auth): add unit tests for login flow

chore(deps): update dependencies
```

## Pull Request Process

### Before Submitting

1. **Update your branch** with the latest main:

   ```bash
   git checkout main
   git pull origin main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run all checks**:

   ```bash
   npm run lint
   npm run format:check
   npm run test
   npm run build
   ```

3. **Update documentation** if needed

4. **Squash commits** if you have many small commits:
   ```bash
   git rebase -i main
   ```

### Submitting the PR

1. **Push your branch**:

   ```bash
   git push origin your-feature-branch
   ```

2. **Create the pull request** on GitHub

3. **Fill out the PR template** with:

   - Clear description of changes
   - Reference to related issues (e.g., "Closes #123")
   - Screenshots/GIFs for UI changes
   - Testing notes

4. **Request review** from maintainers

### PR Title Format

Use the same format as commit messages:

```
feat(scope): add new feature
fix(scope): resolve bug
```

### Review Process

- At least one maintainer must approve the PR
- All CI checks must pass
- All review comments must be addressed
- Code must follow our conventions
- Tests must be included for new functionality

### After Approval

- A maintainer will merge your PR
- Your branch will be deleted automatically
- You can delete your local branch:
  ```bash
  git branch -d your-feature-branch
  ```

## Issue Guidelines

### Creating Issues

When creating an issue:

1. **Search first** to avoid duplicates
2. **Use issue templates** when available
3. **Be specific** and provide context
4. **Include examples** or code snippets
5. **Add labels** to categorize the issue

### Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `question` - Further information requested
- `wontfix` - Will not be worked on
- `duplicate` - Duplicate of another issue
- `invalid` - Invalid issue

## Testing Guidelines

### Writing Tests

- Write tests for all new features
- Update tests when modifying existing features
- Aim for at least 80% code coverage
- Write both positive and negative test cases

### Test Organization

```
tests/
├── unit/           # Unit tests for individual functions/classes
├── integration/    # Integration tests for API endpoints
└── e2e/           # End-to-end tests for full workflows
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage
npm run test:coverage

# Run tests in watch mode
npm run test -- --watch
```

### Test Conventions

- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Clean up after tests (reset database, clear mocks)
- Test edge cases and error conditions

### Example Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  afterEach(() => {
    // Cleanup
  });

  describe("login", () => {
    it("should return a token for valid credentials", async () => {
      // Arrange
      const email = "test@example.com";
      const password = "password123";

      // Act
      const result = await authService.login(email, password);

      // Assert
      expect(result).toHaveProperty("token");
      expect(result.token).toBeTruthy();
    });

    it("should throw error for invalid credentials", async () => {
      // Arrange
      const email = "test@example.com";
      const password = "wrongpassword";

      // Act & Assert
      await expect(authService.login(email, password)).rejects.toThrow(
        "Invalid credentials"
      );
    });
  });
});
```

## Documentation

### Code Documentation

- Document complex logic with comments
- Use JSDoc for public APIs
- Keep comments up to date with code changes
- Explain "why" not "what" in comments

### README Updates

Update README.md when:

- Adding new features
- Changing setup/installation process
- Modifying configuration options
- Adding new dependencies

### API Documentation

Update API documentation when:

- Adding new endpoints
- Changing request/response formats
- Modifying authentication requirements
- Adding new query parameters

## Questions?

- Check the [README](README.md) for basic information
- Review existing [issues](https://github.com/techieanant/wamr/issues)
- Ask questions in [discussions](https://github.com/techieanant/wamr/discussions)
- Reach out to maintainers if needed

## License

By contributing to WAMR, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to WAMR! 🚀
