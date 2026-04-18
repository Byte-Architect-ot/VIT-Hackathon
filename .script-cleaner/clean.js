const fs = require('fs');
const path = require('path');
const decomment = require('decomment');
const emojiRegexFn = require('emoji-regex');

const rootDir = '/home/shreyashh/vit';
const targetDirs = ['satyabot-backend', 'satyabot-telegram', 'satyabot-extension'];
const emojiRegex = emojiRegexFn();

// Walk function
function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file.startsWith('.')) continue;
    
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

// Clean function
function cleanFile(filePath) {
  const ext = path.extname(filePath);
  if (!['.js', '.json', '.md', '.txt', '.env'].includes(ext)) {
    return; // skip other files
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Remove comments for JS only
    if (ext === '.js') {
      try {
        content = decomment(content);
      } catch (err) {
        console.error(`Warning: Could not decomment ${filePath} - ${err.message}`);
        // Fallback to simple regex if decomment fails
        content = content.replace(/\/\*[\s\S]*?\*\/|(?<=[^:\\'"\`\/]|^)\/\/.*/g, '');
      }
    }

    // 2. Remove emojis from all targeted files
    content = content.replace(emojiRegex, '');

    // Emojis might leave trailing spaces or extra newlines, but ok
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Cleaned: ${filePath}`);
    }
  } catch (err) {
    console.error(`Status Error on ${filePath}: ${err.message}`);
  }
}

// Run for target dirs
targetDirs.forEach(dir => {
  const fullDirPath = path.join(rootDir, dir);
  if (fs.existsSync(fullDirPath)) {
    console.log(`Processing directory: ${fullDirPath}`);
    walk(fullDirPath, cleanFile);
  }
});

// Also run for root files (like bot.md)
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.statSync(fullPath).isFile() && !file.startsWith('.')) {
    cleanFile(fullPath);
  }
});

console.log('Finished cleaning comments and emojis.');
