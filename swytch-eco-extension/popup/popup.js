/**
 * EcoShopper - Popup Script
 * 
 * Features:
 * 1. Multi-tab UI (Search, History, Impact)
 * 2. Items Viewed from Supabase
 * 3. LLM Response Handling
 * 4. CO2 Impact Tracking
 */

// ============================================================
// Type Definitions (for documentation)
// ============================================================

/**
 * LLM API Response Format
 * 
 * 這是 Backend LLM API 應該回傳的格式，確保 Extension 能順暢運作
 * 
 * @typedef {Object} LLMAlternativeProduct
 * @property {string} id - 唯一識別碼 (e.g., "walmart-123")
 * @property {string} name - 商品名稱
 * @property {number} price - 價格 (USD)
 * @property {string} currency - 貨幣符號 ("$")
 * @property {string} imageUrl - 商品圖片 URL (必須是 https)
 * @property {string} productUrl - 商品頁面連結
 * @property {string} platform - 平台代碼 ("walmart" | "target" | "amazon" | "ebay" | "bestbuy")
 * @property {string} platformName - 平台顯示名稱 ("Walmart", "Target", etc.)
 * @property {number|null} rating - 評分 (1-5)
 * @property {number|null} reviewCount - 評論數量
 * @property {number} similarityScore - 相似度分數 (0-1)
 * @property {number|null} co2Savings - CO2 節省估算 (kg)
 * @property {boolean} isEcoFriendly - 是否為環保商品
 * @property {string|null} ecoLabel - 環保標籤 ("Sustainable", "Recycled", etc.)
 * @property {string|null} blurb - 簡短描述或推薦理由
 * 
 * @typedef {Object} LLMResponse
 * @property {boolean} success - 是否成功
 * @property {LLMAlternativeProduct[]} alternatives - 替代商品列表
 * @property {Object} sourceProduct - 原始商品資訊
 * @property {number} totalCO2Savings - 總 CO2 節省估算
 * @property {string} dissuasionMessage - 勸退訊息
 * @property {Object} metadata - 額外資訊
 */

// ============================================================
// State Management
// ============================================================

const state = {
  currentTab: 'search',
  isAnalyzing: false,
  currentProduct: null,
  alternatives: [],
  recommendation: null,
  error: null,
  
  // Authentication
  isLoggedIn: false,
  user: null,
  
  // History (items_viewed from Supabase)
  itemsViewed: [],
  
  // Impact stats
  impact: {
    totalCO2: 0,
    totalSearches: 0,
    ecoChoices: 0,
    totalSaved: 0,
    weeklyProgress: 0,
    userRank: null,
  },
  
  // Preferences
  preferences: {
    priority: 'eco_friendly',
    maxBudget: null,
    minRating: null,
    enableCooldown: true,
    cooldownSeconds: 30,
    showCO2: true,
  },
  
  cooldownRemaining: 0,
};

// ============================================================
// DOM Elements
// ============================================================

const elements = {
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  tabContents: {
    search: document.getElementById('searchTab'),
    history: document.getElementById('historyTab'),
    impact: document.getElementById('impactTab'),
  },
  historyBadge: document.getElementById('historyBadge'),
  
  // Search Tab States
  initialState: document.getElementById('initialState'),
  loadingState: document.getElementById('loadingState'),
  resultsState: document.getElementById('resultsState'),
  errorState: document.getElementById('errorState'),
  loadingText: document.getElementById('loadingText'),
  
  // Results
  ecoReminder: document.getElementById('ecoReminder'),
  reminderText: document.getElementById('reminderText'),
  timerBar: document.getElementById('timerBar'),
  timerText: document.getElementById('timerText'),
  savingsSummary: document.getElementById('savingsSummary'),
  moneySaved: document.getElementById('moneySaved'),
  co2Saved: document.getElementById('co2Saved'),
  alternativesList: document.getElementById('alternativesList'),
  resultsCount: document.getElementById('resultsCount'),
  errorText: document.getElementById('errorText'),
  retryBtn: document.getElementById('retryBtn'),
  
  // Impact Banner
  carbonSaved: document.getElementById('carbonSaved'),
  
  // History Tab
  historyList: document.getElementById('historyList'),
  emptyHistory: document.getElementById('emptyHistory'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  
  // Impact Tab
  totalCO2: document.getElementById('totalCO2'),
  treesEquiv: document.getElementById('treesEquiv'),
  totalSearches: document.getElementById('totalSearches'),
  ecoChoices: document.getElementById('ecoChoices'),
  totalSaved: document.getElementById('totalSaved'),
  userRank: document.getElementById('userRank'),
  weeklyProgress: document.getElementById('weeklyProgress'),
  
  // Settings
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  prioritySelect: document.getElementById('prioritySelect'),
  maxBudgetInput: document.getElementById('maxBudgetInput'),
  minRatingSelect: document.getElementById('minRatingSelect'),
  cooldownToggle: document.getElementById('cooldownToggle'),
  cooldownSeconds: document.getElementById('cooldownSeconds'),
  showCO2Toggle: document.getElementById('showCO2Toggle'),
  
  // Dashboard Button (整合 Leaderboard & Rewards)
  dashboardBtn: document.getElementById('dashboardBtn'),
  
  // Login Modal
  loginModal: document.getElementById('loginModal'),
  googleLoginBtn: document.getElementById('googleLoginBtn'),
  loginCancelBtn: document.getElementById('loginCancelBtn'),
};

// ============================================================
// Initialize
// ============================================================

async function init() {
  await loadPreferences();
  await checkLoginStatus();
  await loadItemsViewed();
  await loadImpactStats();
  bindEvents();
  updateLoginUI();
  
  // Check for ongoing analysis
  const response = await sendMessage({ type: 'GET_STATE' });
  if (response?.state) {
    updateFromBackgroundState(response.state);
  }
  
  // Listen for background messages
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

// 檢查登入狀態
async function checkLoginStatus() {
  const response = await sendMessage({ type: 'CHECK_LOGIN_STATUS' });
  if (response) {
    state.isLoggedIn = response.isLoggedIn;
    state.user = response.user;
  }
}

// 更新登入相關 UI
function updateLoginUI() {
  const dashboardBtn = elements.dashboardBtn;
  
  if (state.isLoggedIn && state.user) {
    // 已登入：顯示使用者資訊
    dashboardBtn.innerHTML = `
      <img src="${state.user.picture || ''}" class="user-avatar" onerror="this.style.display='none'">
      <span class="dashboard-btn-text">Dashboard & Rewards</span>
      <span class="dashboard-btn-arrow">→</span>
    `;
    dashboardBtn.classList.add('logged-in');
  } else {
    // 未登入：顯示登入提示
    dashboardBtn.innerHTML = `
      <span class="dashboard-btn-icon">🔒</span>
      <span class="dashboard-btn-text">Login to view Dashboard</span>
      <span class="dashboard-btn-arrow">→</span>
    `;
    dashboardBtn.classList.remove('logged-in');
  }
}

function bindEvents() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Settings
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.closeSettingsBtn.addEventListener('click', closeSettings);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Retry
  elements.retryBtn.addEventListener('click', retryAnalysis);
  
  // History
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  
  // Dashboard Button (整合 Leaderboard & Rewards)
  elements.dashboardBtn.addEventListener('click', openDashboard);
  
  // Login Modal
  elements.googleLoginBtn?.addEventListener('click', performGoogleLogin);
  elements.loginCancelBtn?.addEventListener('click', hideLoginModal);
}

// 開啟外部 Dashboard 網頁（需要 Google 登入）
async function openDashboard() {
  // 檢查是否已登入
  if (!state.isLoggedIn) {
    // 未登入：顯示 Login Modal
    showLoginModal();
    return;
  }
  
  // 已登入：取得 Dashboard URL
  const response = await sendMessage({ type: 'GET_DASHBOARD_URL' });
  
  if (response?.success && response.url) {
    chrome.tabs.create({ url: response.url });
  } else if (response?.requireLogin) {
    // Token 可能已過期，重新登入
    state.isLoggedIn = false;
    state.user = null;
    updateLoginUI();
    showLoginModal();
    showToast('Session expired. Please login again.', 'error');
  } else {
    showToast('Failed to open dashboard', 'error');
  }
}

// 顯示登入 Modal
function showLoginModal() {
  elements.loginModal?.classList.remove('hidden');
}

// 隱藏登入 Modal
function hideLoginModal() {
  elements.loginModal?.classList.add('hidden');
}

// 執行 Google 登入
async function performGoogleLogin() {
  const btn = elements.googleLoginBtn;
  const originalText = btn.innerHTML;
  
  // 顯示 loading
  btn.innerHTML = `
    <svg class="spinner" width="20" height="20" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
      <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"/>
    </svg>
    Signing in...
  `;
  btn.disabled = true;
  
  try {
    const response = await sendMessage({ type: 'GOOGLE_LOGIN' });
    
    if (response?.success) {
      state.isLoggedIn = true;
      state.user = response.user;
      updateLoginUI();
      hideLoginModal();
      showToast(`Welcome, ${state.user.name}! 🎉`, 'success');
      
      // 登入成功後自動開啟 Dashboard
      setTimeout(() => openDashboard(), 500);
    } else {
      showToast(response?.error || 'Login failed. Please try again.', 'error');
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  } catch (error) {
    showToast('Login failed. Please try again.', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Google 登出
async function googleLogout() {
  const response = await sendMessage({ type: 'GOOGLE_LOGOUT' });
  
  if (response?.success) {
    state.isLoggedIn = false;
    state.user = null;
    updateLoginUI();
    showToast('Logged out successfully');
  }
}

// ============================================================
// Tab Navigation
// ============================================================

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update tab buttons
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab contents
  Object.entries(elements.tabContents).forEach(([name, el]) => {
    el.classList.toggle('hidden', name !== tabName);
  });
  
  // Refresh data when switching tabs
  if (tabName === 'history') {
    loadItemsViewed();
  } else if (tabName === 'impact') {
    loadImpactStats();
  }
}

// ============================================================
// Search Tab States
// ============================================================

function showSearchState(stateName) {
  const states = ['initialState', 'loadingState', 'resultsState', 'errorState'];
  states.forEach(s => {
    elements[s]?.classList.toggle('hidden', s !== stateName);
  });
}

function updateFromBackgroundState(bgState) {
  if (bgState.isAnalyzing) {
    showSearchState('loadingState');
    elements.loadingText.textContent = bgState.loadingMessage || 'Searching for sustainable alternatives...';
  } else if (bgState.error) {
    showSearchState('errorState');
    elements.errorText.textContent = bgState.error.message;
  } else if (bgState.recommendation) {
    state.recommendation = bgState.recommendation;
    state.currentProduct = bgState.currentProduct;
    showResults();
  } else {
    showSearchState('initialState');
  }
}

// ============================================================
// Results Display
// ============================================================

function showResults() {
  showSearchState('resultsState');
  
  const { recommendation } = state;
  if (!recommendation) return;
  
  // Eco reminder
  if (state.preferences.enableCooldown) {
    elements.reminderText.textContent = recommendation.dissuasionMessage;
    elements.ecoReminder.classList.remove('hidden');
    startCooldownTimer();
  } else {
    elements.ecoReminder.classList.add('hidden');
  }
  
  // Savings summary
  const moneySaved = recommendation.potentialSavings || 0;
  const co2Saved = recommendation.totalCO2Savings || 0;
  
  if (moneySaved > 0 || co2Saved > 0) {
    elements.moneySaved.textContent = `$${moneySaved.toFixed(2)}`;
    elements.co2Saved.textContent = `${co2Saved.toFixed(1)} kg`;
    elements.savingsSummary.classList.remove('hidden');
  } else {
    elements.savingsSummary.classList.add('hidden');
  }
  
  // Render alternatives
  renderAlternatives(recommendation.alternatives);
}

/**
 * Render alternatives list
 * 
 * Expected LLM Response Format for each alternative:
 * {
 *   id: "walmart-12345",
 *   name: "Eco-Friendly Water Bottle",
 *   price: 19.99,
 *   currency: "$",
 *   imageUrl: "https://...",        // 商品圖片 URL
 *   productUrl: "https://...",      // 商品頁面連結
 *   platform: "walmart",            // 平台代碼
 *   platformName: "Walmart",        // 平台名稱
 *   rating: 4.5,
 *   reviewCount: 1234,
 *   similarityScore: 0.92,
 *   co2Savings: 2.5,               // kg CO2 節省
 *   isEcoFriendly: true,
 *   ecoLabel: "Sustainable Material",
 *   blurb: "Made from recycled materials"
 * }
 */
function renderAlternatives(alternatives) {
  elements.resultsCount.textContent = `${alternatives.length} found`;
  
  elements.alternativesList.innerHTML = alternatives.map((product, index) => {
    const sourcePrice = state.currentProduct?.price || 0;
    const priceDiff = sourcePrice > 0 
      ? Math.round(((product.price - sourcePrice) / sourcePrice) * 100)
      : null;
    
    const priceDiffHtml = priceDiff !== null
      ? priceDiff < 0
        ? `<span class="price-diff savings">${Math.abs(priceDiff)}% less</span>`
        : priceDiff > 0
          ? `<span class="price-diff higher">${priceDiff}% more</span>`
          : ''
      : '';
    
    const ratingHtml = product.rating
      ? `<span class="alternative-rating">
           <span class="star">★</span> ${product.rating.toFixed(1)}
           ${product.reviewCount ? `(${formatNumber(product.reviewCount)})` : ''}
         </span>`
      : '';
    
    const ecoTagHtml = product.isEcoFriendly
      ? `<span class="eco-tag">${product.ecoLabel || 'ECO'}</span>`
      : '';
    
    const co2Html = state.preferences.showCO2 && product.co2Savings
      ? `<span class="co2-badge">-${product.co2Savings.toFixed(1)} kg</span>`
      : '';
    
    const platformClass = product.platform?.toLowerCase() || 'default';
    const platformInitial = product.platformName?.[0] || 'S';
    
    // 圖片處理：使用 imageUrl，若無則顯示 placeholder
    const imageHtml = product.imageUrl
      ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="placeholder">?</div>`;
    
    return `
      <li class="alternative-item ${product.isEcoFriendly ? 'eco-choice' : ''}" 
          data-url="${escapeHtml(product.productUrl)}"
          data-id="${escapeHtml(product.id)}">
        <div class="alternative-image">
          ${imageHtml}
        </div>
        <div class="alternative-info">
          <div class="alternative-header">
            <span class="alternative-name" title="${escapeHtml(product.name)}">
              ${escapeHtml(product.name)}
            </span>
            <span class="alternative-rank ${index === 0 ? 'gold' : ''}">${index + 1}</span>
          </div>
          <div class="alternative-meta">
            <span class="alternative-price">${product.currency}${product.price.toFixed(2)}</span>
            ${priceDiffHtml}
            ${ratingHtml}
          </div>
          <div class="alternative-footer">
            <span class="platform-badge">
              <span class="platform-icon ${platformClass}">${platformInitial}</span>
              ${product.platformName || 'Store'}
            </span>
            ${ecoTagHtml}
            ${co2Html}
          </div>
          ${product.blurb ? `<p class="alternative-blurb">${escapeHtml(product.blurb)}</p>` : ''}
        </div>
      </li>
    `;
  }).join('');
  
  // Bind click events
  elements.alternativesList.querySelectorAll('.alternative-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url) {
        // Track eco choice
        if (item.classList.contains('eco-choice')) {
          trackEcoChoice(item.dataset.id);
        }
        chrome.tabs.create({ url });
      }
    });
  });
}

// ============================================================
// Cooldown Timer
// ============================================================

let cooldownInterval = null;

function startCooldownTimer() {
  state.cooldownRemaining = state.preferences.cooldownSeconds;
  updateTimerDisplay();
  
  if (cooldownInterval) clearInterval(cooldownInterval);
  
  cooldownInterval = setInterval(() => {
    state.cooldownRemaining--;
    updateTimerDisplay();
    
    if (state.cooldownRemaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      elements.timerText.textContent = 'Ready to decide';
      elements.timerBar.style.width = '100%';
    }
  }, 1000);
}

function updateTimerDisplay() {
  const progress = 100 - (state.cooldownRemaining / state.preferences.cooldownSeconds * 100);
  elements.timerBar.style.width = `${progress}%`;
  elements.timerText.textContent = `${state.cooldownRemaining}s cooling off`;
}

// ============================================================
// History Tab (items_viewed from Supabase)
// ============================================================

/**
 * Load items_viewed from Supabase via Backend
 * 
 * Expected format from Backend:
 * {
 *   success: true,
 *   items: [
 *     {
 *       id: "uuid",
 *       name: "Product Name",
 *       imageUrl: "https://...",
 *       price: 29.99,
 *       platform: "amazon",
 *       viewedAt: "2024-01-15T10:30:00Z",
 *       productUrl: "https://..."
 *     }
 *   ]
 * }
 */
async function loadItemsViewed() {
  try {
    // For now, load from local storage (will be replaced with Supabase)
    const response = await sendMessage({ type: 'GET_ITEMS_VIEWED' });
    
    if (response?.success && response.items) {
      state.itemsViewed = response.items;
    } else {
      // Fallback to local storage
      const stored = await chrome.storage.local.get('itemsViewed');
      state.itemsViewed = stored.itemsViewed || [];
    }
    
    renderHistory();
    updateHistoryBadge();
  } catch (error) {
    console.error('Failed to load items viewed:', error);
    state.itemsViewed = [];
    renderHistory();
  }
}

function renderHistory() {
  if (state.itemsViewed.length === 0) {
    elements.historyList.classList.add('hidden');
    elements.emptyHistory.classList.remove('hidden');
    return;
  }
  
  elements.emptyHistory.classList.add('hidden');
  elements.historyList.classList.remove('hidden');
  
  elements.historyList.innerHTML = state.itemsViewed.map(item => {
    const date = new Date(item.viewedAt);
    const dateStr = formatDate(date);
    
    const imageHtml = item.imageUrl
      ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">`
      : `<div class="placeholder">📦</div>`;
    
    return `
      <li class="history-item" data-id="${escapeHtml(item.id)}">
        <div class="history-image">${imageHtml}</div>
        <div class="history-info">
          <div class="history-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="history-meta">
            <span class="history-price">$${item.price?.toFixed(2) || '—'}</span>
            <span class="history-date">${dateStr}</span>
          </div>
        </div>
        <div class="history-actions">
          <button class="btn-icon search-again" title="Search alternatives">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          <button class="btn-icon remove-item" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </li>
    `;
  }).join('');
  
  // Bind events
  elements.historyList.querySelectorAll('.search-again').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.closest('.history-item').dataset.id;
      searchAgainFromHistory(itemId);
    });
  });
  
  elements.historyList.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.closest('.history-item').dataset.id;
      removeFromHistory(itemId);
    });
  });
}

function updateHistoryBadge() {
  const count = state.itemsViewed.length;
  elements.historyBadge.textContent = count > 99 ? '99+' : count;
  elements.historyBadge.style.display = count > 0 ? 'flex' : 'none';
}

async function searchAgainFromHistory(itemId) {
  const item = state.itemsViewed.find(i => i.id === itemId);
  if (item) {
    switchTab('search');
    await sendMessage({
      type: 'FIND_ALTERNATIVES',
      payload: {
        imageSource: item.imageUrl,
        name: item.name,
        price: item.price,
        pageUrl: item.productUrl,
        platform: item.platform,
      }
    });
  }
}

async function removeFromHistory(itemId) {
  state.itemsViewed = state.itemsViewed.filter(i => i.id !== itemId);
  await chrome.storage.local.set({ itemsViewed: state.itemsViewed });
  renderHistory();
  updateHistoryBadge();
  
  // Also notify backend (Supabase)
  sendMessage({ type: 'REMOVE_ITEM_VIEWED', payload: { id: itemId } });
}

async function clearHistory() {
  if (!confirm('Clear all browsing history?')) return;
  
  state.itemsViewed = [];
  await chrome.storage.local.set({ itemsViewed: [] });
  renderHistory();
  updateHistoryBadge();
  
  // Notify backend
  sendMessage({ type: 'CLEAR_ITEMS_VIEWED' });
}

// ============================================================
// Impact Stats
// ============================================================

async function loadImpactStats() {
  try {
    const response = await sendMessage({ type: 'GET_IMPACT_STATS' });
    
    if (response?.success) {
      state.impact = { ...state.impact, ...response.stats };
    } else {
      // Fallback to local storage
      const stored = await chrome.storage.local.get('impactStats');
      if (stored.impactStats) {
        state.impact = { ...state.impact, ...stored.impactStats };
      }
    }
    
    renderImpactStats();
  } catch (error) {
    console.error('Failed to load impact stats:', error);
  }
}

function renderImpactStats() {
  const { impact } = state;
  
  // Update impact banner
  elements.carbonSaved.textContent = `${impact.totalCO2.toFixed(1)} kg CO₂`;
  
  // Update impact tab
  elements.totalCO2.textContent = impact.totalCO2.toFixed(1);
  elements.treesEquiv.textContent = Math.floor(impact.totalCO2 / 21); // ~21kg CO2 per tree/year
  elements.totalSearches.textContent = impact.totalSearches;
  elements.ecoChoices.textContent = impact.ecoChoices;
  elements.totalSaved.textContent = `$${impact.totalSaved.toFixed(0)}`;
  elements.userRank.textContent = impact.userRank ? `#${impact.userRank}` : '#--';
  
  // Weekly progress (goal: 10kg)
  const weeklyGoal = 10;
  const progress = Math.min(100, (impact.weeklyProgress / weeklyGoal) * 100);
  elements.weeklyProgress.style.width = `${progress}%`;
}

async function trackEcoChoice(productId) {
  state.impact.ecoChoices++;
  await chrome.storage.local.set({ impactStats: state.impact });
  sendMessage({ type: 'TRACK_ECO_CHOICE', payload: { productId } });
  renderImpactStats();
}

// ============================================================
// Settings
// ============================================================

async function loadPreferences() {
  try {
    const result = await chrome.storage.sync.get('preferences');
    if (result.preferences) {
      state.preferences = { ...state.preferences, ...result.preferences };
    }
    updateSettingsUI();
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

function updateSettingsUI() {
  const { preferences } = state;
  elements.prioritySelect.value = preferences.priority;
  elements.maxBudgetInput.value = preferences.maxBudget || '';
  elements.minRatingSelect.value = preferences.minRating || '';
  elements.cooldownToggle.checked = preferences.enableCooldown;
  elements.cooldownSeconds.value = preferences.cooldownSeconds;
  elements.showCO2Toggle.checked = preferences.showCO2;
}

async function saveSettings() {
  state.preferences = {
    priority: elements.prioritySelect.value,
    maxBudget: elements.maxBudgetInput.value ? Number(elements.maxBudgetInput.value) : null,
    minRating: elements.minRatingSelect.value ? Number(elements.minRatingSelect.value) : null,
    enableCooldown: elements.cooldownToggle.checked,
    cooldownSeconds: Number(elements.cooldownSeconds.value) || 30,
    showCO2: elements.showCO2Toggle.checked,
  };
  
  try {
    await chrome.storage.sync.set({ preferences: state.preferences });
    await sendMessage({ type: 'UPDATE_PREFERENCES', payload: state.preferences });
    closeSettings();
    showToast('Settings saved!');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save', 'error');
  }
}

function openSettings() {
  elements.settingsPanel.classList.add('open');
}

function closeSettings() {
  elements.settingsPanel.classList.remove('open');
}

// ============================================================
// Messaging
// ============================================================

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Message failed:', chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

function handleBackgroundMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'ANALYSIS_STARTED':
      showSearchState('loadingState');
      elements.loadingText.textContent = 'Analyzing product image...';
      break;
      
    case 'ANALYSIS_PROGRESS':
      elements.loadingText.textContent = message.payload.message;
      break;
      
    case 'ANALYSIS_COMPLETE':
      state.recommendation = message.payload;
      showResults();
      // Update stats
      state.impact.totalSearches++;
      chrome.storage.local.set({ impactStats: state.impact });
      break;
      
    case 'ANALYSIS_ERROR':
      showSearchState('errorState');
      elements.errorText.textContent = message.payload.message;
      break;
      
    case 'ITEM_VIEWED_ADDED':
      // New item added to history
      loadItemsViewed();
      break;
  }
  
  sendResponse({ received: true });
  return true;
}

async function retryAnalysis() {
  const response = await sendMessage({ type: 'RETRY_ANALYSIS' });
  if (response?.success) {
    showSearchState('loadingState');
  }
}

// ============================================================
// Utilities
// ============================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: ${type === 'error' ? '#ef4444' : '#22c55e'};
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 1000;
    animation: toastIn 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Add toast animations
const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn {
    from { opacity: 0; transform: translate(-50%, 10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes toastOut {
    from { opacity: 1; transform: translate(-50%, 0); }
    to { opacity: 0; transform: translate(-50%, 10px); }
  }
  .alternative-blurb {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 6px;
    font-style: italic;
  }
`;
document.head.appendChild(style);

// ============================================================
// Start
// ============================================================

init();
