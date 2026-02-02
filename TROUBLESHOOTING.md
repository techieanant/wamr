# Troubleshooting Baileys Import Issues

## Error: "makeWASocket is not a function"

If you encounter this error when starting the application:

```
TypeError: makeWASocket is not a function
    at WhatsAppClientService.initialize
```

### Cause

This error occurs when the `@whiskeysockets/baileys` package is not installed correctly or there's a module resolution issue.

### Solution

#### Option 1: Clean Install (Recommended)

```bash
# Remove all lockfiles and node_modules
rm -rf node_modules package-lock.json bun.lockb
rm -rf backend/node_modules frontend/node_modules

# Reinstall with npm (recommended)
npm install

# Or if using bun
bun install
```

#### Option 2: Verify Package Installation

```bash
# Check if baileys is installed
ls -la node_modules/@whiskeysockets/baileys

# If not found, install it
cd backend
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

1. **Mixed package managers**: Using both npm and bun can cause conflicts
   - Solution: Stick to one package manager (npm recommended)

2. **Cached modules**: Old cached versions might conflict
   - Solution: Clear npm/bun cache: `npm cache clean --force` or `rm -rf ~/.bun/cache`

3. **Workspace hoisting**: In monorepo setups, dependencies might be hoisted incorrectly
   - Solution: Ensure backend/package.json has the dependency listed

### Verification

After fixing, verify the import works:

```bash
# Quick verification using npm script
npm run verify

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
