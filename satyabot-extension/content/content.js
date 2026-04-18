console.log(' SatyaBot extension loaded');

const SELECTORS = {
  headlines: 'h1, h2, h3, .headline, .title, article h1, article h2',

  twitter: '[data-testid="tweetText"]',
  facebook: '[data-ad-preview="message"]',
  whatsapp: '.copyable-text span',

  articleBody: 'article p, .article-content p, .story-content p'
};

let settings = {};

(async function init() {
  settings = await loadSettings();

    if (settings.autoDetect) {
    detectAndVerify();
  }

    setupContextMenu();
  setupObserver();
})();

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

async function detectAndVerify() {
  const currentDomain = window.location.hostname;

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

async function detectTwitterPosts() {
  const tweets = document.querySelectorAll(SELECTORS.twitter);

    tweets.forEach(async (tweet) => {
    if (tweet.hasAttribute('data-satyabot-checked')) return;
    tweet.setAttribute('data-satyabot-checked', 'true');

        const text = tweet.textContent.trim();
    if (text.length < 20) return; 

        const result = await verifyWithAPI(text);

        if (settings.showBadges && result) {
      addVerificationBadge(tweet, result);
    }
  });
}

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

async function detectWhatsAppMessages() {
  const messages = document.querySelectorAll(SELECTORS.whatsapp);

    messages.forEach(async (message) => {
    if (message.hasAttribute('data-satyabot-checked')) return;
    message.setAttribute('data-satyabot-checked', 'true');

        const text = message.textContent.trim();
    if (text.length < 20) return;

    const isForwarded = message.closest('[data-pre-plain-text]')?.textContent.includes('Forwarded');

        if (isForwarded) {
      const result = await verifyWithAPI(text);

            if (result && result.status === 'FAKE') {
        highlightSuspiciousMessage(message, result);
      }
    }
  });
}

async function detectNewsArticles() {
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

async function verifyWithAPI(text) {
  try {
    return await verifyText(text, { userId: 'extension_content' });
  } catch (error) {
    console.error('SatyaBot verification failed:', error);
    return null;
  }
}

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

function addInlineBadge(element, result) {
  const badge = document.createElement('span');
  badge.className = `satyabot-inline-badge satyabot-${result.status.toLowerCase()}`;
  badge.textContent = getStatusEmoji(result.status);
  badge.title = `${result.status} - ${result.explanation_english}`;

    element.appendChild(badge);
}

function highlightSuspiciousMessage(element, result) {
  const warning = document.createElement('div');
  warning.className = 'satyabot-warning';
  warning.innerHTML = `
    <div class="warning-header">
       <strong>SatyaBot Alert</strong>
    </div>
    <p>This forwarded message has been flagged as potentially FALSE.</p>
    <button class="warning-btn" onclick="this.parentElement.style.display='none'">
      Got it
    </button>
  `;

    element.closest('div[class*="message"]').prepend(warning);
}

function getStatusEmoji(status) {
  const emojis = {
    'FAKE': '',
    'TRUE': '',
    'UNVERIFIED': ''
  };
  return emojis[status] || '';
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    settings = message.settings;

        if (settings.autoDetect) {
      detectAndVerify();
    }
  }
});