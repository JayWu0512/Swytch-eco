/**
 * Swytch-eco Content Script
 * Features:
 * 1. SHADE-like image selection for search
 * 2. Auto-detect product info
 * 3. Side panel for results
 * 4. Product view tracking with impulse purchase warnings
 */

// ============================================================
// Platform Detection
// ============================================================

const PLATFORMS = {
  amazon: {
    patterns: [/amazon\./i],
    getProductInfo: () => {
      const image = document.querySelector('#landingImage, #imgBlkFront, #main-image');
      const name = document.querySelector('#productTitle, #title');
      const price = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, .a-price-whole');
      const asin = location.pathname.match(/\/dp\/([A-Z0-9]+)/)?.[1] || location.pathname.match(/\/gp\/product\/([A-Z0-9]+)/)?.[1];
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'amazon',
        productId: asin || generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  walmart: {
    patterns: [/walmart\.com/i],
    getProductInfo: () => {
      const image = document.querySelector('[data-testid="hero-image"] img, .hover-zoom-hero-image img');
      const name = document.querySelector('[itemprop="name"], h1[class*="heading"]');
      const price = document.querySelector('[itemprop="price"], [data-testid="price-wrap"] span');
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'walmart',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  target: {
    patterns: [/target\.com/i],
    getProductInfo: () => {
      const image = document.querySelector('[data-test="product-image"] img, picture img');
      const name = document.querySelector('[data-test="product-title"], h1');
      const price = document.querySelector('[data-test="product-price"]');
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'target',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  ebay: {
    patterns: [/ebay\./i],
    getProductInfo: () => {
      const image = document.querySelector('#icImg, .ux-image-carousel-item img');
      const name = document.querySelector('.x-item-title__mainTitle, h1');
      const price = document.querySelector('.x-price-primary span, #prcIsum');
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'ebay',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  bestbuy: {
    patterns: [/bestbuy\.com/i],
    getProductInfo: () => {
      const image = document.querySelector('.primary-image img, [class*="productImage"] img');
      const name = document.querySelector('.sku-title h1, h1');
      const price = document.querySelector('.priceView-customer-price span');
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'bestbuy',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  etsy: {
    patterns: [/etsy\.com/i],
    getProductInfo: () => {
      const image = document.querySelector('[data-listing-id] img, .image-carousel-container img');
      const name = document.querySelector('h1[data-buy-box-listing-title], h1');
      const price = document.querySelector('[data-buy-box-region="price"] p');
      return {
        imageSource: image?.src,
        name: name?.textContent?.trim(),
        price: parsePrice(price?.textContent),
        pageUrl: location.href,
        platform: 'etsy',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
  generic: {
    patterns: [/.*/],
    getProductInfo: () => {
      const images = Array.from(document.querySelectorAll('img'))
        .filter(img => img.width > 200 && img.height > 200)
        .sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const name = document.querySelector('h1')?.textContent?.trim();
      return {
        imageSource: images[0]?.src,
        name: name,
        price: null,
        pageUrl: location.href,
        platform: 'generic',
        productId: generateProductId(location.href),
        category: detectCategory(),
      };
    },
  },
};

function detectPlatform() {
  for (const [name, config] of Object.entries(PLATFORMS)) {
    if (name === 'generic') continue;
    if (config.patterns.some(p => p.test(location.hostname))) {
      return { name, detector: config };
    }
  }
  return { name: 'generic', detector: PLATFORMS.generic };
}

function parsePrice(text) {
  if (!text) return null;
  const match = text.replace(/[,\s]/g, '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function generateProductId(url) {
  return btoa(url).substring(0, 32);
}

function detectCategory() {
  const text = (document.title + ' ' + (document.querySelector('h1')?.textContent || '')).toLowerCase();
  const categories = {
    'clothing': ['shirt', 'pants', 'dress', 'jacket', 'shoes', 'sneakers', 'clothing', 'apparel', 'wear'],
    'electronics': ['phone', 'laptop', 'computer', 'tablet', 'tv', 'camera', 'headphone', 'speaker', 'electronic'],
    'home': ['furniture', 'decor', 'kitchen', 'bed', 'sofa', 'chair', 'table', 'lamp', 'home'],
    'beauty': ['makeup', 'skincare', 'cosmetic', 'beauty', 'perfume', 'lotion', 'cream'],
    'food': ['food', 'snack', 'drink', 'coffee', 'tea', 'organic', 'grocery'],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(k => text.includes(k))) return category;
  }
  return 'general';
}

// ============================================================
// Environmental Impact Data (Based on research)
// ============================================================

const ENVIRONMENTAL_IMPACT = {
  clothing: {
    co2PerItem: 10, // kg CO2
    waterPerItem: 2700, // liters
    warning: "The fashion industry contributes to 10% of global carbon emissions (UN Environment Programme). A single cotton T-shirt requires 2,700 liters of water to produce - enough drinking water for one person for 2.5 years.",
    tips: [
      "Consider buying secondhand or vintage",
      "Check if you already own something similar",
      "Choose quality over quantity - fast fashion items last only 10 wears on average",
    ],
    sources: "Sources: UN Environment Programme, World Resources Institute, Ellen MacArthur Foundation",
  },
  electronics: {
    co2PerItem: 70, // kg CO2
    waterPerItem: 13000, // liters (for smartphone production)
    warning: "Electronic devices contain rare earth minerals mined in environmentally destructive ways. Manufacturing a single smartphone produces 70kg of CO2 and requires 13,000 liters of water (Greenpeace).",
    tips: [
      "Repair your current device if possible",
      "Consider refurbished options - saves 80% of manufacturing emissions",
      "Recycle old electronics properly",
    ],
    sources: "Sources: Greenpeace, European Environment Agency, Apple Environmental Reports",
  },
  home: {
    co2PerItem: 47, // kg CO2
    waterPerItem: 400, // liters
    warning: "Furniture production contributes significantly to deforestation. 40% of furniture ends up in landfills within 15 years (EPA). Consider the long-term need before purchasing.",
    tips: [
      "Buy secondhand furniture - it's often better quality",
      "Look for FSC-certified wood products",
      "Consider multi-functional furniture",
    ],
    sources: "Sources: EPA, Forest Stewardship Council, IKEA Sustainability Report",
  },
  beauty: {
    co2PerItem: 5, // kg CO2
    waterPerItem: 120, // liters
    warning: "The beauty industry produces 120 billion units of packaging annually, most not recyclable (Zero Waste Week). Many products contain microplastics that pollute oceans.",
    tips: [
      "Finish your current products before buying new ones",
      "Choose refillable or package-free options",
      "Look for cruelty-free and organic certifications",
    ],
    sources: "Sources: Zero Waste Week, Ocean Conservancy, Plastic Soup Foundation",
  },
  general: {
    co2PerItem: 20, // kg CO2
    waterPerItem: 500, // liters
    warning: "The average household contains 300,000 items (UCLA study). 80% of items purchased are used less than once a month. Consider if this purchase adds real value to your life.",
    tips: [
      "Wait 48-72 hours before impulse purchases",
      "Consider the 'cost per use' - will you use it enough?",
      "Check if you can borrow or rent instead",
    ],
    sources: "Sources: UCLA Center on Everyday Lives, Journal of Consumer Research",
  },
};

// ============================================================
// State
// ============================================================

let currentProduct = null;
let sidePanel = null;
let floatingButton = null;
let buttonInjected = false;
let isSelectMode = false;

// ============================================================
// Side Panel
// ============================================================

function createSidePanel() {
  if (sidePanel) return;
  
  sidePanel = document.createElement('div');
  sidePanel.id = 'swytch-sidepanel';
  sidePanel.innerHTML = `
    <div class="swytch-panel-container">
      <div class="swytch-panel-header">
        <div class="swytch-brand">
          <svg class="swytch-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <span class="swytch-brand-text">Swytch-eco</span>
        </div>
        <button class="swytch-close-btn" id="swytchCloseBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="swytch-panel-body">
        <div class="swytch-panel-loading active" id="swytchLoading">
          <div class="swytch-loader">
            <div class="swytch-ring"></div>
            <div class="swytch-ring"></div>
            <div class="swytch-ring"></div>
          </div>
          <p class="swytch-loading-text">Analyzing product...</p>
        </div>
        
        <div class="swytch-panel-error" id="swytchError">
          <svg class="swytch-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p class="swytch-error-text" id="swytchErrorText">Something went wrong</p>
          <button class="swytch-retry-btn" id="swytchRetryBtn">Try Again</button>
        </div>
        
        <div class="swytch-panel-results" id="swytchResults">
          <div class="swytch-reminder" id="swytchReminder"></div>
          
          <div class="swytch-savings-row" id="swytchSavings">
            <div class="swytch-stat">
              <span class="swytch-stat-value" id="swytchMoneySaved">$0</span>
              <span class="swytch-stat-label">Potential Savings</span>
            </div>
            <div class="swytch-stat eco">
              <span class="swytch-stat-value" id="swytchCO2Saved">0 kg</span>
              <span class="swytch-stat-label">CO2 Reduced</span>
            </div>
          </div>
          
          <div class="swytch-section-header">
            <h3>Sustainable Alternatives</h3>
            <span class="swytch-count" id="swytchCount">0</span>
          </div>
          <ul class="swytch-list" id="swytchList"></ul>
        </div>
      </div>
      
      <div class="swytch-panel-footer">
        <a href="#" class="swytch-dashboard-link" id="swytchDashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Dashboard & Rewards
        </a>
      </div>
    </div>
  `;
  
  document.body.appendChild(sidePanel);
  
  // Bind events
  document.getElementById('swytchCloseBtn').addEventListener('click', closeSidePanel);
  document.getElementById('swytchRetryBtn').addEventListener('click', retrySearch);
  document.getElementById('swytchDashboard').addEventListener('click', openDashboard);
  
  injectPanelStyles();
}

function injectPanelStyles() {
  if (document.getElementById('swytch-panel-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'swytch-panel-styles';
  style.textContent = `
    #swytch-sidepanel {
      position: fixed !important;
      top: 0 !important;
      right: -380px !important;
      width: 360px !important;
      height: 100vh !important;
      background: #f8fafc !important;
      border-left: 1px solid #e2e8f0 !important;
      z-index: 2147483646 !important;
      font-family: 'Segoe UI', system-ui, sans-serif !important;
      transition: right 0.3s ease !important;
      box-shadow: -5px 0 30px rgba(0, 0, 0, 0.1) !important;
    }
    #swytch-sidepanel.open { right: 0 !important; }
    
    .swytch-panel-container {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
    }
    
    .swytch-panel-header {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 14px 16px !important;
      background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%) !important;
      color: white !important;
    }
    
    .swytch-brand {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
    }
    
    .swytch-brand-icon {
      width: 22px !important;
      height: 22px !important;
    }
    
    .swytch-brand-text {
      font-size: 14px !important;
      font-weight: 700 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
    }
    
    .swytch-close-btn {
      width: 30px !important;
      height: 30px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: rgba(255,255,255,0.15) !important;
      border: none !important;
      border-radius: 6px !important;
      color: white !important;
      cursor: pointer !important;
    }
    
    .swytch-close-btn svg { width: 16px !important; height: 16px !important; }
    
    .hidden { display: none !important; }
    
    .swytch-loader {
      width: 50px !important;
      height: 50px !important;
      position: relative !important;
      margin-bottom: 16px !important;
    }
    
    .swytch-ring {
      position: absolute !important;
      width: 100% !important;
      height: 100% !important;
      border: 2px solid transparent !important;
      border-radius: 50% !important;
    }
    
    .swytch-ring:nth-child(1) { border-top-color: #0d9488 !important; animation: swytch-spin 1.2s linear infinite !important; }
    .swytch-ring:nth-child(2) { width: 75% !important; height: 75% !important; top: 12.5% !important; left: 12.5% !important; border-right-color: #0891b2 !important; animation: swytch-spin 0.9s linear infinite reverse !important; }
    .swytch-ring:nth-child(3) { width: 50% !important; height: 50% !important; top: 25% !important; left: 25% !important; border-bottom-color: #7c3aed !important; animation: swytch-spin 0.6s linear infinite !important; }
    
    @keyframes swytch-spin { to { transform: rotate(360deg); } }
    
    .swytch-loading-text {
      font-size: 12px !important;
      color: #64748b !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
    }
    
    .swytch-reminder {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.08), rgba(13, 148, 136, 0.08)) !important;
      border: 1px solid rgba(124, 58, 237, 0.2) !important;
      border-radius: 8px !important;
      padding: 12px !important;
      margin-bottom: 14px !important;
      font-size: 12px !important;
      color: #1e293b !important;
      line-height: 1.5 !important;
    }
    
    .swytch-savings-row {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 10px !important;
      margin-bottom: 14px !important;
    }
    
    .swytch-stat {
      background: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      padding: 12px !important;
      text-align: center !important;
    }
    
    .swytch-stat-value {
      display: block !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      color: #0d9488 !important;
    }
    
    .swytch-stat.eco .swytch-stat-value { color: #10b981 !important; }
    
    .swytch-stat-label {
      font-size: 9px !important;
      color: #64748b !important;
      text-transform: uppercase !important;
    }
    
    .swytch-section-header {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      margin-bottom: 10px !important;
    }
    
    .swytch-section-header h3 {
      font-size: 11px !important;
      font-weight: 600 !important;
      color: #64748b !important;
      text-transform: uppercase !important;
      margin: 0 !important;
    }
    
    .swytch-count {
      background: #0d9488 !important;
      color: white !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      padding: 2px 8px !important;
      border-radius: 10px !important;
    }
    
    .swytch-list {
      list-style: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    
    .swytch-item {
      background: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      padding: 10px !important;
      margin-bottom: 8px !important;
      display: flex !important;
      gap: 10px !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    }
    
    .swytch-item:hover {
      border-color: #0d9488 !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
    }
    
    .swytch-item.eco-choice { border-color: rgba(16, 185, 129, 0.4) !important; }
    
    .swytch-item-rank {
      width: 20px !important;
      height: 20px !important;
      background: #f1f5f9 !important;
      border: 2px solid #0d9488 !important;
      border-radius: 50% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      color: #0d9488 !important;
      flex-shrink: 0 !important;
    }
    
    .swytch-item-image {
      width: 48px !important;
      height: 48px !important;
      background: #f1f5f9 !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
    }
    
    .swytch-item-image img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
    }
    
    .swytch-item-info { flex: 1 !important; min-width: 0 !important; }
    
    .swytch-item-name {
      font-size: 11px !important;
      font-weight: 600 !important;
      color: #1e293b !important;
      margin-bottom: 3px !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }
    
    .swytch-item-price {
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #0d9488 !important;
    }
    
    .swytch-item-meta {
      font-size: 9px !important;
      color: #64748b !important;
      margin-top: 3px !important;
    }
    
    .swytch-eco-tag {
      display: inline-block !important;
      background: rgba(16, 185, 129, 0.1) !important;
      color: #10b981 !important;
      font-size: 8px !important;
      padding: 2px 5px !important;
      border-radius: 3px !important;
      margin-left: 5px !important;
    }
    
    .swytch-footer {
      margin-top: 14px !important;
      padding-top: 14px !important;
      border-top: 1px solid #e2e8f0 !important;
    }
    
    .swytch-dashboard-link {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      padding: 12px !important;
      background: linear-gradient(135deg, #0d9488, #0891b2) !important;
      color: white !important;
      text-decoration: none !important;
      border-radius: 8px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
    }
    
    .swytch-dashboard-link svg { width: 16px !important; height: 16px !important; }
    
    .swytch-panel-body {
      flex: 1 !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
    }
    
    .swytch-panel-loading, .swytch-panel-results, .swytch-panel-error {
      padding: 16px !important;
      display: none !important;
    }
    
    .swytch-panel-loading.active {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
    }
    
    .swytch-panel-results.active {
      display: block !important;
      flex: 1 !important;
      overflow-y: auto !important;
    }
    
    .swytch-panel-error.active {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
    }
    
    .swytch-panel-footer {
      padding: 12px 16px !important;
      border-top: 1px solid #e2e8f0 !important;
      background: white !important;
    }
    
    .swytch-error-icon { width: 48px !important; height: 48px !important; color: #ef4444 !important; margin-bottom: 12px !important; }
    .swytch-error-text { font-size: 12px !important; color: #ef4444 !important; margin-bottom: 14px !important; }
    
    .swytch-retry-btn {
      padding: 10px 20px !important;
      background: white !important;
      border: 1px solid #0d9488 !important;
      border-radius: 6px !important;
      color: #0d9488 !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }
    
    .swytch-item-blurb {
      font-size: 9px !important;
      color: #64748b !important;
      margin-top: 4px !important;
      line-height: 1.3 !important;
      font-style: italic !important;
    }
    
    .swytch-no-results {
      text-align: center !important;
      color: #94a3b8 !important;
      font-size: 12px !important;
      padding: 20px !important;
    }
  `;
  document.head.appendChild(style);
}

function openSidePanel() {
  createSidePanel();
  requestAnimationFrame(() => {
    sidePanel.classList.add('open');
  });
}

function closeSidePanel() {
  if (sidePanel) {
    sidePanel.classList.remove('open');
  }
}

function showPanelLoading(message = 'Analyzing product...') {
  const loading = document.getElementById('swytchLoading');
  const results = document.getElementById('swytchResults');
  const error = document.getElementById('swytchError');
  
  // Only show loading
  if (loading) loading.classList.add('active');
  if (results) results.classList.remove('active');
  if (error) error.classList.remove('active');
  
  const loadingText = sidePanel?.querySelector('.swytch-loading-text');
  if (loadingText) loadingText.textContent = message;
}

function showPanelResults(data) {
  const loading = document.getElementById('swytchLoading');
  const results = document.getElementById('swytchResults');
  const error = document.getElementById('swytchError');
  
  console.log('[Swytch-eco] showPanelResults called');
  
  // Only show results
  if (loading) loading.classList.remove('active');
  if (error) error.classList.remove('active');
  if (results) results.classList.add('active');
  
  // Render results
  renderResults(data);
}

function showPanelError(message) {
  const loading = document.getElementById('swytchLoading');
  const results = document.getElementById('swytchResults');
  const error = document.getElementById('swytchError');
  
  // Only show error
  if (loading) loading.classList.remove('active');
  if (results) results.classList.remove('active');
  if (error) error.classList.add('active');
  
  const errorText = document.getElementById('swytchErrorText');
  if (errorText) errorText.textContent = message;
}

function renderResults(data) {
  // Handle different data structures
  const alternatives = data.alternatives || [];
  const reminder = data.dissuasionMessage || data.reminder || '';
  const potentialSavings = data.potentialSavings || 0;
  const totalCO2Savings = data.totalCO2Savings || 0;
  
  console.log('[Swytch-eco] Rendering results:', alternatives.length, 'items');
  
  // Reminder
  const reminderEl = document.getElementById('swytchReminder');
  if (reminderEl && reminder) {
    reminderEl.innerHTML = `<strong>Before you buy:</strong> ${reminder}`;
    reminderEl.style.display = 'block';
  } else if (reminderEl) {
    reminderEl.style.display = 'none';
  }
  
  // Stats
  const savingsRow = document.getElementById('swytchSavings');
  if (savingsRow) {
    document.getElementById('swytchMoneySaved').textContent = `$${potentialSavings.toFixed(0) || 0}`;
    document.getElementById('swytchCO2Saved').textContent = `${totalCO2Savings.toFixed(1) || 0} kg`;
  }
  
  // Count
  document.getElementById('swytchCount').textContent = alternatives.length || 0;
  
  // List
  const list = document.getElementById('swytchList');
  if (list && alternatives.length > 0) {
    list.innerHTML = alternatives.map((item, i) => `
      <li class="swytch-item ${item.isEcoFriendly ? 'eco-choice' : ''}" data-url="${escapeHtml(item.productUrl)}">
        <div class="swytch-item-rank">${i + 1}</div>
        <div class="swytch-item-image">
          ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="swytch-item-info">
          <div class="swytch-item-name">${escapeHtml(item.name)}</div>
          <div class="swytch-item-price">${item.currency || '$'}${item.price?.toFixed(2) || '—'}</div>
          <div class="swytch-item-meta">
            ${item.platformName || ''}
            ${item.isEcoFriendly ? '<span class="swytch-eco-tag">ECO</span>' : ''}
            ${item.co2Savings ? `<span style="color:#10b981;margin-left:5px;">-${item.co2Savings.toFixed(1)}kg CO₂</span>` : ''}
          </div>
          ${item.blurb ? `<div class="swytch-item-blurb">${escapeHtml(item.blurb)}</div>` : ''}
        </div>
      </li>
    `).join('');
    
    // Bind click events
    list.querySelectorAll('.swytch-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  } else if (list) {
    list.innerHTML = '<li class="swytch-no-results">No alternatives found</li>';
  }
}

function retrySearch() {
  if (currentProduct) {
    performSearch(currentProduct);
  }
}

function openDashboard(e) {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_URL' }, (response) => {
    if (response?.success && response.url) {
      window.open(response.url, '_blank');
    } else if (response?.requireLogin) {
      showNotification('Please login to access Dashboard', 'info');
    }
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// Product View Tracking & Impulse Warning
// ============================================================

async function trackProductView(productInfo) {
  if (!productInfo?.productId) return null;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TRACK_PRODUCT_VIEW',
      payload: productInfo,
    });
    
    console.log('[Swytch-eco] Track view response:', response);
    
    // Show warning if viewed 3+ times
    if (response?.showWarning && response.viewCount >= 3) {
      // Small delay to let page load
      setTimeout(() => {
        showImpulseWarning(productInfo, response.viewCount);
      }, 1500);
    }
    
    return response;
  } catch (error) {
    console.error('[Swytch-eco] Track view error:', error);
    return null;
  }
}

function showImpulseWarning(product, viewCount) {
  // Remove existing warning
  const existing = document.getElementById('swytch-impulse-warning');
  if (existing) existing.remove();
  
  const category = product.category || 'general';
  const impact = ENVIRONMENTAL_IMPACT[category] || ENVIRONMENTAL_IMPACT.general;
  
  const warning = document.createElement('div');
  warning.id = 'swytch-impulse-warning';
  warning.innerHTML = `
    <div class="swytch-warning-overlay">
      <div class="swytch-warning-card">
        <div class="swytch-warning-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h3>Pause and Reflect</h3>
        </div>
        
        <div class="swytch-warning-badge">
          You've viewed this item <strong>${viewCount} times</strong> this week
        </div>
        
        <div class="swytch-warning-content">
          <p class="swytch-warning-main">${impact.warning}</p>
          
          <div class="swytch-impact-stats">
            <div class="swytch-impact-stat">
              <span class="swytch-impact-value">${impact.co2PerItem} kg</span>
              <span class="swytch-impact-label">CO2 emissions</span>
            </div>
            <div class="swytch-impact-stat">
              <span class="swytch-impact-value">${impact.waterPerItem.toLocaleString()} L</span>
              <span class="swytch-impact-label">Water used</span>
            </div>
          </div>
          
          <div class="swytch-warning-tips">
            <strong>Consider:</strong>
            <ul>
              ${impact.tips.map(tip => `<li>${tip}</li>`).join('')}
            </ul>
          </div>
          
          <p class="swytch-warning-sources">${impact.sources}</p>
        </div>
        
        <div class="swytch-warning-actions">
          <button class="swytch-warning-btn secondary" id="swytchFindAlt">Find Eco Alternatives</button>
          <button class="swytch-warning-btn primary" id="swytchDismissWarning">I'll Think About It</button>
        </div>
        
        <button class="swytch-warning-close" id="swytchCloseWarning">×</button>
      </div>
    </div>
  `;
  
  // Inject styles
  const style = document.createElement('style');
  style.id = 'swytch-warning-styles';
  style.textContent = `
    .swytch-warning-overlay {
      position: fixed !important;
      inset: 0 !important;
      background: rgba(15, 23, 42, 0.8) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 20px !important;
      animation: swytch-fade-in 0.3s ease !important;
    }
    
    @keyframes swytch-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .swytch-warning-card {
      background: white !important;
      border-radius: 16px !important;
      max-width: 480px !important;
      width: 100% !important;
      padding: 24px !important;
      position: relative !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
      animation: swytch-slide-up 0.3s ease !important;
    }
    
    @keyframes swytch-slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .swytch-warning-header {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      margin-bottom: 16px !important;
    }
    
    .swytch-warning-header svg {
      width: 32px !important;
      height: 32px !important;
      color: #f59e0b !important;
    }
    
    .swytch-warning-header h3 {
      font-size: 20px !important;
      font-weight: 700 !important;
      color: #1e293b !important;
      margin: 0 !important;
    }
    
    .swytch-warning-badge {
      background: linear-gradient(135deg, #fef3c7, #fde68a) !important;
      border: 1px solid #f59e0b !important;
      border-radius: 8px !important;
      padding: 10px 16px !important;
      font-size: 14px !important;
      color: #92400e !important;
      text-align: center !important;
      margin-bottom: 16px !important;
    }
    
    .swytch-warning-content {
      margin-bottom: 20px !important;
    }
    
    .swytch-warning-main {
      font-size: 14px !important;
      color: #475569 !important;
      line-height: 1.6 !important;
      margin: 0 0 16px 0 !important;
    }
    
    .swytch-impact-stats {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 12px !important;
      margin-bottom: 16px !important;
    }
    
    .swytch-impact-stat {
      background: #f8fafc !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      padding: 12px !important;
      text-align: center !important;
    }
    
    .swytch-impact-value {
      display: block !important;
      font-size: 20px !important;
      font-weight: 700 !important;
      color: #dc2626 !important;
    }
    
    .swytch-impact-label {
      font-size: 11px !important;
      color: #64748b !important;
      text-transform: uppercase !important;
    }
    
    .swytch-warning-tips {
      background: #f0fdf4 !important;
      border: 1px solid #bbf7d0 !important;
      border-radius: 8px !important;
      padding: 12px !important;
      margin-bottom: 12px !important;
    }
    
    .swytch-warning-tips strong {
      font-size: 12px !important;
      color: #166534 !important;
    }
    
    .swytch-warning-tips ul {
      margin: 8px 0 0 0 !important;
      padding-left: 20px !important;
    }
    
    .swytch-warning-tips li {
      font-size: 12px !important;
      color: #166534 !important;
      margin-bottom: 4px !important;
    }
    
    .swytch-warning-sources {
      font-size: 10px !important;
      color: #94a3b8 !important;
      margin: 0 !important;
    }
    
    .swytch-warning-actions {
      display: flex !important;
      gap: 12px !important;
    }
    
    .swytch-warning-btn {
      flex: 1 !important;
      padding: 12px 20px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
      border: none !important;
    }
    
    .swytch-warning-btn.primary {
      background: linear-gradient(135deg, #0d9488, #0891b2) !important;
      color: white !important;
    }
    
    .swytch-warning-btn.secondary {
      background: #f1f5f9 !important;
      color: #475569 !important;
      border: 1px solid #e2e8f0 !important;
    }
    
    .swytch-warning-btn:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
    }
    
    .swytch-warning-close {
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      width: 32px !important;
      height: 32px !important;
      border: none !important;
      background: #f1f5f9 !important;
      border-radius: 50% !important;
      font-size: 20px !important;
      color: #64748b !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    
    .swytch-warning-close:hover {
      background: #e2e8f0 !important;
      color: #1e293b !important;
    }
  `;
  
  // Remove existing styles
  document.getElementById('swytch-warning-styles')?.remove();
  document.head.appendChild(style);
  document.body.appendChild(warning);
  
  // Bind events
  document.getElementById('swytchCloseWarning').addEventListener('click', () => warning.remove());
  document.getElementById('swytchDismissWarning').addEventListener('click', () => warning.remove());
  document.getElementById('swytchFindAlt').addEventListener('click', () => {
    warning.remove();
    performSearch(product);
  });
}

// ============================================================
// Image Selection Mode
// ============================================================

function enableImageSelectMode() {
  console.log('[Swytch-eco] Enabling image select mode');
  
  if (isSelectMode) {
    console.log('[Swytch-eco] Already in select mode');
    return;
  }
  isSelectMode = true;
  
  // Remove any existing overlay
  document.getElementById('swytch-select-overlay')?.remove();
  document.getElementById('swytch-select-styles')?.remove();
  
  // Create and inject styles - NO dark overlay
  const style = document.createElement('style');
  style.id = 'swytch-select-styles';
  style.textContent = `
    #swytch-select-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483646;
      display: flex;
      justify-content: center;
      padding-top: 20px;
      pointer-events: none;
    }
    
    .swytch-select-box {
      background: white;
      border-radius: 12px;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 3px rgba(13, 148, 136, 0.3);
      font-family: 'Segoe UI', system-ui, sans-serif;
      pointer-events: auto;
      border: 2px solid #0d9488;
    }
    
    .swytch-select-box svg {
      width: 24px;
      height: 24px;
      color: #0d9488;
      flex-shrink: 0;
    }
    
    .swytch-select-box span {
      font-size: 14px;
      color: #1e293b;
      font-weight: 500;
    }
    
    .swytch-select-cancel {
      padding: 6px 14px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      color: #64748b;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .swytch-select-cancel:hover {
      background: #fee2e2;
      border-color: #fecaca;
      color: #dc2626;
    }
    
    body.swytch-selecting img {
      cursor: crosshair !important;
      transition: all 0.15s ease !important;
    }
    
    body.swytch-selecting img:hover {
      outline: 3px solid #0d9488 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(13, 148, 136, 0.15) !important;
    }
    
    .swytch-img-selected {
      outline: 3px solid #10b981 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.2) !important;
    }
  `;
  document.head.appendChild(style);
  
  // Create floating instruction box (no overlay background)
  const overlay = document.createElement('div');
  overlay.id = 'swytch-select-overlay';
  overlay.innerHTML = `
    <div class="swytch-select-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>Click on any product image to search</span>
      <button class="swytch-select-cancel">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // Add selecting class to body
  document.body.classList.add('swytch-selecting');
  
  console.log('[Swytch-eco] Select mode activated');
  
  // Bind cancel button
  overlay.querySelector('.swytch-select-cancel').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    disableImageSelectMode();
  });
  
  // Bind image click handler
  document.addEventListener('click', handleSelectClick, true);
}

function disableImageSelectMode() {
  console.log('[Swytch-eco] Disabling image select mode');
  isSelectMode = false;
  
  document.getElementById('swytch-select-overlay')?.remove();
  document.getElementById('swytch-select-styles')?.remove();
  document.body.classList.remove('swytch-selecting');
  document.removeEventListener('click', handleSelectClick, true);
}

function handleSelectClick(e) {
  if (!isSelectMode) return;
  
  // Ignore clicks on the instruction box or overlay background
  if (e.target.closest('.swytch-select-box') || e.target.id === 'swytch-select-overlay') {
    return;
  }
  
  const img = e.target.closest('img');
  
  if (img && img.src) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[Swytch-eco] Image selected:', img.src.substring(0, 60));
    
    // Add visual feedback
    img.classList.add('swytch-img-selected');
    
    const product = {
      imageSource: img.src,
      name: img.alt || 'Selected Product',
      price: null,
      pageUrl: location.href,
      platform: detectPlatform().name,
      productId: generateProductId(img.src),
      category: detectCategory(),
    };
    
    // Small delay for visual feedback
    setTimeout(() => {
      disableImageSelectMode();
      performSearch(product);
    }, 200);
  }
}

// ============================================================
// Search
// ============================================================

async function performSearch(product) {
  console.log('[Swytch-eco] Starting search for:', product.name || product.imageSource?.substring(0, 50));
  
  currentProduct = product;
  
  openSidePanel();
  showPanelLoading('Analyzing product...');
  
  try {
    // Ensure we have an image source
    if (!product.imageSource) {
      showPanelError('No product image found. Please try selecting an image.');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'FIND_ALTERNATIVES',
      payload: product,
    });
    
    console.log('[Swytch-eco] Search response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('[Swytch-eco] Runtime error:', chrome.runtime.lastError);
      showPanelError('Extension error. Please refresh the page and try again.');
      return;
    }
    
    if (response?.success && response.recommendation) {
      showPanelResults(response.recommendation);
    } else if (response?.error) {
      showPanelError(response.error.message || response.error || 'Failed to find alternatives');
    } else {
      showPanelError('No alternatives found. Please try another product.');
    }
  } catch (error) {
    console.error('[Swytch-eco] Search error:', error);
    // Try to give more helpful error message
    if (error.message?.includes('Extension context invalidated')) {
      showPanelError('Extension was updated. Please refresh the page.');
    } else if (error.message?.includes('Could not establish connection')) {
      showPanelError('Extension not ready. Please refresh the page.');
    } else {
      showPanelError('Connection error. Please refresh and try again.');
    }
  }
}

// ============================================================
// Floating Action Button
// ============================================================

function injectButton() {
  if (buttonInjected) return;
  
  const { name } = detectPlatform();
  console.log(`[Swytch-eco] Platform: ${name}`);
  
  floatingButton = document.createElement('div');
  floatingButton.id = 'swytch-fab';
  floatingButton.innerHTML = `
    <button class="swytch-main-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      <span>Eco Search</span>
    </button>
    <div class="swytch-menu hidden">
      <button class="swytch-menu-item" data-action="auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        Auto-detect
      </button>
      <button class="swytch-menu-item" data-action="select">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        Select Image
      </button>
    </div>
  `;
  
  // Inject FAB styles
  const style = document.createElement('style');
  style.id = 'swytch-fab-styles';
  style.textContent = `
    #swytch-fab {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483645 !important;
      font-family: 'Segoe UI', system-ui, sans-serif !important;
    }
    
    .swytch-main-btn {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 12px 18px !important;
      background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%) !important;
      color: white !important;
      border: none !important;
      border-radius: 30px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      box-shadow: 0 4px 20px rgba(13, 148, 136, 0.4) !important;
      transition: all 0.2s !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
    }
    
    .swytch-main-btn:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 8px 30px rgba(13, 148, 136, 0.5) !important;
    }
    
    .swytch-main-btn svg {
      width: 18px !important;
      height: 18px !important;
    }
    
    .swytch-menu {
      position: absolute !important;
      bottom: 56px !important;
      right: 0 !important;
      background: white !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 10px !important;
      padding: 6px !important;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
      min-width: 160px !important;
    }
    
    .swytch-menu.hidden { display: none !important; }
    
    .swytch-menu-item {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      width: 100% !important;
      padding: 10px 14px !important;
      background: transparent !important;
      border: none !important;
      border-radius: 6px !important;
      color: #1e293b !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
      text-align: left !important;
    }
    
    .swytch-menu-item:hover {
      background: #f1f5f9 !important;
      color: #0d9488 !important;
    }
    
    .swytch-menu-item svg {
      width: 16px !important;
      height: 16px !important;
      flex-shrink: 0 !important;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(floatingButton);
  buttonInjected = true;
  
  // Bind events
  const mainBtn = floatingButton.querySelector('.swytch-main-btn');
  const menu = floatingButton.querySelector('.swytch-menu');
  
  mainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  
  floatingButton.querySelector('[data-action="auto"]').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.add('hidden');
    handleAutoSearch();
  });
  
  floatingButton.querySelector('[data-action="select"]').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.add('hidden');
    console.log('[Swytch-eco] Select Image clicked');
    enableImageSelectMode();
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!floatingButton.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
  
  console.log('[Swytch-eco] FAB injected');
}

function handleAutoSearch() {
  const { detector } = detectPlatform();
  const productInfo = detector.getProductInfo();
  
  console.log('[Swytch-eco] Auto-detect product:', productInfo);
  
  if (!productInfo.imageSource) {
    showNotification('Could not detect product. Try "Select Image" instead.', 'error');
    return;
  }
  
  // Track product view
  trackProductView(productInfo);
  
  performSearch(productInfo);
}

// ============================================================
// Notifications
// ============================================================

function showNotification(message, type = 'info') {
  const existing = document.querySelector('.swytch-notification');
  if (existing) existing.remove();
  
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  const colors = { success: '#10b981', error: '#ef4444', info: '#0891b2' };
  
  const notif = document.createElement('div');
  notif.className = 'swytch-notification';
  notif.style.cssText = `
    position: fixed !important;
    bottom: 100px !important;
    right: 24px !important;
    background: white !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 10px !important;
    padding: 12px 16px !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
    z-index: 2147483647 !important;
    animation: swytch-slide-in 0.3s ease !important;
    font-family: 'Segoe UI', system-ui, sans-serif !important;
  `;
  
  notif.innerHTML = `
    <span style="width:18px;height:18px;color:${colors[type]};">${icons[type] || icons.info}</span>
    <span style="font-size:13px;color:#1e293b;">${message}</span>
  `;
  
  // Add animation keyframes if not exists
  if (!document.getElementById('swytch-notif-styles')) {
    const style = document.createElement('style');
    style.id = 'swytch-notif-styles';
    style.textContent = `
      @keyframes swytch-slide-in {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notif);
  
  setTimeout(() => notif.remove(), 4000);
}

// ============================================================
// Page Load Tracking
// ============================================================

function trackCurrentPage() {
  const { name, detector } = detectPlatform();
  
  // Only track on product pages
  if (name === 'generic') return;
  
  const productInfo = detector.getProductInfo();
  if (productInfo.imageSource && productInfo.name) {
    console.log('[Swytch-eco] Tracking page view:', productInfo.name?.substring(0, 50));
    trackProductView(productInfo);
  }
}

// ============================================================
// Initialize
// ============================================================

function init() {
  console.log('[Swytch-eco] Content script loaded');
  
  // Inject floating button
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectButton();
      trackCurrentPage();
    });
  } else {
    injectButton();
    trackCurrentPage();
  }
}

init();
