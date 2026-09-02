import { jwtDecode } from 'jwt-decode';
import { Platform } from 'react-native';
// Lazy-load to avoid pulling react-native-appsflyer into the startup module chain.
function getAppsflyerService() {
  return require('./appsflyerAnalytics').default;
}

// Production URL
const API_BASE_URL = 'https://fasttvapi.dcafecms.com/v1';
const CONTENT_BASE_URL = 'https://fasttvapi.dcafecms.com/v1/content';
const HUNGAMA_CHPAY_BASE_URL = 'https://chpayapi.hungama.com/v1';
const HUNGAMA_PAY_BASE_URL = 'https://payapi.hungama.com/v1';
const HUNGAMA_CHPAC_BILLING_URL = 'https://chpac.hungama.com/webservices/notify_billing_fastv.php';
const RECOMM_ENGINE_BASE_URL = 'https://personalisation.fasttv.app';

// Staging URL
// const API_BASE_URL = 'https://fasttvapi-staging.dcafecms.com/v1';
// const CONTENT_BASE_URL = 'https://fasttvapi-staging.dcafecms.com/v1/content';
// const HUNGAMA_CHPAY_BASE_URL = 'https://pay-node-test.kollywoodhungama.com/v1';
// const HUNGAMA_PAY_BASE_URL = 'https://pay-node-test.kollywoodhungama.com/v1';
// const HUNGAMA_CHPAC_BILLING_URL = 'https://npay-php.kollywoodhungama.com/webservices/notify_billing_fastv.php';
// const RECOMM_ENGINE_BASE_URL = 'https://personalisation.fasttv.app';

const FAST_TV_SUBSCRIPTION_STATUS_URL = `${HUNGAMA_CHPAY_BASE_URL}/user/fast_tv_subscription_status`;
const MINI_UNSUBSCRIPTION_URL = `${HUNGAMA_CHPAY_BASE_URL}/user/miniunsubscription/mini`;


export const DEVICE_TYPE_MAP = {
  ios: 2,
  android: 2,
  web: 1,
  default: 1
};

export const getDeviceType = () => {
  if (Platform.OS === 'ios') {
    return DEVICE_TYPE_MAP.ios;
  } else if (Platform.OS === 'android') {
    return DEVICE_TYPE_MAP.android;
  } else if (Platform.OS === 'web') {
    return DEVICE_TYPE_MAP.web;
  } else {
    return DEVICE_TYPE_MAP.default;
  }
};

// Centralized API configuration
export const API_CONFIG = {
  deviceTypeId: getDeviceType(),
};

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  // Set authorization token
  setAuthToken(token) {
    if (token) {
      this.defaultHeaders['authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['authorization'];
    }
  }

  // Decode JWT token
  decodeJwtToken(token) {
    try {
      const decodedToken = jwtDecode(token);
      return decodedToken;
    } catch (error) {
      console.error('Failed to decode JWT token:', error);
      return null;
    }
  }

  // Build URL with query parameters
  buildUrl(endpoint, params = {}) {
    const url = new URL(`${this.baseURL}${endpoint}`);

    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    return url.toString();
  }

  // Generic request method
  async request(method, endpoint, options = {}) {
    const { params = {}, headers = {}, body = null } = options;
    const url = this.buildUrl(endpoint, params);

    const config = {
      method: method.toUpperCase(),
      headers: {
        ...this.defaultHeaders,
        ...headers
      }
    };

    if (body && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH')) {
      config.body = typeof body === 'string' ? body : JSON.stringify(body);
    }



    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API: HTTP error response:', errorText);


        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('API: Failed to parse response as JSON:', parseError);
        throw new Error('Invalid JSON response');
      }

      return data;
    } catch (error) {
      console.error('API: Request failed:', error);
      throw error;
    }
  }

  // HTTP method shortcuts
  get(endpoint, options = {}) {
    return this.request('GET', endpoint, options);
  }

  post(endpoint, options = {}) {
    return this.request('POST', endpoint, options);
  }

  put(endpoint, options = {}) {
    return this.request('PUT', endpoint, options);
  }

  patch(endpoint, options = {}) {
    return this.request('PATCH', endpoint, options);
  }

  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options);
  }
}

// Create instance
const apiService = new ApiService();

// API endpoints
export const API = {
  // Navigation API (from your curl example)
  getNavigation: (params = {}) => {
    const defaultParams = {
      filter: JSON.stringify({ "deviceTypeId": API_CONFIG.deviceTypeId, "langaugeCode": 1 }),
      ...params
    };

    return apiService.get('/navigation', { params: defaultParams });
  },
  getMenuCategory: (params = {}) => {
    const defaultParams = {
      filter: JSON.stringify({ "deviceTypeId": API_CONFIG.deviceTypeId, "langaugeCode": 1 }),
      ...params
    };

    return apiService.get('/menucategory', { params: defaultParams });
  },
  // New unified home screen API
  getHomeScreenData: async (params = {}) => {
    const { languageCode = 'en', pageId = 51 } = params;

    // New API endpoint that returns both carousel and pageCategoryListing
    const url = `${CONTENT_BASE_URL}/${languageCode}/${pageId}.json`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching home screen data:', error);
      throw error;
    }
  },

  // Carousel API (kept for backward compatibility)
  getCarousel: (params = {}) => {
    const defaultParams = {
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };

    return apiService.get('/carousel', { params: defaultParams });
  },
  getPageCategory: (params = {}) => {
    const defaultParams = {
      start: 0,
      limit: 10,
      showCount: 10,
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };

    return apiService.get('/pagecategory', { params: defaultParams });
  },

  // Listing API for page category content
  getPageCategoryListing: (params = {}) => {
    const {
      start = 0,
      limit = 10,
      filter = {
        assetGroupClassification: [],
        deviceTypeId: API_CONFIG.deviceTypeId.toString(),
        genre: [],
        langId: 1,
        path: 209
      },
      ...otherParams
    } = params;

    const defaultParams = {
      start,
      limit,
      filter: typeof filter === 'string' ? filter : JSON.stringify(filter),
      ...otherParams
    };

    return apiService.get('/pagecategory/listing', { params: defaultParams });
  },

  // Listing API for popular category
  getListing: (params = {}) => {
    const {
      start = 0,
      limit = 50,
      filter = {},
      ...otherParams
    } = params;

    const defaultParams = {
      start,
      limit,
      filter: typeof filter === 'string' ? filter : JSON.stringify(filter),
      ...otherParams
    };

    return apiService.get('/listing', { params: defaultParams });
  },

  search: (keyword, params = {}) => {
    const filter = JSON.stringify({
      "contentType": ["cast", "asset"],
      "userId": "105",
      "storedResult": false,
      "keyword": keyword
    });
    return apiService.get('/search', { params: { filter } });
  },
  checkUser: (params = {}) => {
    return apiService.post('/checkuser', { body: { ...params } });
  },
  // OTP based API
  sendOTP: (params = {}) => {
    return apiService.post('/sendotp', { body: { ...params } });
  },
  verifyOTP: (params = {}) => {
    return apiService.post('/verifyotp', { body: { ...params } });
  },
  // Register API (Common for OTP and SSO)
  registerUser: (params = {}) => {
    return apiService.post('/register', { body: { ...params } });
  },
  // SSO based API
  login: (params = {}) => {
    return apiService.post('/login', { body: { ...params } });
  },
  // Helper method to set auth token
  setAuthToken: (token) => {
    apiService.setAuthToken(token);
  },

  // Helper method to decode JWT token
  decodeJwtToken: (token) => {
    return apiService.decodeJwtToken(token);
  },

  // Guest user token API
  getGuestToken: () => {
    return apiService.get('/token/guest');
  },

  // Guest user management
  createGuestUser: async () => {
    try {
      // Get guest token
      const guestTokenResponse = await apiService.get('/token/guest');
      const decodedGuestToken = apiService.decodeJwtToken(guestTokenResponse);

      // Set the guest token for future API calls
      API.setAuthToken(guestTokenResponse);


      return {
        success: true,
        token: guestTokenResponse,
        userData: decodedGuestToken,
        message: 'Guest user created successfully'
      };
    } catch (error) {
      console.error('Error creating guest user:', error);

      return {
        success: false,
        error: error.message || 'Failed to create guest user'
      };
    }
  },

  // Test API connectivity
  testApiConnection: async () => {
    try {
      const response = await apiService.get('/navigation', {
        params: {
          filter: JSON.stringify({ "deviceTypeId": API_CONFIG.deviceTypeId, "langaugeCode": 1 })
        }
      });

      return { success: true, data: response };
    } catch (error) {
      console.error('API connection test failed:', error);

      return { success: false, error: error.message };
    }
  },

  getWatchlist: (params = {}) => {
    const defaultParams = {
      start: 0,
      limit: 50,
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };
    const filter = JSON.stringify({
      deviceTypeId: defaultParams.deviceTypeId,
      userId: defaultParams.userId,
      langId: defaultParams.langId
    });
    return apiService.get('/watchlist', {
      params: {
        ...defaultParams,
        filter
      }
    });
  },

  getAssetGroupWatchlist: (params = {}) => {
    const defaultParams = {
      deviceTypeId: API_CONFIG.deviceTypeId,
      userId: null,
      ...params
    };
    const filter = JSON.stringify({
      deviceTypeId: defaultParams.deviceTypeId.toString(),
      userId: defaultParams.userId
    });
    return apiService.get('/assetgroupwatchlist', {
      params: {
        filter
      }
    });
  },

  // POST API to add asset group to watchlist
  assetgroupwatchlist: (params = {}) => {
    const defaultParams = {
      userId: null,
      assetGroupId: null,
      ...params
    };

    return apiService.post('/assetgroupwatchlist', {
      body: {
        userId: defaultParams.userId,
        assetGroupId: defaultParams.assetGroupId
      }
    });
  },

  // DELETE API to remove asset group from watchlist
  deleteAssetGroupWatchlist: async (params = {}) => {
    const defaultParams = {
      userId: null,
      assetgroupIds: null,
      ...params
    };

    try {
      const response = await apiService.post('/assetgroupwatchlist/deactivate', {
        body: {
          userId: defaultParams.userId,
          assetgroupIds: defaultParams.assetgroupIds
        }
      });

      // Decode the JWT response

      const decodedResponse = apiService.decodeJwtToken(response);




      return {
        success: decodedResponse?.success || false,
        message: decodedResponse?.message || '',
        data: decodedResponse?.data || {},
        originalResponse: response,
        decodedResponse: decodedResponse
      };
    } catch (error) {
      console.error('Error deleting asset group watchlist:', error);

      return {
        success: false,
        error: error.message || 'Failed to delete from watchlist'
      };
    }
  },

  // Get user's asset favourites (likes)
  getAssetFavourites: (params = {}) => {
    const defaultParams = {
      start: 0,
      limit: 100,
      type: 1, // 1 = like
      ...params
    };

    const filter = JSON.stringify({
      type: defaultParams.type?.toString?.() || `${defaultParams.type || 1}`
    });

    return apiService.get('/assetfavourite', {
      params: {
        start: defaultParams.start,
        limit: defaultParams.limit,
        filter
      }
    });
  },

  // Asset Favourite API - Like / dislike assets
  assetfavourite: (params = {}) => {
    const defaultParams = {
      assetId: null,
      type: 1, // 1 for like, 2 for dislike
      ...params
    };

    if (!defaultParams.assetId) {
      throw new Error('assetId is required parameter');
    }

    const typeValue = defaultParams.type === 2 ? 2 : 1;

    return apiService.post('/assetfavourite', {
      body: {
        assetId: defaultParams.assetId,
        type: typeValue
      }
    });
  },

  // Asset Favourite API - Remove favourite
  deleteAssetFavourite: async (params = {}) => {
    const defaultParams = {
      assetId: null,
      ...params
    };

    if (!defaultParams.assetId) {
      throw new Error('assetId is required parameter');
    }

    try {
      const response = await apiService.post('/assetfavourite/delete', {
        body: {
          assetId: defaultParams.assetId
        }
      });

      const decodedResponse = apiService.decodeJwtToken(response);

      return {
        success: decodedResponse?.success || false,
        message: decodedResponse?.message || '',
        data: decodedResponse?.data || {},
        originalResponse: response,
        decodedResponse: decodedResponse
      };
    } catch (error) {
      console.error('Error deleting asset favourite:', error);

      return {
        success: false,
        error: error.message || 'Failed to delete asset favourite'
      };
    }
  },

  getAssetGroupDetails: (params = {}) => {
    // params should include a filter object or string
    // Example: { filter: JSON.stringify({ path: '1' }) }
    const defaultParams = {
      ...params
    };
    return apiService.get('/assetgroup', { params: defaultParams });
  },

  // Asset Listing API for getting HLS URLs
  getAssetListing: async (params = {}) => {
    const {
      path,
      start = 0,
      limit = 50,
      filter = {},
      ...otherParams
    } = params;

    // Validate that path is provided
    if (!path) {
      throw new Error('Path parameter is required for getAssetListing');
    }

    // Build the filter object for asset listing
    const assetFilter = {
      path: path?.toString(),
      deviceTypeId: API_CONFIG.deviceTypeId,
      languageId: 1,
      ...filter
    };

    const defaultParams = {
      start,
      limit,
      filter: JSON.stringify(assetFilter),
      ...otherParams
    };



    try {
      // Make the API call
      const url = apiService.buildUrl('/assetgroup/assetlist', defaultParams);

      const config = {
        method: 'GET',
        headers: {
          ...apiService.defaultHeaders
        }
      };

      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the response as text first (since it might be a JWT)
      const responseText = await response.text();

      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(responseText);
        return jsonData;
      } catch (jsonError) {
        // If JSON parsing fails, try to decode as JWT
        try {
          const decodedJwt = apiService.decodeJwtToken(responseText);
          return decodedJwt;
        } catch (jwtError) {
          console.error('Failed to decode JWT:', jwtError);
          throw new Error('Invalid response format - neither JSON nor JWT');
        }
      }
    } catch (error) {
      console.error('Asset Listing API request failed:', error);
      throw error;
    }
  },

  // Footer Link API
  getFooterLink: (params = {}) => {
    const defaultParams = {
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };

    return apiService.get('/footerlink', { params: defaultParams });
  },

  // Footer Link by Path API
  getFooterLinkByPath: (path, params = {}) => {
    const defaultParams = {
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };

    return apiService.get(`/footerlink/${path}`, { params: defaultParams });
  },

  // Bookmark API - Create bookmark. Never throws: on failure returns { success: false } so playback is not blocked.
  createBookmark: async (params = {}) => {
    const defaultParams = {
      assetGroupId: null,
      assetId: null,
      userId: null,
      duration: null,
      languageId: null,
      deviceTypeId: API_CONFIG.deviceTypeId,
      ...params
    };

    if (!defaultParams.assetId || !defaultParams.userId || !defaultParams.assetGroupId) {
      return { success: false };
    }

    const requestBody = {
      assetGroupId: defaultParams.assetGroupId,
      assetId: defaultParams.assetId,
      duration: defaultParams.duration
    };

    try {
      const result = await apiService.post('/bookmark', { body: requestBody });
      return result != null ? result : { success: true };
    } catch (error) {
      console.error('Create bookmark failed (playback continues):', error?.message || error);
      return { success: false };
    }
  },

  // Bookmark API - Get watch history
  getWatchHistory: (userId) => {
    if (!userId) {
      throw new Error('userId is required parameter');
    }

    return apiService.get('/bookmark');
  },

  // Bookmark API - Delete watch history
  deleteWatchHistory: (params = {}) => {
    const defaultParams = {
      assetGroupId: null,
      ...params
    };

    if (!defaultParams.assetGroupId) {
      throw new Error('assetGroupId is required parameter');
    }

    return apiService.post('/bookmark/delete', {
      body: {
        assetGroupId: defaultParams.assetGroupId
      }
    });
  },

  // Profile Update API
  updateProfile: async (params = {}) => {
    const defaultParams = {
      id: null, // UserID
      firstName: '',
      emailId: '',
      dateOfBirth: '', // Format: YYYY-MM-DD
      sex: '', // Male/Female
      avtarId: "",
      fileName: '',
      fileType: '',
      filePath: '',
      ...params
    };

    // Validate required parameters
    if (!defaultParams.id) {
      throw new Error('User ID is required parameter');
    }

    const requestBody = {
      id: defaultParams.id,
      firstName: defaultParams.firstName,
      emailId: defaultParams.emailId,
      dateOfBirth: defaultParams.dateOfBirth,
      sex: defaultParams.sex,
      // avtarId: defaultParams.avtarId,
      fileName: defaultParams.fileName,
      fileType: defaultParams.fileType,
      filePath: defaultParams.filePath
    };

    const response = await apiService.post('/profile/update', {
      body: requestBody
    });



    return response;
  },

  // Get Profile API
  getProfile: (userId) => {
    if (!userId) {
      throw new Error('User ID is required parameter');
    }

    return apiService.get(`/profile/${userId}`);
  },

  // New Subscription Status API - Check user subscription from Hungama payment API
  // Never throws: on failure returns { success: false } so callers can use cached data and playback continues
  checkSubscriptionStatus: async (userId) => {
    try {
      if (!userId) {
        return { success: false, error: 'User ID is required' };
      }

      const response = await fetch(FAST_TV_SUBSCRIPTION_STATUS_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic NDc3NTYxMTI1MTRmZTgyN2Q0ZTE5MWMzYTFjNjhhZDY6',
          'Content-Type': 'application/json',
          'api-key': 'eedca4a2d4b0b360628958dd0fd210a6'
        },
        body: JSON.stringify({
          identity: userId.toString(),
          product_id: 84
        })
      });

      if (!response.ok) {
        return { success: false, error: `Subscription status API error: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Check Subscription Status API Error (using cached data until API is up):', error?.message || error);
      return { success: false, error: error?.message || 'Failed to fetch' };
    }
  },

  cancelSubscription: async (orderId, identity, productId = 84) => {
    try {
      const body = {
        order_id: orderId,
        identity: identity,
        platform_id: Platform.OS === 'ios' ? 4 : 1,
        product_id: productId
      }
      const response = await fetch(MINI_UNSUBSCRIPTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': 'eedca4a2d4b0b360628958dd0fd210a6'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Subscription cancel API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Cancel Subscription API Error:', error);
      throw error;
    }
  },
  // Get localized plan page details
  getPlanPageDetails: async (lang = 'en', productId = 84) => {
    try {
      const url = `${HUNGAMA_PAY_BASE_URL}/lang?lang=${lang}&product_id=${productId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'insomnia/12.3.0' // Keeping consistent with request example, though standard UA might be better
        }
      });

      if (!response.ok) {
        throw new Error(`Plan details API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Info: Failed to fetch plan page details:', error);
      // Return null or empty object so UI can use fallbacks
      return null;
    }
  },

  // Logout API - Logout user from the system
  logout: async () => {
    try {
      const response = await apiService.post(`/logout`);
      return response;
    } catch (error) {
      console.error('Logout API Error:', error);
      throw error;
    }
  },

  // Delete user (soft delete) - requires auth token
  deleteUser: async () => {
    try {
      const response = await apiService.post('/deleteuser');
      return response;
    } catch (error) {
      console.error('Delete user API Error:', error);
      throw error;
    }
  },

  // For You API - Get personalized content recommendations
  getForYou: (params = {}) => {
    const {
      start = 0,
      limit = 50,
      filter = {
        deviceTypeId: API_CONFIG.deviceTypeId,
        languageId: 1
      },
      type,
      ...otherParams
    } = params;

    const defaultParams = {
      start,
      limit,
      filter: JSON.stringify(filter),
      ...otherParams
    };

    // Add type parameter only if it's 'search'
    if (type === 'search') {
      defaultParams.type = 'search';
    }

    return apiService.get('/assetgroup/foryou', {params: defaultParams});
  },

  getPersonalisedRails: async (userId, geo = 'IN') => {
    const url = `${RECOMM_ENGINE_BASE_URL}/rails?userId=${encodeURIComponent(userId)}&geo=${encodeURIComponent(geo)}`;
    const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Personalised rails API error: ${response.status}`);
    return response.json();
  },

  // ==================== STRIPE PAYMENT APIs ====================

  // 1. Create Stripe Payment Intent
  createStripePaymentIntent: async (params = {}) => {
    const defaultParams = {
      rate: null, // Required - amount in INR
      currency: 'inr',
      userId: null, // Required - user ID for payment intent
      ...params
    };

    // Validate required parameters
    if (!defaultParams.rate) {
      throw new Error('rate is required parameter');
    }

    if (!defaultParams.userId) {
      throw new Error('userId is required parameter');
    }

    try {
      const requestBody = {
        rate: defaultParams.rate,
        currency: defaultParams.currency,
        userId: defaultParams.userId
      };

      const response = await apiService.post('/order/createStripePaymentIntent', {
        body: requestBody
      });

      // Decode the JWT response to extract the client secret
      const decodedResponse = apiService.decodeJwtToken(response);

      if (decodedResponse && decodedResponse.success && decodedResponse.data && decodedResponse.data.clientSecret) {
        // The backend returns the full client secret
        // Format: pi_3RvHOVIbdGHHgjUu0n02CrbL_secret_R7EZkqIdPQtalg0UFQdoRIUvC
        const fullClientSecret = decodedResponse.data.clientSecret;

        // Validate that we have a proper client secret format
        if (!fullClientSecret.includes('_secret_')) {
          console.error('Invalid client secret format - missing _secret_ part:', fullClientSecret);
          throw new Error('Invalid client secret format received from backend');
        }

        // Extract the payment intent ID (before _secret_)
        const paymentIntentId = fullClientSecret.split('_secret_')[0];

        return {
          success: true,
          clientSecret: fullClientSecret, // Keep the full client secret
          paymentIntentId: paymentIntentId, // Also provide the payment intent ID
          message: decodedResponse.message || 'Payment intent created successfully'
        };
      } else {
        console.error('Invalid payment intent response format:', decodedResponse);
        throw new Error('Invalid response format or missing client secret');
      }
    } catch (error) {
      console.error('Error creating Stripe payment intent:', error);
      throw error;
    }
  },

  // 2. Create Order after successful payment
  createOrder: async (params = {}) => {
    const defaultParams = {
      rate: null, // Required - amount paid
      orderId: null, // Required - payment intent ID from Stripe
      assetId: "0", // Default asset ID
      userId: null, // Required - user ID
      subscriptionId: null, // Required - subscription plan ID
      billingName: "",
      billingEmail: "",
      status: "Active",
      usageType: "Paid",
      isActive: 1,
      paymentMethod: "stripe", // Default to stripe
      ...params
    };

    // Validate required parameters
    if (!defaultParams.rate || !defaultParams.orderId || !defaultParams.userId || !defaultParams.subscriptionId) {
      throw new Error('rate, orderId, userId, and subscriptionId are required parameters');
    }

    try {
      const requestBody = {
        rate: defaultParams.rate,
        orderId: defaultParams.orderId,
        assetId: defaultParams.assetId,
        userId: defaultParams.userId,
        subscriptionId: defaultParams.subscriptionId,
        billingName: defaultParams.billingName,
        billingEmail: defaultParams.billingEmail,
        status: defaultParams.status,
        usageType: defaultParams.usageType,
        isActive: defaultParams.isActive,
        paymentMethod: defaultParams.paymentMethod
      };

      const response = await apiService.post('/order', {
        body: requestBody
      });

      return response;
    } catch (error) {
      console.error('Create Order API Error:', error);
      throw error;
    }
  },

  // 3. Get Orders with filtering and pagination
  getOrders: (params = {}) => {
    const {
      start = 0,
      limit = 20,
      filter = {
        id: "",
        userId: null, // Should be set by caller
        title: "",
        status: "",
        assetId: ""
      },
      sortBy = {
        type: "upcomingOrders"
      },
      ...otherParams
    } = params;

    const defaultParams = {
      start,
      limit,
      filter: typeof filter === 'string' ? filter : JSON.stringify(filter),
      sortBy: typeof sortBy === 'string' ? sortBy : JSON.stringify(sortBy),
      ...otherParams
    };

    return apiService.get('/order', { params: defaultParams });
  },

  // Genre API - Get genres list
  getGenres: async (params = {}) => {
    const {
      filter = {
        languageId: "2"
      },
      ...otherParams
    } = params;

    const defaultParams = {
      filter: typeof filter === 'string' ? filter : JSON.stringify(filter),
      ...otherParams
    };

    try {
      const url = apiService.buildUrl('/genre', defaultParams);

      const config = {
        method: 'GET',
        headers: {
          ...apiService.defaultHeaders
        }
      };

      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the response as text first (since it might be a JWT)
      const responseText = await response.text();

      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(responseText);
        // If parsing succeeds and it's still a string (JWT token), decode it
        if (typeof jsonData === 'string' && jsonData.includes('.')) {
          const decodedJwt = apiService.decodeJwtToken(jsonData);
          return decodedJwt;
        }
        return jsonData;
      } catch (jsonError) {
        // If JSON parsing fails, try to decode as JWT
        try {
          const decodedJwt = apiService.decodeJwtToken(responseText);
          return decodedJwt;
        } catch (jwtError) {
          console.error('Failed to decode JWT:', jwtError);
          throw new Error('Invalid response format - neither JSON nor JWT');
        }
      }
    } catch (error) {
      console.error('Genre API request failed:', error);
      throw error;
    }
  },

  // Genre/Video API - Get videos by genre
  getGenreVideo: async (params = {}) => {
    const {
      start = 0,
      limit = 24,
      filter = {
        genreId: null,
        deviceTypeId: API_CONFIG.deviceTypeId.toString(),
        languageId: "2"
      },
      ...otherParams
    } = params;

    // Validate genreId is provided
    if (!filter.genreId) {
      throw new Error('genreId is required parameter');
    }

    const defaultParams = {
      start,
      limit,
      filter: typeof filter === 'string' ? filter : JSON.stringify(filter),
      ...otherParams
    };

    try {
      const url = apiService.buildUrl('/genre/video', defaultParams);

      const config = {
        method: 'GET',
        headers: {
          ...apiService.defaultHeaders
        }
      };

      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the response as text first (since it might be a JWT)
      const responseText = await response.text();

      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(responseText);
        // If parsing succeeds and it's still a string (JWT token), decode it
        if (typeof jsonData === 'string' && jsonData.includes('.')) {
          const decodedJwt = apiService.decodeJwtToken(jsonData);
          return decodedJwt;
        }
        return jsonData;
      } catch (jsonError) {
        // If JSON parsing fails, try to decode as JWT
        try {
          const decodedJwt = apiService.decodeJwtToken(responseText);
          return decodedJwt;
        } catch (jwtError) {
          console.error('Failed to decode JWT:', jwtError);
          throw new Error('Invalid response format - neither JSON nor JWT');
        }
      }
    } catch (error) {
      console.error('Genre Video API request failed:', error);
      throw error;
    }
  },

  // Notify billing - called once on payment success. URL: pac.hungama.com/webservices/notify_billing_fastv.php
  // Body structure must match: payment_id, identity, plan_id, store_payment_id, product_id, transactionDate, transactionId, hardware_id, aff_code, country, debug, platform_id, purchase_token, appsflyer_id
  notifyBilling: async (params = {}) => {
    const {
      payment_id = "11",
      identity = "",
      plan_id = "",
      store_payment_id = "",
      product_id = "",
      transactionDate = "",
      transactionId = "",
      hardware_id = "",
      aff_code = "",
      country = "",
      debug = "",
      platform_id = "1",
      purchase_token = ""
    } = params;

    let appsflyer_id = "";
    try {
      const uid = await getAppsflyerService().getAppsFlyerUID();
      if (uid) appsflyer_id = uid;
    } catch (_) {}

    const body = {
      payment_id,
      identity,
      plan_id,
      store_payment_id,
      product_id,
      transactionDate,
      transactionId,
      hardware_id: hardware_id || "",
      aff_code: aff_code || "",
      country: country || "",
      debug: debug || "",
      platform_id,
      purchase_token,
      appsflyer_id
    };

    try {
      const response = await fetch(HUNGAMA_CHPAC_BILLING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      try {
        const parsed = JSON.parse(responseText);
        return parsed;
      } catch (jsonError) {
        console.warn('[Gwallet] Step 3b-api: notifyBilling response not JSON, returning as text');
        return { success: true, data: responseText };
      }
    } catch (error) {
      console.error('[Gwallet] Step 3b-api: notifyBilling request failed:', error);
      throw error;
    }
  },

  /**
   * Notify mini subscription (chpayapi) - called on Android IAP purchase success.
   * Uses identity (userId) and order_id (from purchase).
   */
  notifyMiniSubscription: async ({ identity = '', order_id = '' }) => {
    try {
      const response = await fetch(MINI_UNSUBSCRIPTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': 'eedca4a2d4b0b360628958dd0fd210a6',
        },
        body: JSON.stringify({ identity, order_id }),
      });

      if (!response.ok) {
        throw new Error(`Mini subscription API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[Gwallet] Step 3a-api: notifyMiniSubscription failed:', error);
      throw error;
    }
  },

};

export default API; 