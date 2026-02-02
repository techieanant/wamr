# Troubleshooting Baileys Import Issues

## Error: "makeWASocket is not a function"

If you encounter this error when starting the application:

```
TypeError: makeWASocket is not a function
    at WhatsAppClientService.initialize
```

### Cause

This error occurs when the `@whiskeysockets/baileys` package is not installed correctly or there's a module resolution issue with tsx/bun.

### Solution

#### Option 1: Clean Install (Recommended)

```bash
# Remove all lockfiles and node_modules
rm -rf node_modules package-lock.json bun.lockb
rm -rf backend/node_modules frontend/node_modules

# Reinstall with your preferred package manager
bun install
# or
npm install
```

**Note:** The code now supports both npm and bun. If you see this error, it's typically a stale dependency cache issue.

#### Option 2: Verify Package Installation

```bash
# Check if baileys is installed
ls -la node_modules/@whiskeysockets/baileys

# If not found, install it
cd backend
bun add @whiskeysockets/baileys@^6.7.21 @hapi/boom@^10.0.1
# or
npm install @whiskeysockets/baileys@^6.7.21 @hapi/boom@^10.0.1
```

#### Option 3: Check Package Manager

If using Bun, try switching to npm:

```bash
# Remove bun lockfile
rm -f bun.lockb

# Install with npm
npm install

# Run with npm instead
npm run dev
```

### Common Issues

1. **tsx/bun module resolution**: The default export handling differs between tsx and node
   - Solution: The code now uses namespace imports that work with both bun and npm

2. **Cached modules**: Old cached versions might conflict
   - Solution: Clear cache: `bun pm cache rm` or `npm cache clean --force`

3. **Workspace hoisting**: In monorepo setups, dependencies might be hoisted incorrectly
   - Solution: Ensure backend/package.json has the dependency listed

### Verification

After fixing, verify the import works:

```bash
# Quick verification using npm/bun script
npm run verify
# or
bun run verify

# Or run the script directly
node scripts/verify-baileys.mjs
```

### Still Having Issues?

Check these:

1. Node.js version: `node --version` (should be >= 20.0.0)
2. Package versions in backend/package.json:
   - `"@whiskeysockets/baileys": "^6.7.21"`
   - `"@hapi/boom": "^10.0.1"`
3. TypeScript configuration in backend/tsconfig.json:
   - `"moduleResolution": "bundler"`
   - `"esModuleInterop": true`

### For Developers

The issue stems from how ES modules with default exports are resolved in different environments (tsx, node, bun). The code now includes a runtime check to provide a better error message.
