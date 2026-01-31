/**
 * Swytch-eco - Background Service Worker
 * 
 * Features:
 * 1. Google OAuth 登入（查看 Dashboard/Leaderboard/Rewards 需登入）
 * 2. Vision API 分析圖片特徵
 * 3. Supabase 資料同步
 */

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  // Backend API (Railway)
  BACKEND_URL: 'https://your-backend.railway.app',

  // Supabase
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_KEY: 'your-anon-key',

  // Dashboard (Leaderboard, Rewards)
  DASHBOARD_URL: 'https://ecoshopper-dashboard.vercel.app',

  // Google OAuth
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',

  // Settings
  LLM_TIMEOUT: 30000,
  MAX_ALTERNATIVES: 8,
};

// ============================================================
// State
// ============================================================

const state = {
  isAnalyzing: false,
  loadingMessage: '',
  currentProduct: null,
  recommendation: null,
  error: null,

  // User authentication
  user: null,        // { id, email, name, picture, googleId }
  isLoggedIn: false,
  authToken: null,

  // Local user ID (for non-logged-in users)
  localUserId: null,

  // Product view tracking (for impulse purchase warning)
  productViewTracker: {}, // { productId: { count, firstViewed, lastViewed, productInfo } }

  // Data
  itemsViewed: [],
  impactStats: {
    totalCO2: 0,
    totalSearches: 0,
    ecoChoices: 0,
    totalSaved: 0,
    weeklyProgress: 0,
    userRank: null,
  },

  preferences: {
    priority: 'eco_friendly',
    maxBudget: null,
    minRating: null,
    enableCooldown: true,
    cooldownSeconds: 30,
    showCO2: true,
  },
};

// ============================================================
// Initialize
// ============================================================

async function initialize() {
  // Load stored data
  const stored = await chrome.storage.sync.get(['preferences', 'localUserId', 'user', 'authToken']);

  if (stored.preferences) {
    state.preferences = { ...state.preferences, ...stored.preferences };
  }

  state.localUserId = stored.localUserId || generateLocalUserId();

  if (stored.user && stored.authToken) {
    state.user = stored.user;
    state.authToken = stored.authToken;
    state.isLoggedIn = true;
  }

  // Load local data
  const localData = await chrome.storage.local.get(['itemsViewed', 'impactStats']);
  if (localData.itemsViewed) state.itemsViewed = localData.itemsViewed;
  if (localData.impactStats) state.impactStats = { ...state.impactStats, ...localData.impactStats };

  console.log('[Swytch-eco] Initialized, logged in:', state.isLoggedIn);
}

function generateLocalUserId() {
  const id = 'local_' + Math.random().toString(36).substring(2, 15);
  chrome.storage.sync.set({ localUserId: id });
  return id;
}

initialize();

// ============================================================
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_STATE':
      return {
        state: {
          ...state,
          authToken: undefined, // Don't expose token
        }
      };

    case 'UPDATE_PREFERENCES':
      state.preferences = { ...state.preferences, ...message.payload };
      await chrome.storage.sync.set({ preferences: state.preferences });
      return { success: true };

    // === Search ===
    case 'FIND_ALTERNATIVES':
      return await startAnalysis(message.payload, sender.tab?.id);

    case 'RETRY_ANALYSIS':
      if (state.currentProduct) {
        return await startAnalysis(state.currentProduct, sender.tab?.id);
      }
      return { success: false, error: 'No previous analysis to retry' };

    // === Google OAuth ===
    case 'GOOGLE_LOGIN':
      return await googleLogin();

    case 'GOOGLE_LOGOUT':
      return await googleLogout();

    case 'CHECK_LOGIN_STATUS':
      return {
        isLoggedIn: state.isLoggedIn,
        user: state.user
      };

    // === Dashboard (需要登入) ===
    case 'GET_DASHBOARD_URL':
      if (!state.isLoggedIn) {
        return {
          success: false,
          requireLogin: true,
          error: 'Please login with Google to view Dashboard'
        };
      }
      return {
        success: true,
        url: `${CONFIG.DASHBOARD_URL}?token=${state.authToken}&user=${state.user.id}`,
        user: state.user
      };

    // === Items Viewed ===
    case 'GET_ITEMS_VIEWED':
      return await getItemsViewed();

    case 'REMOVE_ITEM_VIEWED':
      return await removeItemViewed(message.payload.id);

    case 'CLEAR_ITEMS_VIEWED':
      return await clearItemsViewed();

    // === Impact Stats ===
    case 'GET_IMPACT_STATS':
      return await getImpactStats();

    case 'TRACK_ECO_CHOICE':
      return await trackEcoChoice(message.payload.productId);

    // === Product View Tracking (Impulse Purchase Warning) ===
    case 'TRACK_PRODUCT_VIEW':
      return await trackProductView(message.payload);

    case 'GET_PRODUCT_VIEW_COUNT':
      return await getProductViewCount(message.payload.productId);

    case 'CLEAR_VIEW_TRACKER':
      return clearViewTracker();

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// ============================================================
// Google OAuth 登入
// ============================================================

async function googleLogin() {
  try {
    // Use Chrome Identity API for OAuth
    const authUrl = `https://accounts.google.com/o/oauth2/auth?` +
      `client_id=${CONFIG.GOOGLE_CLIENT_ID}&` +
      `response_type=token&` +
      `redirect_uri=${chrome.identity.getRedirectURL()}&` +
      `scope=email profile`;

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    // Extract access token from response URL
    const urlParams = new URL(responseUrl.replace('#', '?')).searchParams;
    const accessToken = urlParams.get('access_token');

    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    // Get user info from Google
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userInfoResponse.json();

    // Store user data
    state.user = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      googleId: userInfo.id,
    };
    state.authToken = accessToken;
    state.isLoggedIn = true;

    // Save to storage
    await chrome.storage.sync.set({
      user: state.user,
      authToken: state.authToken,
    });

    // Sync with backend (optional)
    await syncUserToBackend(state.user, accessToken);

    console.log('[Swytch-eco] Google login successful:', state.user.email);

    return {
      success: true,
      user: state.user
    };

  } catch (error) {
    console.error('[Swytch-eco] Google login error:', error);
    return {
      success: false,
      error: error.message || 'Login failed'
    };
  }
}

async function googleLogout() {
  try {
    // Clear local state
    state.user = null;
    state.authToken = null;
    state.isLoggedIn = false;

    // Clear storage
    await chrome.storage.sync.remove(['user', 'authToken']);

    // Revoke token (optional)
    // await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${state.authToken}`);

    console.log('[Swytch-eco] Logged out');

    return { success: true };

  } catch (error) {
    console.error('[Swytch-eco] Logout error:', error);
    return { success: false, error: error.message };
  }
}

async function syncUserToBackend(user, token) {
  try {
    await fetch(`${CONFIG.BACKEND_URL}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        localUserId: state.localUserId,
      }),
    });
  } catch (error) {
    console.warn('[Swytch-eco] Failed to sync user to backend:', error);
  }
}

// ============================================================
// Product View Tracking (Impulse Purchase Warning)
// ============================================================

async function trackProductView(productInfo) {
  if (!productInfo?.productId) {
    return { success: false, error: 'No product ID' };
  }

  const productId = productInfo.productId;
  const now = Date.now();
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Load tracker from storage
  const stored = await chrome.storage.local.get(['productViewTracker']);
  state.productViewTracker = stored.productViewTracker || {};

  // Clean up old entries (older than 1 week)
  for (const id in state.productViewTracker) {
    if (state.productViewTracker[id].lastViewed < oneWeekAgo) {
      delete state.productViewTracker[id];
    }
  }

  // Track this view
  if (!state.productViewTracker[productId]) {
    state.productViewTracker[productId] = {
      count: 0,
      firstViewed: now,
      lastViewed: now,
      productInfo: {
        name: productInfo.name,
        price: productInfo.price,
        imageUrl: productInfo.imageSource,
        url: productInfo.url,
        category: productInfo.category,
      },
    };
  }

  state.productViewTracker[productId].count++;
  state.productViewTracker[productId].lastViewed = now;

  // Save to storage
  await chrome.storage.local.set({ productViewTracker: state.productViewTracker });

  const viewCount = state.productViewTracker[productId].count;

  console.log(`[Swytch-eco] Product "${productInfo.name}" viewed ${viewCount} times this week`);

  return {
    success: true,
    viewCount: viewCount,
    showWarning: viewCount >= 3,
    productInfo: state.productViewTracker[productId].productInfo,
  };
}

async function getProductViewCount(productId) {
  // Load from storage first
  const stored = await chrome.storage.local.get(['productViewTracker']);
  state.productViewTracker = stored.productViewTracker || {};

  const tracker = state.productViewTracker[productId];
  const viewCount = tracker?.count || 0;

  console.log(`[Swytch-eco] getProductViewCount: ${productId} = ${viewCount}`);

  return {
    success: true,
    viewCount: viewCount,
    showWarning: viewCount >= 3,
  };
}

async function clearViewTracker() {
  state.productViewTracker = {};
  await chrome.storage.local.remove(['productViewTracker']);
  return { success: true };
}

// ============================================================
// 精確的以圖搜圖分析流程
// ============================================================

async function startAnalysis(product, tabId) {
  if (state.isAnalyzing) {
    return { success: false, error: 'Analysis already in progress' };
  }

  state.isAnalyzing = true;
  state.currentProduct = product;
  state.error = null;
  state.recommendation = null;

  try {
    broadcastMessage({ type: 'ANALYSIS_STARTED' });

    // Step 1: Save to history
    updateProgress('Saving to history...');
    await addToItemsViewed(product);

    // Step 2: 使用 Vision API 分析圖片（精確識別）
    updateProgress('Analyzing image with AI vision...');
    const imageAnalysis = await analyzeImageWithVision(product.imageSource);

    if (!imageAnalysis.success) {
      throw new Error(imageAnalysis.error || 'Image analysis failed');
    }

    // Step 3: 使用分析結果搜尋相似商品
    updateProgress('Finding visually similar products...');
    const similarProducts = await searchVisuallySimularProducts(
      imageAnalysis.data,
      product
    );

    if (!similarProducts.length) {
      throw new Error('No similar products found');
    }

    // Step 4: 使用 LLM 分析和排序
    updateProgress('Ranking sustainable alternatives...');
    const recommendation = await buildRecommendation(
      product,
      similarProducts,
      imageAnalysis.data
    );

    state.recommendation = recommendation;
    state.isAnalyzing = false;

    // Update stats
    state.impactStats.totalSearches++;
    state.impactStats.totalCO2 += recommendation.totalCO2Savings;
    await chrome.storage.local.set({ impactStats: state.impactStats });

    broadcastMessage({
      type: 'ANALYSIS_COMPLETE',
      payload: recommendation,
    });

    return { success: true, recommendation };

  } catch (error) {
    state.isAnalyzing = false;
    state.error = {
      code: 'ANALYSIS_ERROR',
      message: error.message || 'Analysis failed',
    };

    broadcastMessage({
      type: 'ANALYSIS_ERROR',
      payload: state.error,
    });

    return { success: false, error: state.error };
  }
}

/**
 * Step 2: 使用 Vision API 精確分析圖片
 * 
 * 流程：
 * 1. 將圖片 URL 轉換為 base64
 * 2. 傳送到 Backend Vision API
 * 3. Backend 呼叫 Google Cloud Vision / OpenAI Vision / Claude Vision
 * 4. 回傳詳細的商品視覺特徵
 */
async function analyzeImageWithVision(imageUrl) {
  try {
    // === Mock 實作（開發用）===
    // 直接使用 URL 進行分析，不需要轉換 base64
    updateProgress('Analyzing product with AI Vision...');

    await delay(300);  // 快速回應

    // 根據圖片 URL 生成不同的分析結果（模擬真實場景）
    const mockAnalysis = generateMockVisionAnalysis(imageUrl);

    console.log('[Swytch-eco] Vision analysis result:', mockAnalysis.category);

    return {
      success: true,
      data: mockAnalysis,
    };

  } catch (error) {
    console.error('[Swytch-eco] Vision analysis error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 將圖片 URL 轉換為 base64
 * 這樣可以把完整圖片資料傳送到後端進行視覺分析
 */
async function imageUrlToBase64(imageUrl) {
  try {
    // 使用 fetch 獲取圖片
    const response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();

    // 轉換為 base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        // 只保留 data 部分
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.warn('[Swytch-eco] Image conversion error, using URL fallback:', error.message);
    // 如果轉換失敗，回傳 null，後端會用 imageUrl 作為備用
    return null;
  }
}

/**
 * 模擬 Vision API 分析結果
 * 根據 URL 特徵生成不同的商品分析
 */
function generateMockVisionAnalysis(imageUrl) {
  // 根據 URL 判斷可能的商品類型（模擬真實 Vision 分析）
  const url = imageUrl.toLowerCase();

  let category, attributes, searchTags, colors;

  // Clothing / Fashion
  if (url.includes('dress') || url.includes('wedding') || url.includes('gown') || url.includes('bride')) {
    category = { primary: 'Fashion', secondary: 'Clothing', tertiary: 'Dress', confidence: 0.94 };
    attributes = { type: 'dress', material: 'fabric/lace', features: ['formal', 'elegant', 'feminine'], style: 'vintage' };
    searchTags = ['sustainable dress', 'eco-friendly wedding dress', 'vintage dress', 'secondhand bridal', 'organic cotton dress'];
    colors = ['#ffffff', '#f5f5dc', '#faf0e6'];
  } else if (url.includes('shirt') || url.includes('tshirt') || url.includes('top') || url.includes('blouse')) {
    category = { primary: 'Fashion', secondary: 'Clothing', tertiary: 'Top', confidence: 0.91 };
    attributes = { type: 'shirt/top', material: 'cotton/polyester', features: ['casual', 'everyday'] };
    searchTags = ['organic cotton shirt', 'sustainable top', 'eco-friendly shirt', 'recycled fabric top'];
    colors = ['#ffffff', '#1a1a1a', '#3b82f6'];
  } else if (url.includes('pant') || url.includes('jean') || url.includes('trouser')) {
    category = { primary: 'Fashion', secondary: 'Clothing', tertiary: 'Pants', confidence: 0.90 };
    attributes = { type: 'pants', material: 'denim/cotton', features: ['casual', 'everyday'] };
    searchTags = ['sustainable jeans', 'organic cotton pants', 'eco-friendly denim', 'recycled pants'];
    colors = ['#1e3a5f', '#1a1a1a', '#4b5563'];
  } else if (url.includes('jacket') || url.includes('coat') || url.includes('sweater') || url.includes('hoodie')) {
    category = { primary: 'Fashion', secondary: 'Clothing', tertiary: 'Outerwear', confidence: 0.89 };
    attributes = { type: 'outerwear', material: 'cotton/polyester/wool', features: ['warm', 'layering'] };
    searchTags = ['sustainable jacket', 'eco-friendly coat', 'organic sweater', 'recycled outerwear'];
    colors = ['#1f2937', '#4b5563', '#059669'];
  } else if (url.includes('shoe') || url.includes('sneaker') || url.includes('nike') || url.includes('adidas') || url.includes('boot')) {
    category = { primary: 'Fashion', secondary: 'Footwear', tertiary: 'Shoes', confidence: 0.92 };
    attributes = { type: 'shoes', material: 'mesh/synthetic/leather', features: ['cushioned', 'comfortable'] };
    searchTags = ['sustainable sneakers', 'eco-friendly shoes', 'vegan footwear', 'recycled material shoes'];
    colors = ['#1a1a1a', '#ffffff', '#e63946'];
    // Electronics
  } else if (url.includes('phone') || url.includes('iphone') || url.includes('samsung') || url.includes('pixel') || url.includes('mobile')) {
    category = { primary: 'Electronics', secondary: 'Mobile', tertiary: 'Smartphone', confidence: 0.95 };
    attributes = { type: 'smartphone', material: 'glass/aluminum', features: ['touchscreen', 'camera', 'wireless'] };
    searchTags = ['refurbished phone', 'sustainable smartphone', 'eco-friendly phone case', 'recycled phone'];
    colors = ['#1a1a1a', '#374151', '#6b7280'];
  } else if (url.includes('laptop') || url.includes('macbook') || url.includes('notebook') || url.includes('computer')) {
    category = { primary: 'Electronics', secondary: 'Computers', tertiary: 'Laptop', confidence: 0.94 };
    attributes = { type: 'laptop computer', material: 'aluminum/plastic', features: ['portable', 'keyboard', 'display'] };
    searchTags = ['refurbished laptop', 'sustainable computer', 'eco-friendly laptop', 'energy efficient computer'];
    colors = ['#374151', '#9ca3af', '#d1d5db'];
  } else if (url.includes('headphone') || url.includes('earbud') || url.includes('airpod') || url.includes('audio')) {
    category = { primary: 'Electronics', secondary: 'Audio', tertiary: 'Wireless Earbuds', confidence: 0.93 };
    attributes = { type: 'true wireless earbuds', material: 'plastic', features: ['bluetooth', 'charging case', 'in-ear'] };
    searchTags = ['sustainable earbuds', 'eco-friendly headphones', 'refurbished audio', 'recycled material earbuds'];
    colors = ['#ffffff', '#1a1a1a', '#3b82f6'];
  } else if (url.includes('watch') || url.includes('smartwatch')) {
    category = { primary: 'Electronics', secondary: 'Wearables', tertiary: 'Smartwatch', confidence: 0.91 };
    attributes = { type: 'smartwatch', material: 'aluminum/silicone', features: ['fitness tracking', 'notifications', 'touchscreen'] };
    searchTags = ['refurbished smartwatch', 'sustainable wearable', 'eco-friendly watch band'];
    colors = ['#1f2937', '#374151', '#22c55e'];
    // Bags
  } else if (url.includes('bag') || url.includes('backpack') || url.includes('purse') || url.includes('handbag')) {
    category = { primary: 'Fashion', secondary: 'Bags', tertiary: 'Bag', confidence: 0.89 };
    attributes = { type: 'bag', material: 'nylon/polyester/canvas', features: ['multiple compartments', 'durable'] };
    searchTags = ['sustainable bag', 'eco-friendly backpack', 'recycled material bag', 'vegan leather bag'];
    colors = ['#1f2937', '#4b5563', '#059669'];
    // Home & Furniture
  } else if (url.includes('chair') || url.includes('sofa') || url.includes('furniture') || url.includes('desk') || url.includes('table')) {
    category = { primary: 'Home', secondary: 'Furniture', tertiary: 'Furniture', confidence: 0.88 };
    attributes = { type: 'furniture', material: 'wood/metal/fabric', features: ['home decor', 'functional'] };
    searchTags = ['sustainable furniture', 'eco-friendly home', 'reclaimed wood furniture', 'secondhand furniture'];
    colors = ['#8b4513', '#d2691e', '#f5f5dc'];
    // Beauty
  } else if (url.includes('makeup') || url.includes('cosmetic') || url.includes('beauty') || url.includes('skincare')) {
    category = { primary: 'Beauty', secondary: 'Cosmetics', tertiary: 'Beauty Product', confidence: 0.87 };
    attributes = { type: 'beauty product', material: 'various', features: ['personal care', 'cosmetic'] };
    searchTags = ['sustainable beauty', 'eco-friendly cosmetics', 'organic skincare', 'cruelty-free makeup'];
    colors = ['#ffc0cb', '#ff69b4', '#ffffff'];
  } else {
    // 預設：通用商品分析（根據圖片本身分析）
    category = { primary: 'Fashion', secondary: 'Clothing', tertiary: 'Apparel', confidence: 0.80 };
    attributes = { type: 'apparel', material: 'fabric', features: ['general use'] };
    searchTags = ['sustainable alternative', 'eco-friendly option', 'secondhand', 'recycled material'];
    colors = ['#6b7280', '#9ca3af', '#d1d5db'];
  }

  return {
    // 商品類別（精確識別）
    category,

    // 視覺特徵
    visualFeatures: {
      dominantColors: colors,
      colorScheme: colors[0].startsWith('#1') || colors[0].startsWith('#2') || colors[0].startsWith('#3') ? 'dark' : 'light',
      shape: 'compact',
      style: attributes.style || 'modern',
      texture: attributes.material,
    },

    // 商品屬性（從圖片識別）
    attributes,

    // 偵測到的文字（OCR）
    detectedText: [],
    detectedLogos: [],

    // 商品標籤（用於搜尋）
    searchTags,

    // 視覺相似度向量（128維，用於 embedding 比對）
    visualEmbedding: Array(128).fill(0).map(() => Math.random()),

    // 估計價格範圍
    estimatedPriceRange: {
      min: 20,
      max: 200,
      currency: 'USD',
    },

    // 信心分數
    overallConfidence: category.confidence,
  };
}

/**
 * Step 3: 基於視覺特徵搜尋相似商品
 * 
 * 真實實作流程：
 * 1. 用視覺 embedding 在商品資料庫中搜尋（向量相似度）
 * 2. 用識別出的類別和標籤進行關鍵字搜尋
 * 3. 結合兩種結果並按相似度排序
 * 4. 過濾出環保/永續的選項
 */
async function searchVisuallySimularProducts(imageAnalysis, sourceProduct) {
  try {
    updateProgress('Searching for visually similar products...');

    // === 實際 API 呼叫（上線時啟用）===
    /*
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/search/visual`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': state.authToken ? `Bearer ${state.authToken}` : '',
      },
      body: JSON.stringify({
        visualEmbedding: imageAnalysis.visualEmbedding,
        category: imageAnalysis.category,
        searchTags: imageAnalysis.searchTags,
        attributes: imageAnalysis.attributes,
        priceRange: imageAnalysis.estimatedPriceRange,
        sourceProduct,
        userPreferences: state.preferences,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }
    
    return await response.json();
    */

    // === Mock 實作（開發用）===
    await delay(200);  // 快速回應

    // 根據 Vision 分析結果生成精確的替代商品
    const products = generateVisuallySimularProducts(imageAnalysis, sourceProduct);

    // 根據使用者偏好過濾
    let filtered = products;

    if (state.preferences.maxBudget) {
      filtered = filtered.filter(p => p.price <= state.preferences.maxBudget);
    }

    if (state.preferences.minRating) {
      filtered = filtered.filter(p => p.rating >= state.preferences.minRating);
    }

    // 排除來源平台（避免顯示同一平台的商品）
    if (sourceProduct.platform) {
      const sourcePlatform = sourceProduct.platform.toLowerCase();
      filtered = filtered.filter(p =>
        p.platform.toLowerCase() !== sourcePlatform
      );
    }

    return filtered;

  } catch (error) {
    console.error('[Swytch-eco] Visual search error:', error);
    return [];
  }
}

/**
 * 根據 Vision 分析結果生成視覺相似的商品
 * 這模擬了真實的視覺搜尋結果
 */
function generateVisuallySimularProducts(imageAnalysis, sourceProduct) {
  const category = imageAnalysis.category;
  const categoryName = category.tertiary || category.secondary || category.primary;
  const basePrice = sourceProduct.price || imageAnalysis.estimatedPriceRange?.max || 100;
  const searchTags = imageAnalysis.searchTags || [];
  const attributes = imageAnalysis.attributes || {};

  // 根據類別生成更精確的商品名稱
  const productTemplates = getProductTemplates(categoryName, attributes);

  const platforms = [
    { id: 'amazon', name: 'Amazon', baseUrl: 'https://amazon.com/dp/' },
    { id: 'walmart', name: 'Walmart', baseUrl: 'https://walmart.com/ip/' },
    { id: 'target', name: 'Target', baseUrl: 'https://target.com/p/' },
    { id: 'ebay', name: 'eBay', baseUrl: 'https://ebay.com/itm/' },
    { id: 'bestbuy', name: 'Best Buy', baseUrl: 'https://bestbuy.com/site/' },
  ];

  const ecoLabels = [
    { label: 'Climate Pledge Friendly', detail: 'Carbon-neutral shipping, sustainable materials' },
    { label: 'Certified Refurbished', detail: 'Extends product lifecycle, reduces e-waste' },
    { label: 'Recycled Materials', detail: 'Made with 80%+ recycled content' },
    { label: 'Energy Star', detail: 'Energy efficient, reduces power consumption' },
    { label: 'Fair Trade Certified', detail: 'Ethical production, fair wages' },
    { label: 'Ocean Plastic', detail: 'Made from recycled ocean plastic' },
  ];

  // 生成 5-6 個視覺相似的商品
  const products = productTemplates.map((template, index) => {
    const platform = platforms[index % platforms.length];
    const priceMultiplier = template.priceMultiplier || (0.5 + Math.random() * 0.6);
    const price = Math.round(basePrice * priceMultiplier * 100) / 100;
    const isEco = template.isEco !== false && (index < 3 || Math.random() > 0.3);
    const ecoInfo = isEco ? ecoLabels[index % ecoLabels.length] : null;

    // 計算視覺相似度（基於類別匹配和特徵匹配）
    const visualSimilarity = calculateMockVisualSimilarity(
      template,
      imageAnalysis,
      0.75 + Math.random() * 0.2  // 75%-95% 相似度
    );

    return {
      id: `${platform.id}-visual-${Date.now()}-${index}`,
      name: template.name,
      price,
      currency: '$',
      imageUrl: `https://picsum.photos/seed/${categoryName.replace(/\s/g, '')}${index}/300/300`,
      productUrl: `${platform.baseUrl}B0EXAMPLE${index}`,
      platform: platform.id,
      platformName: platform.name,
      rating: 4.0 + Math.random() * 0.9,
      reviewCount: Math.floor(100 + Math.random() * 10000),

      // 視覺相似度（核心指標）
      visualSimilarity,

      // 匹配原因（說明為什麼這是相似商品）
      matchReasons: generateMatchReasons(template, imageAnalysis),

      // 環保資訊
      co2Savings: isEco ? 1.5 + Math.random() * 4 : 0.5,
      isEcoFriendly: isEco,
      ecoLabel: ecoInfo?.label || null,
      ecoDetails: ecoInfo?.detail || null,

      // 商品描述
      blurb: template.blurb,

      // 額外的視覺特徵匹配資訊
      matchedFeatures: {
        category: category.tertiary || category.secondary,
        type: attributes.type,
        material: template.material || attributes.material,
        style: imageAnalysis.visualFeatures?.style,
      },
    };
  });

  // 按視覺相似度排序
  return products.sort((a, b) => b.visualSimilarity - a.visualSimilarity);
}

/**
 * 根據商品類別獲取商品模板
 */
function getProductTemplates(categoryName, attributes) {
  const category = categoryName.toLowerCase();

  if (category.includes('earbud') || category.includes('headphone') || category.includes('audio')) {
    return [
      { name: 'Eco-Certified Wireless Earbuds - Recycled Plastic', priceMultiplier: 0.7, isEco: true, blurb: 'Made from 100% recycled ocean plastic, same audio quality' },
      { name: 'Refurbished Premium TWS Earbuds - Like New', priceMultiplier: 0.45, isEco: true, blurb: 'Certified refurbished, 1-year warranty, reduces e-waste' },
      { name: 'Sustainable Bluetooth Earphones - Carbon Neutral', priceMultiplier: 0.8, isEco: true, blurb: 'Carbon neutral production, biodegradable packaging' },
      { name: 'Budget Wireless Earbuds - Great Value', priceMultiplier: 0.35, isEco: false, blurb: 'Affordable alternative with similar features' },
      { name: 'Premium Noise-Canceling TWS - Eco Edition', priceMultiplier: 1.1, isEco: true, blurb: 'Top-tier audio with sustainable materials' },
    ];
  }

  if (category.includes('phone') || category.includes('smartphone') || category.includes('mobile')) {
    return [
      { name: 'Certified Refurbished Smartphone - Grade A', priceMultiplier: 0.55, isEco: true, blurb: 'Like-new condition, 1-year warranty, saves 80% CO₂' },
      { name: 'Pre-owned Premium Phone - Excellent Condition', priceMultiplier: 0.45, isEco: true, blurb: 'Thoroughly tested, extends device lifecycle' },
      { name: 'Eco-Friendly Smartphone - Modular Design', priceMultiplier: 0.85, isEco: true, blurb: 'Repairable, upgradeable, reduces e-waste' },
      { name: 'Budget Android Phone - Similar Specs', priceMultiplier: 0.4, isEco: false, blurb: 'Great value alternative with comparable features' },
      { name: 'Renewed Flagship Phone - 1 Year Warranty', priceMultiplier: 0.6, isEco: true, blurb: 'Factory renewed, full warranty coverage' },
    ];
  }

  if (category.includes('laptop') || category.includes('notebook') || category.includes('computer')) {
    return [
      { name: 'Certified Refurbished Laptop - Enterprise Grade', priceMultiplier: 0.5, isEco: true, blurb: 'Business-class quality, tested & certified' },
      { name: 'Energy Star Certified Laptop - Low Power', priceMultiplier: 0.85, isEco: true, blurb: 'Uses 30% less energy, same performance' },
      { name: 'Pre-owned MacBook/ThinkPad - Excellent', priceMultiplier: 0.55, isEco: true, blurb: 'Premium quality, significantly reduced CO₂' },
      { name: 'Eco-Friendly Chromebook - Recycled Aluminum', priceMultiplier: 0.4, isEco: true, blurb: 'Sustainable materials, perfect for daily tasks' },
      { name: 'Budget Laptop - Similar Performance', priceMultiplier: 0.45, isEco: false, blurb: 'Affordable option with comparable specs' },
    ];
  }

  if (category.includes('sneaker') || category.includes('shoe') || category.includes('footwear')) {
    return [
      { name: 'Sustainable Running Shoes - Recycled Materials', priceMultiplier: 0.75, isEco: true, material: 'recycled polyester', blurb: 'Made from recycled bottles, same comfort' },
      { name: 'Eco-Friendly Athletic Shoes - Plant-Based', priceMultiplier: 0.85, isEco: true, material: 'plant-based', blurb: 'Vegan materials, carbon-negative production' },
      { name: 'Pre-owned Designer Sneakers - Like New', priceMultiplier: 0.5, isEco: true, blurb: 'Authenticated, extends product lifecycle' },
      { name: 'Budget Sports Shoes - Great Value', priceMultiplier: 0.35, isEco: false, blurb: 'Similar style and comfort at lower price' },
      { name: 'Ocean Plastic Sneakers - Certified', priceMultiplier: 0.9, isEco: true, material: 'ocean plastic', blurb: 'Each pair removes 11 plastic bottles from ocean' },
    ];
  }

  if (category.includes('watch') || category.includes('smartwatch') || category.includes('wearable')) {
    return [
      { name: 'Refurbished Smartwatch - Certified', priceMultiplier: 0.55, isEco: true, blurb: 'Like-new condition, full warranty' },
      { name: 'Eco-Friendly Fitness Tracker - Solar Powered', priceMultiplier: 0.7, isEco: true, blurb: 'Solar charging, no battery waste' },
      { name: 'Pre-owned Premium Watch - Authenticated', priceMultiplier: 0.6, isEco: true, blurb: 'Verified authentic, extends lifecycle' },
      { name: 'Budget Fitness Band - Similar Features', priceMultiplier: 0.3, isEco: false, blurb: 'Same core features at lower cost' },
      { name: 'Sustainable Smartwatch - Recycled Aluminum', priceMultiplier: 0.85, isEco: true, blurb: 'Made with 100% recycled aluminum case' },
    ];
  }

  if (category.includes('bag') || category.includes('backpack')) {
    return [
      { name: 'Sustainable Backpack - Recycled PET', priceMultiplier: 0.7, isEco: true, material: 'recycled PET', blurb: 'Made from 20 recycled bottles' },
      { name: 'Eco-Friendly Daypack - Organic Cotton', priceMultiplier: 0.8, isEco: true, material: 'organic cotton', blurb: 'Organic, fair trade certified' },
      { name: 'Upcycled Designer Bag - Pre-owned', priceMultiplier: 0.5, isEco: true, blurb: 'Authenticated luxury, circular fashion' },
      { name: 'Budget Backpack - Similar Style', priceMultiplier: 0.35, isEco: false, blurb: 'Similar design at better price' },
      { name: 'Ocean Plastic Bag - Certified', priceMultiplier: 0.85, isEco: true, material: 'ocean plastic', blurb: 'Made from recovered ocean waste' },
    ];
  }

  // Clothing - Dress
  if (category.includes('dress') || category.includes('gown') || category.includes('bridal') || category.includes('wedding')) {
    return [
      { name: 'Vintage Lace Wedding Dress - Pre-owned', priceMultiplier: 0.35, isEco: true, material: 'lace/silk', blurb: 'Beautiful pre-loved gown, professionally cleaned' },
      { name: 'Sustainable Bridal Gown - Organic Silk', priceMultiplier: 0.85, isEco: true, material: 'organic silk', blurb: 'Eco-friendly luxury, GOTS certified organic' },
      { name: 'Rental Designer Wedding Dress', priceMultiplier: 0.25, isEco: true, blurb: 'Rent the runway, reduce waste, save 70%' },
      { name: 'Upcycled Vintage Bridal - Redesigned', priceMultiplier: 0.55, isEco: true, material: 'upcycled vintage', blurb: 'Unique vintage pieces redesigned for modern brides' },
      { name: 'Eco-Conscious Wedding Gown - Recycled Lace', priceMultiplier: 0.75, isEco: true, material: 'recycled lace', blurb: 'Made from deadstock fabrics, zero-waste pattern' },
    ];
  }

  // Clothing - General
  if (category.includes('clothing') || category.includes('apparel') || category.includes('top') || category.includes('shirt') || category.includes('pants') || category.includes('outerwear')) {
    return [
      { name: 'Organic Cotton Essential - Fair Trade', priceMultiplier: 0.7, isEco: true, material: 'organic cotton', blurb: 'GOTS certified organic, fair trade production' },
      { name: 'Secondhand Designer - Like New', priceMultiplier: 0.4, isEco: true, blurb: 'Pre-loved quality, extends garment life by years' },
      { name: 'Recycled Fabric Basics - Eco Line', priceMultiplier: 0.65, isEco: true, material: 'recycled polyester', blurb: 'Made from 12 recycled plastic bottles' },
      { name: 'Vintage Thrift Find - Unique Style', priceMultiplier: 0.25, isEco: true, blurb: 'One-of-a-kind vintage, circular fashion' },
      { name: 'Sustainable Fashion Brand - B Corp', priceMultiplier: 0.9, isEco: true, material: 'sustainable blend', blurb: 'B Corp certified, living wage guarantee' },
    ];
  }

  // 預設模板
  return [
    { name: `Eco-Friendly ${categoryName} - Sustainable Choice`, priceMultiplier: 0.75, isEco: true, blurb: 'Environmentally responsible alternative' },
    { name: `Refurbished ${categoryName} - Certified`, priceMultiplier: 0.5, isEco: true, blurb: 'Tested and certified, like-new condition' },
    { name: `Pre-owned ${categoryName} - Excellent Condition`, priceMultiplier: 0.45, isEco: true, blurb: 'Extends product lifecycle, reduces waste' },
    { name: `Budget ${categoryName} - Great Value`, priceMultiplier: 0.4, isEco: false, blurb: 'Affordable alternative with similar features' },
    { name: `Premium ${categoryName} - Eco Edition`, priceMultiplier: 0.95, isEco: true, blurb: 'High quality with sustainability focus' },
  ];
}

/**
 * 計算模擬的視覺相似度
 */
function calculateMockVisualSimilarity(template, imageAnalysis, baseSimilarity) {
  // 基於類別匹配調整相似度
  let similarity = baseSimilarity;

  // Eco 商品通常更相似（因為搜尋針對性更強）
  if (template.isEco) {
    similarity += 0.02;
  }

  // 確保在 0-1 範圍內
  return Math.min(0.98, Math.max(0.6, similarity));
}

/**
 * 生成匹配原因
 */
function generateMatchReasons(template, imageAnalysis) {
  const reasons = [];
  const category = imageAnalysis.category;

  // 類別匹配
  reasons.push(`Same category: ${category.tertiary || category.secondary}`);

  // 類型匹配
  if (imageAnalysis.attributes?.type) {
    reasons.push(`Similar type: ${imageAnalysis.attributes.type}`);
  }

  // 樣式匹配
  if (imageAnalysis.visualFeatures?.style) {
    reasons.push(`Matching style: ${imageAnalysis.visualFeatures.style}`);
  }

  // 材質匹配
  if (template.material || imageAnalysis.attributes?.material) {
    reasons.push(`Compatible material`);
  }

  // Eco 標籤
  if (template.isEco) {
    reasons.push(`Eco-friendly alternative`);
  }

  return reasons.slice(0, 3);  // 最多顯示 3 個原因
}

/**
 * Step 4: 建構最終推薦結果
 */
async function buildRecommendation(sourceProduct, alternatives, imageAnalysis) {
  // 根據偏好排序
  const sorted = sortByPreference(alternatives, state.preferences);

  // 計算節省金額
  const sourcePrice = sourceProduct.price || 0;
  const bestPrice = sorted[0]?.price || sourcePrice;
  const potentialSavings = Math.max(0, sourcePrice - bestPrice);

  // 計算平均 CO2 節省
  const totalCO2Savings = sorted.reduce((sum, p) => sum + (p.co2Savings || 0), 0) / sorted.length;

  return {
    alternatives: sorted,
    sourceProduct,
    imageAnalysis: {
      category: imageAnalysis.category,
      searchTags: imageAnalysis.searchTags,
    },
    potentialSavings,
    totalCO2Savings,
    dissuasionMessage: getDissuasionMessage(),
    metadata: {
      searchTime: Date.now(),
      totalResults: sorted.length,
      analysisMethod: 'visual_similarity',
    },
  };
}

function sortByPreference(products, preferences) {
  const sorted = [...products];

  switch (preferences.priority) {
    case 'eco_friendly':
      sorted.sort((a, b) => {
        if (a.isEcoFriendly && !b.isEcoFriendly) return -1;
        if (!a.isEcoFriendly && b.isEcoFriendly) return 1;
        return (b.co2Savings || 0) - (a.co2Savings || 0);
      });
      break;
    case 'save_money':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'quality':
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'balanced':
    default:
      sorted.sort((a, b) => {
        const scoreA = ((a.rating || 3) / a.price) * (a.isEcoFriendly ? 1.5 : 1) * (a.visualSimilarity || 0.5);
        const scoreB = ((b.rating || 3) / b.price) * (b.isEcoFriendly ? 1.5 : 1) * (b.visualSimilarity || 0.5);
        return scoreB - scoreA;
      });
  }

  return sorted;
}

function getDissuasionMessage() {
  const messages = [
    '🌍 Before buying, ask yourself: Do I really need this, or do I just want it?',
    '🌱 Every purchase has an environmental impact. Is this one worth it?',
    '💭 Sleep on it! 70% of impulse purchases are regretted within a week.',
    '♻️ Could you borrow, rent, or buy this second-hand instead?',
    '🎯 Think about the "cost per use" - will you use this enough?',
    '💚 Consider: Does this align with your sustainability goals?',
    '⏰ The 24-hour rule: If you still want it tomorrow, it might be worth it.',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================================
// Helper Functions
// ============================================================

function updateProgress(message) {
  state.loadingMessage = message;
  broadcastMessage({
    type: 'ANALYSIS_PROGRESS',
    payload: { message },
  });
}

function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => { });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Items Viewed
// ============================================================

async function addToItemsViewed(product) {
  const item = {
    id: `item_${Date.now()}`,
    name: product.name || 'Unknown Product',
    imageUrl: product.imageSource,
    price: product.price,
    platform: product.platform,
    productUrl: product.pageUrl,
    viewedAt: new Date().toISOString(),
  };

  state.itemsViewed.unshift(item);

  if (state.itemsViewed.length > 50) {
    state.itemsViewed = state.itemsViewed.slice(0, 50);
  }

  await chrome.storage.local.set({ itemsViewed: state.itemsViewed });
  broadcastMessage({ type: 'ITEM_VIEWED_ADDED', payload: item });
}

async function getItemsViewed() {
  return { success: true, items: state.itemsViewed };
}

async function removeItemViewed(itemId) {
  state.itemsViewed = state.itemsViewed.filter(i => i.id !== itemId);
  await chrome.storage.local.set({ itemsViewed: state.itemsViewed });
  return { success: true };
}

async function clearItemsViewed() {
  state.itemsViewed = [];
  await chrome.storage.local.set({ itemsViewed: [] });
  return { success: true };
}

// ============================================================
// Impact Stats
// ============================================================

async function getImpactStats() {
  return { success: true, stats: state.impactStats };
}

async function trackEcoChoice(productId) {
  state.impactStats.ecoChoices++;
  await chrome.storage.local.set({ impactStats: state.impactStats });
  return { success: true };
}

// ============================================================
// Context Menu
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ecoshopper-search-image',
    title: '🌿 Find sustainable alternatives',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ecoshopper-search-image') {
    startAnalysis({
      imageSource: info.srcUrl,
      name: 'Image Search',
      price: null,
      pageUrl: tab.url,
      platform: new URL(tab.url).hostname,
    });
  }
});

// ============================================================
// Install Event
// ============================================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Swytch-eco installed');
    chrome.storage.sync.set({ preferences: state.preferences });
    chrome.storage.local.set({
      itemsViewed: [],
      impactStats: state.impactStats,
    });
  }
});

console.log('Swytch-eco Background Service Worker started');
