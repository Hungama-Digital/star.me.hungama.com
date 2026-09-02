# APIs in use – Shortify

Only APIs that are **currently called** from the app (screens, context, auth, etc.).  
Main backend base URL: `https://xpresso-dbe.dctinc.net/v1`.

| # | Method | Endpoint / URL | Where used |
|---|--------|----------------|------------|
| **Content & home** |
| 1 | GET | `https://d2txiqo7o4r896.cloudfront.net/content/{lang}/{pageId}.json` | HomeScreen – home carousel & categories |
| 2 | GET | `/pagecategory/listing` | Slider – category listing fallback |
| **Navigation** |
| 3 | GET | `/navigation` | AuthContext – app navigation / menu config |
| **Auth & user** |
| 4 | POST | `/checkuser` | Email/Phone/Google/Facebook/Apple login – check user exists |
| 5 | POST | `/sendotp` | PhoneLogin, EmailLogin, OTPVerification – send OTP |
| 6 | POST | `/verifyotp` | OTPVerificationScreen – verify OTP |
| 7 | POST | `/register` | OTP + Google/Facebook/Apple/Phone – register |
| 8 | POST | `/login` | Google/Facebook/Apple/Phone – SSO login |
| 9 | GET | `/token/guest` | Guest login, FooterLinkDetailScreen, FooterLinkModal |
| 10 | — | (createGuestUser uses `/token/guest`) | guestAuth – create guest user |
| 11 | POST | `/logout` | AuthContext – logout |
| **Watchlist / My List** |
| 12 | GET | `/assetgroupwatchlist` | MyListScreen, ReelsScreen – user’s watchlist |
| 13 | POST | `/assetgroupwatchlist` | HomeScreen, TileDetails, Reels, VideoPlayer – add to My List |
| 14 | POST | `/assetgroupwatchlist/deactivate` | HomeScreen, TileDetails, Reels, VideoPlayer, MyListScreen, MyListSeriesThumbnail – remove from My List |
| **Favourites / likes** |
| 15 | GET | `/assetfavourite` | FavouritesContext – user favourites |
| 16 | POST | `/assetfavourite` | TileDetailsScreen, ReelsScreen – add like |
| 17 | POST | `/assetfavourite/delete` | TileDetailsScreen, ReelsScreen – remove like |
| **Asset group & content** |
| 18 | GET | `/assetgroup` | TileDetailsScreen, SeriesDetailScreen – series/asset group details |
| 19 | GET | `/assetgroup/assetlist` | TileDetailsScreen, ReelsScreen, EpisodesScreen – episodes list |
| 20 | GET | `/assetgroup/foryou` | ForYouScreen, SearchScreen – For You feed |
| **Footer** |
| 21 | GET | `/footerlink` | SettingsScreen – footer links list |
| 22 | GET | `/footerlink/{path}` | FooterLinkDetailScreen, FooterLinkModal – footer link by path |
| **Bookmarks / watch history** |
| 23 | POST | `/bookmark` | ReelsScreen – save watch progress |
| 24 | GET | `/bookmark` | WatchHistoryScreen – watch history |
| **Profile** |
| 25 | GET | `/profile/{userId}` | ProfileScreen – get profile |
| 26 | POST | `/profile/update` | ProfileScreen, EditProfileScreen – update profile |
| **Stripe payments** |
| 27 | POST | `/order/createStripePaymentIntent` | StripeContext – create payment intent |
| 28 | POST | `/order` | StripeContext – create order after payment |
| **Subscription (Hungama – external)** |
| 29 | POST | `https://chpayapi.hungama.com/v1/user/fast_tv_subscription_status` | SubscriptionContext, ManageSubscriptionScreen |
| 30 | POST | `https://chpayapi.hungama.com/v1/user/miniunsubscription/mini` | SubscriptionContext – cancel subscription |
| 31 | GET | `https://payapi.hungama.com/v1/lang` | SubscriptionScreen – plan page details |
| **IAP billing (external)** |
| 32 | POST | `https://chpac.hungama.com/webservices/notify_billing_fastv.php` | SubscriptionScreen – notify IAP purchase |
| **Search & genre** |
| 33 | GET | `/genre` | SearchScreen – genre list |
| 34 | GET | `/search` | SearchScreen – search by keyword |
| 35 | GET | `/genre/video` | SearchScreen – videos by genre |

---

## Summary

- **35 APIs** are in use in the current frontend.
- **31** hit the main backend (v1) or internal CloudFront URL.
- **4** are external (Hungama subscription/plan + IAP notify).

**Not used in the app (defined in api.js but no caller):**  
`getMenuCategory`, `getCarousel`, `getPageCategory`, `getListing`, `getWatchlist`, `getOrders`, `testApiConnection`.
