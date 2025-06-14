const express = require('express');
const gplay = require('google-play-scraper');
const store = require('app-store-scraper');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// App configurations
const APPS = {
  'meesho': {
    playStore: 'com.meesho.supply',
    appStore: { id: 1457958492, country: 'in' },
    name: 'Meesho'
  },
  'cred': {
    playStore: 'com.dreamplug.androidapp', 
    appStore: { id: 1343011398, country: 'in' },
    name: 'CRED'
  }
};

// Cache to avoid hitting APIs too frequently
let cache = {};
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Helper function to scrape Play Store
async function scrapePlayStore(appKey, count) {
  const app = APPS[appKey];
  console.log(`🔍 Scraping Play Store for ${app.name}...`);
  
  const reviews = await gplay.reviews({
    appId: app.playStore,
    sort: gplay.sort.NEWEST,
    num: count,
    lang: 'en',
    country: 'in'
  });

  return reviews.data.map(review => ({
    app: app.name,
    store: 'Google Play Store',
    username: review.userName || 'Anonymous',
    rating: review.score || 0,
    reviewText: review.text || '',
    date: review.date ? new Date(review.date).toISOString() : null,
    version: review.version || null,
    thumbsUp: review.thumbsUp || 0,
    reply: review.replyText || null,
    reviewId: review.id || null
  }));
}

// Helper function to scrape App Store
async function scrapeAppStore(appKey, count) {
  const app = APPS[appKey];
  console.log(`🍎 Scraping App Store for ${app.name}...`);
  
  try {
    const reviews = await store.reviews({
      id: app.appStore.id,
      country: app.appStore.country,
      sort: store.sort.MOST_RECENT,
      page: 1,
      count: count
    });

    return reviews.map(review => ({
      app: app.name,
      store: 'Apple App Store',
      username: review.userName || 'Anonymous',
      rating: review.score || 0,
      reviewText: review.text || '',
      date: review.updated ? new Date(review.updated).toISOString() : null,
      version: review.version || null,
      thumbsUp: 0,
      reply: null,
      reviewId: review.id || null
    }));
  } catch (error) {
    console.warn(`⚠️ App Store scraping failed for ${app.name}: ${error.message}`);
    return []; // Return empty array instead of failing
  }
}

// Main endpoint - exactly what you asked for!
app.get('/reviews', async (req, res) => {
  try {
    const cacheKey = 'meesho_cred_reviews';
    const now = Date.now();
    
    // Check cache first
    if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION) {
      console.log('📦 Returning cached results');
      return res.json(cache[cacheKey].data);
    }

    console.log('🚀 Fetching fresh reviews for Meesho and CRED...');
    
    const allReviews = [];
    const reviewsPerAppPerStore = Math.ceil(75 / 4); // ~19 reviews per app per store
    
    // Fetch reviews for both apps from both stores
    const promises = [];
    
    for (const appKey of ['meesho', 'cred']) {
      promises.push(
        scrapePlayStore(appKey, reviewsPerAppPerStore).catch(err => {
          console.error(`❌ Play Store error for ${appKey}:`, err.message);
          return [];
        })
      );
      
      promises.push(
        scrapeAppStore(appKey, reviewsPerAppPerStore).catch(err => {
          console.error(`❌ App Store error for ${appKey}:`, err.message);
          return [];
        })
      );
    }

    const results = await Promise.all(promises);
    
    // Flatten and combine all reviews
    results.forEach(reviewArray => {
      allReviews.push(...reviewArray);
    });

    // Sort by rating (highest first) and limit to 75
    const topReviews = allReviews
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 75);

    const response = {
      success: true,
      totalReviews: topReviews.length,
      apps: ['Meesho', 'CRED'],
      stores: ['Google Play Store', 'Apple App Store'],
      timestamp: new Date().toISOString(),
      reviews: topReviews
    };

    // Cache the results
    cache[cacheKey] = {
      data: response,
      timestamp: now
    };

    console.log(`✅ Successfully fetched ${topReviews.length} reviews`);
    res.json(response);

  } catch (error) {
    console.error('💥 API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: '📱 Live Reviews API',
    status: 'healthy',
    endpoint: '/reviews',
    description: 'Returns 75 top reviews from Meesho and CRED (both Play Store and App Store)',
    example: `${req.protocol}://${req.get('host')}/reviews`,
    apps: ['Meesho', 'CRED'],
    stores: ['Google Play Store', 'Apple App Store'],
    cacheInfo: 'Results cached for 10 minutes'
  });
});

// Alternative endpoint with query params (for flexibility)
app.get('/api/reviews', async (req, res) => {
  const { app, count = 75 } = req.query;
  
  if (app && !APPS[app.toLowerCase()]) {
    return res.status(400).json({
      error: 'Invalid app',
      availableApps: Object.keys(APPS)
    });
  }

  // If specific app requested, handle it
  if (app) {
    // ... handle single app logic
    return res.redirect(`/reviews`); // For now, redirect to main endpoint
  }

  // Otherwise redirect to main endpoint
  res.redirect('/reviews');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Live Reviews API running on port ${PORT}`);
  console.log(`📡 Main endpoint: http://localhost:${PORT}/reviews`);
  console.log(`🏥 Health check: http://localhost:${PORT}/`);
  console.log(`📱 Apps: Meesho, CRED`);
  console.log(`🏪 Stores: Google Play Store, Apple App Store`);
  console.log(`⚡ Cache duration: 10 minutes`);
});

module.exports = app;