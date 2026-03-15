import { jwtDecode } from 'jwt-decode';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = "http://localhost:4000"
const ACCESS_TOKEN_KEY = '@access_token';
const REFRESH_TOKEN_KEY = '@refresh_token';

let ACCESS_TOKEN = null
let REFRESH_TOKEN = null

// refresh control
let isRefreshing = false
let refreshQueue = []

// CHANGE: Store both access and refresh tokens
export async function setTokens(accessToken, refreshToken) {
  ACCESS_TOKEN = accessToken;
  REFRESH_TOKEN = refreshToken;
  
  if (accessToken && refreshToken) {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function getAccessToken(){
  return ACCESS_TOKEN
}

export function getRefreshToken(){
  return REFRESH_TOKEN
}

// CHANGE: Load both tokens from storage
export async function loadStoredTokens() {
  try {
    const [storedAccessToken, storedRefreshToken] = await Promise.all([
      AsyncStorage.getItem(ACCESS_TOKEN_KEY),
      AsyncStorage.getItem(REFRESH_TOKEN_KEY)
    ]);
    
    if (storedAccessToken && storedRefreshToken) {
      ACCESS_TOKEN = storedAccessToken;
      REFRESH_TOKEN = storedRefreshToken;
      return { accessToken: storedAccessToken, refreshToken: storedRefreshToken };
    }
    return null;
  } catch (error) {
    console.error('Error loading stored tokens:', error);
    return null;
  }
}

// CHANGE: Clear both tokens
export async function clearTokens() {
  ACCESS_TOKEN = null;
  REFRESH_TOKEN = null;
  try {
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY)
    ]);
    console.log('Tokens cleared successfully');
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
}

export function isTokenExpired(token) {
  try {
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    // CHANGE: Add 30 second buffer for token refresh
    return decoded.exp < (currentTime + 30);
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
}

export function decodeToken(token) {
  try {
    const decoded = jwtDecode(token);
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

// CHANGE: Add token refresh functionality
export async function refreshAccessToken() {

  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      refreshQueue.push({ resolve, reject })
    })
  }

  isRefreshing = true

  try {

    if (!REFRESH_TOKEN) {
      throw new Error("No refresh token available")
    }

    const response = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        refreshToken: REFRESH_TOKEN
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Token refresh failed")
    }

    await setTokens(data.accessToken, data.refreshToken)

    // release waiting requests
    refreshQueue.forEach(p => p.resolve(data.accessToken))
    refreshQueue = []

    return data.accessToken

  } catch (err) {

    refreshQueue.forEach(p => p.reject(err))
    refreshQueue = []

    throw err

  } finally {
    isRefreshing = false
  }
}

// CHANGE: Enhanced request function with automatic token refresh
async function request(path, options = {}) {
  let token = ACCESS_TOKEN;

  // CHANGE: Check if token needs refresh
  if (token && isTokenExpired(token)) {
    try {
      token = await refreshAccessToken();
    } catch (error) {
      // CHANGE: If refresh fails, proceed without token (will likely get 401)
      token = null;
    }
  }

  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  // CHANGE: Handle 401 responses by attempting token refresh
  if (response.status === 401 && token && REFRESH_TOKEN) {
    try {
      const newToken = await refreshAccessToken();
      // CHANGE: Retry request with new token
      const retryResponse = await fetch(BASE + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...(options.headers || {})
        }
      });
      return retryResponse.json();
    } catch (refreshError) {
      console.error('Token refresh and retry failed:', refreshError);
      return data;
    }
  }

  return data;
}

// CHANGE: Add logout functionality
async function logout() {
  try {
    if (REFRESH_TOKEN) {
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: REFRESH_TOKEN
        })
      });
    }
  } catch (error) {
    console.error('Logout request failed:', error);
  } finally {
    // CHANGE: Always clear local tokens regardless of server response
    await clearTokens();
  }
}

export const api = {
  // CHANGE: Update signup to handle new token structure
  signup: (data) =>
    request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  // CHANGE: Update login to handle new token structure
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    }),

  // CHANGE: Add logout method
  logout,

  // CHANGE: Add refresh token method
  // refreshToken: () =>
  //   request("/auth/refresh", {
  //     method: "POST",
  //     body: JSON.stringify({ refreshToken: REFRESH_TOKEN })
  //   }),

  chat: (query, conversationId) =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify({ query, conversationId })
    }),

  // CHANGE: Add presigned URL method for admin upload
  getPresignedUrl: (fileName, mimeType) =>
    request("/admin/upload/presigned", {
      method: "POST",
      body: JSON.stringify({ fileName, mimeType })
    }),

  // CHANGE: Add document creation method
  createDocument: (fileName, storageKey) =>
    request("/documents", {
      method: "POST",
      body: JSON.stringify({ fileName, storageKey })
    }),

  // CHANGE: Add document search method
  searchDocuments: (query) =>
    request("/documents/search", {
      method: "POST",
      body: JSON.stringify({ query })
    }),

  // CHANGE: Add method to upload file to S3
  uploadToS3: async (presignedUrl, file) => {
    try {
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      });

      if (!response.ok) {
        throw new Error(`S3 upload failed: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  },

  faqs: () => request("/faqs")
}
