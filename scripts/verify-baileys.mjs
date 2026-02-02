#!/usr/bin/env node

/**
 * Verify Baileys Installation
 * 
 * This script checks if @whiskeysockets/baileys is properly installed
 * and can be imported correctly.
 */

console.log('🔍 Verifying Baileys installation...\n');

async function verifyBaileys() {
  try {
    // Try to import Baileys
    const baileys = await import('@whiskeysockets/baileys');
    
    // Check default export
    if (typeof baileys.default !== 'function') {
      console.error('❌ ERROR: baileys.default is not a function');
      console.error('   Type:', typeof baileys.default);
      return false;
    }
    console.log('✓ Default export (makeWASocket) is a function');
    
    // Check named exports
    const requiredExports = [
      'useMultiFileAuthState',
      'DisconnectReason',
      'Browsers',
      'proto',
      'jidDecode'
    ];
    
    for (const exportName of requiredExports) {
      if (!baileys[exportName]) {
        console.error(`❌ ERROR: Missing export: ${exportName}`);
        return false;
      }
      console.log(`✓ Found export: ${exportName}`);
    }
    
    // Check version
    try {
      const pkg = await import('@whiskeysockets/baileys/package.json', {
        assert: { type: 'json' }
      });
      console.log(`✓ Baileys version: ${pkg.default.version}`);
    } catch (e) {
      console.log('⚠ Could not determine Baileys version');
    }
    
    console.log('\n✅ SUCCESS: Baileys is properly installed!\n');
    return true;
    
  } catch (error) {
    console.error('❌ ERROR: Failed to import Baileys');
    console.error('   Message:', error.message);
    console.error('\n💡 Solution:');
    console.error('   rm -rf node_modules package-lock.json bun.lockb');
    console.error('   rm -rf backend/node_modules frontend/node_modules');
    console.error('   npm install');
    console.error('\n   See TROUBLESHOOTING.md for more details.\n');
    return false;
  }
}

verifyBaileys().then(success => {
  process.exit(success ? 0 : 1);
});
