// Content Script - Runs on all webpages
console.log('🤖 SatyaBot extension loaded');

// Configuration
const SELECTORS = {
  // News Sites
  headlines: 'h1, h2, h3, .headline, .title, article h1, article h2',
  
  // Social Media
  twitter: '[data-testid="tweetText"]',
  facebook: '[data-ad-preview="message"]',
  whatsapp: '.copyable-text span',
  
  // News Bodies
  articleBody: 'article p, .article-content p, .story-content p'
};

let settings = {};

// Initialize
(async function init() {
  settings = await loadSettings();
  
  if (settings.autoDetect) {
    detectAndVerify();
  }
  
  setupContextMenu();
  setupObserver();
})();

// Load Settings from Storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['satyabot_settings'], (result) => {
      resolve(result.satyabot_settings || {
        autoDetect: true,
        showBadges: true,
        notifications: true
      });
    });
  });
}

// Detect and Verify Claims on Page
async function detectAndVerify() {
  const currentDomain = window.location.hostname;
  
  // Platform-specific detection
  if (currentDomain.includes('twitter.com')) {
    await detectTwitterPosts();
  } else if (currentDomain.includes('facebook.com')) {
    await detectFacebookPosts();
  } else if (currentDomain.includes('whatsapp.com')) {
    await detectWhatsAppMessages();
  } else {
    await detectNewsArticles();
  }
}

// Detect Twitter Posts
async function detectTwitterPosts() {
  const tweets = document.querySelectorAll(SELECTORS.twitter);
  
  tweets.forEach(async (tweet) => {
    if (tweet.hasAttribute('data-satyabot-checked')) return;
    tweet.setAttribute('data-satyabot-checked', 'true');
    
    const text = tweet.textContent.trim();
    if (text.length < 20) return; // Skip short tweets
    
    const result = await verifyWithAPI(text);
    
    if (settings.showBadges && result) {
      addVerificationBadge(tweet, result);
    }
  });
}

// Detect Facebook Posts
async function detectFacebookPosts() {
  const posts = document.querySelectorAll(SELECTORS.facebook);
  
  posts.forEach(async (post) => {
    if (post.hasAttribute('data-satyabot-checked')) return;
    post.setAttribute('data-satyabot-checked', 'true');
    
    const text = post.textContent.trim();
    if (text.length < 20) return;
    
    const result = await verifyWithAPI(text);
    
    if (settings.showBadges && result) {
      addVerificationBadge(post, result);
    }
  });
}

// Detect WhatsApp Web Messages
async function detectWhatsAppMessages() {
  const messages = document.querySelectorAll(SELECTORS.whatsapp);
  
  messages.forEach(async (message) => {
    if (message.hasAttribute('data-satyabot-checked')) return;
    message.setAttribute('data-satyabot-checked', 'true');
    
    const text = message.textContent.trim();
    if (text.length < 20) return;
    
    // Check for forwarded messages (higher priority)
    const isForwarded = message.closest('[data-pre-plain-text]')?.textContent.includes('Forwarded');
    
    if (isForwarded) {
      const result = await verifyWithAPI(text);
      
      if (result && result.status === 'FAKE') {
        highlightSuspiciousMessage(message, result);
      }
    }
  });
}

// Detect News Articles
async function detectNewsArticles() {
  // Check headlines
  const headlines = document.querySelectorAll(SELECTORS.headlines);
  
  headlines.forEach(async (headline) => {
    if (headline.hasAttribute('data-satyabot-checked')) return;
    headline.setAttribute('data-satyabot-checked', 'true');
    
    const text = headline.textContent.trim();
    if (text.length < 15 || text.length > 200) return;
    
    const result = await verifyWithAPI(text);
    
    if (settings.showBadges && result) {
      addInlineBadge(headline, result);
    }
  });
}

// API Call to Backend
async function verifyWithAPI(text) {
  try {
    return await verifyText(text, { userId: 'extension_content' });
  } catch (error) {
    console.error('SatyaBot verification failed:', error);
    return null;
  }
}

// Add Verification Badge
function addVerificationBadge(element, result) {
  const badge = document.createElement('div');
  badge.className = `satyabot-badge satyabot-${result.status.toLowerCase()}`;
  badge.innerHTML = `
    <span class="badge-icon">${getStatusEmoji(result.status)}</span>
    <span class="badge-text">${result.status}</span>
    <div class="badge-tooltip">
      <strong>${result.core_claim_extracted}</strong>
      <p>${result.explanation_english}</p>
      <small>Confidence: ${result.confidence_score}%</small>
    </div>
  `;
  
  element.parentElement.insertBefore(badge, element.nextSibling);
}

// Add Inline Badge (for headlines)
function addInlineBadge(element, result) {
  const badge = document.createElement('span');
  badge.className = `satyabot-inline-badge satyabot-${result.status.toLowerCase()}`;
  badge.textContent = getStatusEmoji(result.status);
  badge.title = `${result.status} - ${result.explanation_english}`;
  
  element.appendChild(badge);
}

// Highlight Suspicious WhatsApp Message
function highlightSuspiciousMessage(element, result) {
  const warning = document.createElement('div');
  warning.className = 'satyabot-warning';
  warning.innerHTML = `
    <div class="warning-header">
      ⚠️ <strong>SatyaBot Alert</strong>
    </div>
    <p>This forwarded message has been flagged as potentially FALSE.</p>
    <button class="warning-btn" onclick="this.parentElement.style.display='none'">
      Got it
    </button>
  `;
  
  element.closest('div[class*="message"]').prepend(warning);
}

// Get Status Emoji
function getStatusEmoji(status) {
  const emojis = {
    'FAKE': '🔴',
    'TRUE': '🟢',
    'UNVERIFIED': '🟡'
  };
  return emojis[status] || '⚪';
}

// Setup Context Menu (Right-click)
function setupContextMenu() {
  document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText.length > 10) {
      chrome.runtime.sendMessage({
        type: 'SELECTION_MADE',
        text: selectedText
      });
    }
  });
}

// Setup Mutation Observer (for dynamic content)
function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    if (settings.autoDetect) {
      detectAndVerify();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for settings updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    settings = message.settings;
    
    if (settings.autoDetect) {
      detectAndVerify();
    }
  }
});