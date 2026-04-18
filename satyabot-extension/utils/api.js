
const API_CONFIG = {
  baseUrl: 'http://localhost:5000/api',
  timeout: 15000
};

async function verifyText(text, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    try {
    const response = await fetch(`${API_CONFIG.baseUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        userId: options.userId || 'extension',
        location: options.location || null
      }),
      signal: controller.signal
    });

        clearTimeout(timeoutId);

        if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

        return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }

        throw error;
  }
}

async function getTrending(limit = 10) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/admin/trending?limit=${limit}`);

        if (!response.ok) {
      throw new Error('Failed to fetch trending data');
    }

        return await response.json();
  } catch (error) {
    console.error('Get trending error:', error);
    return { data: [] };
  }
}