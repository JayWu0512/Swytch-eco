# 🌿 Swytch-eco - Sustainable Shopping Assistant

A Chrome extension that helps you find eco-friendly alternatives while shopping online.

## 🚀 Quick Install

1. Download and extract the extension folder
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extracted folder

## 🛒 Supported Retailers

| Platform | Detection |
|----------|-----------|
| Amazon.com | ✅ Auto |
| Walmart.com | ✅ Auto |
| Target.com | ✅ Auto |
| eBay.com | ✅ Auto |
| Best Buy | ✅ Auto |
| Wayfair | ✅ Auto |
| Etsy | ✅ Auto |
| Costco | ✅ Auto |
| Home Depot | ✅ Auto |
| Newegg | ✅ Auto |

## 🎯 Features

### 1. 🔍 Precise Visual Search (精確以圖搜圖)

**NOT just keyword search** - Uses AI Vision to analyze the actual image:

```
[Product Image] → [Vision AI Analysis] → [Visual Embedding] → [Similar Products]
```

**Analysis includes**:
- 📦 Product category (e.g., Electronics > Audio > Wireless Earbuds)
- 🎨 Visual features (colors, shape, style, material)
- 🏷️ Product attributes (type, features)
- 📝 Detected text & logos (brand recognition)
- 🔎 Search tags for finding similar items
- 💰 Estimated price range

**Results show**:
- **Visual Similarity %** (e.g., "92% match")
- **Match Reasons** (e.g., "Same category", "Similar type")
- **Eco-friendly badges** and CO₂ savings

### 2. 🔒 Google Login for Dashboard

**Dashboard, Leaderboard & Rewards require Google sign-in**

Click the "Login to view Dashboard" button to:
- 🏆 View Leaderboard Rankings
- 🎁 Earn Rewards & Badges  
- 📊 Track Your CO₂ Savings
- 🔄 Sync Across Devices

### 3. 📋 Side Panel Results

When you search, results instantly appear in a slide-out panel:
- 🤔 Cooling-off reminder ("Do you really need this?")
- 💰 Potential money savings
- 🌱 CO₂ reduction estimate
- 📊 Visual similarity scores
- ✓ Match reasons for each alternative

### 4. 📜 History Tab

- View all products you've browsed
- Quick re-search from history
- Syncs with Supabase (when logged in)

### 5. 📈 Impact Dashboard

- Track total CO₂ saved
- See money saved
- Weekly progress toward goals
- Leaderboard ranking

## 📡 API Response Format

The extension expects the following JSON format from the backend:

```typescript
interface VisionAnalysis {
  category: {
    primary: string;      // "Electronics"
    secondary: string;    // "Audio"
    tertiary: string;     // "Wireless Earbuds"
    confidence: number;   // 0.94
  };
  visualFeatures: {
    dominantColors: string[];
    colorScheme: string;
    shape: string;
    style: string;
  };
  searchTags: string[];
  visualEmbedding: number[];  // 128-dim vector
}

interface AlternativeProduct {
  // Required fields
  id: string;                    // "walmart-eco-001"
  name: string;                  // Product name
  price: number;                 // Price in USD
  currency: string;              // "$"
  imageUrl: string;              // Product image URL
  productUrl: string;            // Product page URL
  platform: string;              // "walmart", "target", etc.
  platformName: string;          // "Walmart", "Target"
  
  // Visual similarity (核心欄位)
  visualSimilarity: number;      // 0-1 visual match score
  matchReasons: string[];        // ["Same category", "Similar type"]
  matchedFeatures: {
    category: string;
    type: string;
    material: string;
    style: string;
  };
  
  // Eco & ratings
  rating: number | null;
  reviewCount: number | null;
  co2Savings: number | null;
  isEcoFriendly: boolean;
  ecoLabel: string | null;
  ecoDetails: string | null;
  blurb: string | null;
}
```

### Example Response

```json
{
  "success": true,
  "alternatives": [
    {
      "id": "walmart-eco-001",
      "name": "Eco-Certified Wireless Earbuds - Recycled Plastic",
      "price": 89.99,
      "currency": "$",
      "imageUrl": "https://example.com/product.jpg",
      "productUrl": "https://walmart.com/ip/123456",
      "platform": "walmart",
      "platformName": "Walmart",
      
      "visualSimilarity": 0.92,
      "matchReasons": [
        "Same category: Wireless Earbuds",
        "Similar type: true wireless earbuds",
        "Eco-friendly alternative"
      ],
      "matchedFeatures": {
        "category": "Wireless Earbuds",
        "type": "true wireless earbuds",
        "material": "recycled plastic",
        "style": "modern"
      },
      
      "rating": 4.6,
      "reviewCount": 3421,
      "co2Savings": 3.5,
      "isEcoFriendly": true,
      "ecoLabel": "Recycled Materials",
      "ecoDetails": "Made from 100% recycled ocean plastic",
      "blurb": "Top-rated eco alternative, 92% visual match"
    }
  ],
  "metadata": {
    "searchTime": 1250,
    "totalResults": 5,
    "analysisMethod": "visual_embedding_similarity"
  }
}
```

## 🗄️ Database Schema (Supabase)

### items_viewed table
```sql
CREATE TABLE items_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  price DECIMAL(10,2),
  platform TEXT,
  product_url TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_items_viewed_user ON items_viewed(user_id);
CREATE INDEX idx_items_viewed_date ON items_viewed(viewed_at DESC);
```

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,  -- Chrome extension user ID
  google_id TEXT,
  email TEXT,
  total_co2_saved DECIMAL(10,2) DEFAULT 0,
  total_searches INTEGER DEFAULT 0,
  eco_choices INTEGER DEFAULT 0,
  total_money_saved DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 📁 Project Structure

```
ecoshopper/
├── manifest.json          # Extension config (Manifest V3)
├── _locales/
│   └── en/messages.json   # English language file
├── background/
│   └── service-worker.js  # Background logic, API calls
├── content/
│   ├── content-script.js  # Page injection, image selection
│   └── content-style.css  # Floating button, overlay styles
├── popup/
│   ├── popup.html         # Main UI (tabs: Search, History, Impact)
│   ├── popup.css          # Eco-friendly green theme
│   └── popup.js           # UI logic, state management
└── icons/                 # Extension icons (16, 32, 48, 128)
```

## 🔧 Configuration

### Backend URLs

Update these values in `background/service-worker.js`:

```javascript
const CONFIG = {
  BACKEND_URL: 'https://your-backend.railway.app',
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_KEY: 'your-anon-key',
  DASHBOARD_URL: 'https://your-dashboard.vercel.app',
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
};
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API" and "Google People API"
4. Go to **Credentials** > **Create Credentials** > **OAuth client ID**
5. Application type: **Chrome Extension**
6. Get your extension ID from `chrome://extensions/`
7. Add the extension ID to authorized origins
8. Copy the Client ID to:
   - `manifest.json` > `oauth2.client_id`
   - `service-worker.js` > `CONFIG.GOOGLE_CLIENT_ID`

### Dashboard URL
The `DASHBOARD_URL` is the external webpage that displays:
- User Dashboard (total impact, recent activity)
- Leaderboard (ranked by CO₂ saved)
- Rewards (earned badges, redeemable points)

When user is logged in, the extension opens: `{DASHBOARD_URL}?token={authToken}&user={userId}`

## 🎨 Theme Colors

The extension uses an eco-friendly green palette:

```css
--primary: #2d6a4f;        /* Forest Green */
--primary-light: #40916c;  /* Medium Green */
--primary-dark: #1b4332;   /* Dark Forest */
--accent: #52b788;         /* Leaf Green */
--gold: #c9a227;           /* Eco Gold */
```

## 📝 Version

- **Version**: 1.0.0
- **Manifest**: V3
- **Chrome**: 88+

---

🌍 **Shop sustainably, save the planet!**
