# Product Requirement Document (PRD)
## Project Name: Fresh Farm (તાજા શાકભાજી) - Mobile App
### Platform: Android (React Native / Expo)
### Backend Stack: Firebase (Auth + Firestore) + Supabase (Storage)
---

## 1. Executive Summary & Objectives
Fresh Farm (તાજા શાકભાજી) is a premium, localized quick-commerce application (similar to Blinkit, Zepto, or Zomato) designed for buying fresh vegetables, groceries, and namkeen. 

The objective is to overhaul the current web/PWA interface into a high-performance, native Android application using **React Native/Expo** with **TypeScript** to provide:
*   Sub-second listing page loads using native image-caching engines.
*   A simplified, frictionless multi-type login flow (OTP, Email, and Google).
*   Flexible image hosting using **Supabase Storage** for product catalogs and banners.
*   Low-latency data synchronization and offline storage mechanisms using **Firebase Firestore** and **MMKV/AsyncStorage**.
*   Full feature parity with the existing web app, including the comprehensive multi-translated Admin department directly within the app (controlled via role-based access).

---

## 2. System Architecture

```
        ┌──────────────────────────────────────────────────────────┐
        │            React Native Android Client App               │
        │    (User Interface + Admin Panel [Role Protected])      │
        └─────────────┬──────────────────────────┬─────────────────┘
                      │                          │
           [Auth, JSON Records]            [Product Images]
                      ▼                          ▼
        ┌──────────────────────────┐   ┌──────────────────────────┐
        │     Firebase Suite       │   │     Supabase Cloud       │
        ├──────────────────────────┤   ├──────────────────────────┤
        │ • Authentication         │   │ • Storage API            │
        │ • Cloud Firestore DB     │   │   Bucket: product-images │
        └──────────────────────────┘   └──────────────────────────┘
```

### Component Details
1.  **Mobile Interface**: React Native with Expo (pre-configured native assets) using Tailwind CSS (**NativeWind**) for quick styling and visual consistency.
2.  **Database & Config (Firebase Firestore)**: Houses user profiles, orders, settings, promo codes, and vegetable listings.
3.  **Authentication (Firebase Auth)**: Governs user identity across Phone (OTP), Email/Password, and Google Sign-in.
4.  **CDN Image Storage (Supabase Storage)**: Holds product images uploaded via the Admin interface. Provides high-speed CDN delivery to mobile screens.
5.  **Local State & Offline Storage**: MMKV or React Native AsyncStorage for lightning-fast local cart storage and profile caching (essential for sub-second start time).

---

## 3. High-Fidelity Data Models (Firestore Schema)

### 3.1 `profiles/{userId}` (Collection)
*Tracks client registration, address, coordinates, and permissions.*
```json
{
  "uid": "string (Firebase Auth UID)",
  "email": "string (Optional/nullable for pure OTP logins)",
  "role": "string ('admin' | 'user')",
  "firstName": "string",
  "lastName": "string",
  "gender": "string ('male' | 'female' | 'other')",
  "phone": "string (With +91 country prefix)",
  "address": "string",
  "age": "number",
  "lat": "number (GPS latitude for distance calculations)",
  "lng": "number (GPS longitude for distance calculations)",
  "createdAt": "timestamp"
}
```

### 3.2 `vegetables/{vegId}` (Collection)
*Product listings including pricing variations and Supabase-served images.*
```json
{
  "name": "string (Internal / Gujarati name directly)",
  "name_gu": "string (Gujarati translation)",
  "name_hi": "string (Hindi translation)",
  "name_en": "string (English translation)",
  "englishName": "string (Primary display fallback)",
  "description": "string",
  "description_gu": "string",
  "description_hi": "string",
  "description_en": "string",
  "imageUrl": "string (Supabase Public CDN URI)",
  "category": "string ('vegetable' | 'grocery' | 'namkeen')",
  "pricingOptions": [
    {
      "unit": "string (e.g. '250g', '500g', '1kg')",
      "price": "number",
      "discountPrice": "number (Optional)",
      "costPrice": "number (Optional; admin calculation)",
      "stock": "number"
    }
  ],
  "inStock": "boolean",
  "totalStock": "number (Aggregated stock sum)",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### 3.3 `orders/{orderId}` (Collection)
*Records for customer orders.*
```json
{
  "userId": "string",
  "customerName": "string",
  "customerPhone": "string",
  "customerAddress": "string",
  "distance": "number (Calculated distance in km between warehouse & user)",
  "items": [
    {
      "vegId": "string",
      "name": "string",
      "name_gu": "string",
      "name_hi": "string",
      "englishName": "string",
      "price": "number",
      "quantity": "number",
      "unit": "string"
    }
  ],
  "subtotal": "number",
  "deliveryCharge": "number",
  "discountAmount": "number",
  "totalAmount": "number",
  "promoCode": "string",
  "deliverySlot": "string",
  "invoiceNumber": "string (e.g., FF-2026-XXXX)",
  "status": "string ('Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled')",
  "paymentMethod": "string ('COD' | 'ONLINE')",
  "paymentStatus": "string ('Pending' | 'Completed' | 'Failed')",
  "cancelReason": "string (Optional)",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### 3.4 `settings/global` (Document)
*Universal parameters controlling shop state and delivery cost engines.*
```json
{
  "freeDeliveryDistance": "number (in Km)",
  "freeDeliveryThreshold": "number (Minimum spend for zero shipping)",
  "deliveryCharge": "number",
  "whatsappNumber": "string (For 1-click chat updates)",
  "isShopOpen": "boolean (App open/closed toggle)",
  "warehouseAddress": "string",
  "warehouseLat": "number",
  "warehouseLng": "number",
  "deliverySlots": "array of strings",
  "deliveryChargePerKm": "number (Calculates base + dist * perKm)",
  "freeItemThreshold": "number",
  "freeItemName": "string",
  "freeItemImage": "string (Supabase Public CDN URI)",
  "freeItemWeight": "string",
  "freeItemDescription": "string",
  "freeItemMRP": "number",
  "isFreeItemActive": "boolean",
  "updatedAt": "timestamp"
}
```

---

## 4. Multi-Type Native Authentication Flow

The app will present a clean, bottom-sheet style login interface offering three distinct avenues managed under standard Firebase Auth triggers:

```
                  ┌──────────────────────────────────────────────┐
                  │          Fresh Farm Unified Login            │
                  │   [ Input Field: Enter Email / Phone ]      │
                  ├──────────────────────────────────────────────┤
                  │     [ OR Sign in with Google Button ]        │
                  └──────────────────────────────────────────────┘
```

### 1. Phone Auth with SMS OTP (Primary Strategy)
*   **Action**: User inputs a standard 10-digit phone number.
*   **Trigger**: App calls Firebase `verifyPhoneNumber` (SDK).
*   **verificationId**: App receives a transaction string. SMS is dispatched by Firebase Auth.
*   **OTP Sheet**: Animates from bottom; user inputs 6-digit code.
*   **Completion**: Credentials are submitted to `signInWithCredential`. Profile lookup in `DocProfiles` is launched.

### 2. Email & Password (Fallback Strategy)
*   **Action**: Switch toggle to Email flow. Input Email and Password.
*   **New Account**: Runs `createUserWithEmailAndPassword`; automatically builds user profile default values to `/profiles/{uid}` with role `"user"`.
*   **Login**: Runs `signInWithEmailAndPassword`.

### 3. Google Social Sign-In (Frictionless Strategy)
*   **Dependencies**: Requires `@react-native-google-signin/google-signin`.
*   **Flow**:
    1.  User taps the Google login button.
    2.  Native bottom-sheet shows the Google Identity Selector.
    3.  User authorizes access -> App fetches Google ID Token and Access Token.
    4.  App executes Firebase backend login: `GoogleAuthProvider.getCredential(idToken, accessToken)`.
    5.  Completes authorization smoothly and maps profile.

---

## 5. Supabase Storage Migration Strategy

### 5.1 Image Storage Setup
All imagery will reside in a public Supabase Storage bucket.
*   **Bucket Name**: `product-images`
*   **Policies**: Public Read access enabled. Write/Update/Delete access protected with a service key or restricted to logged-in users with sub-claims matching the Admin role.

### 5.2 Upload Flow (Direct CDN Integration)

```
 [ Admin Pick Image ] -> [ Convert File to BLOB / ArrayBuffer ] 
                  ├─► Uploads to Supabase storage Bucket
                  ▼
 [ Save to Firestore ] ◄─ Public URL Generated (https://<supabase-id>.supabase.co/...)
```

1.  **Mobile Selection**: Admin selects an image from their gallery using `expo-image-picker`.
2.  **Conversion**: File is read as an ArrayBuffer/Blob.
3.  **Upload to Supabase Storage**:
    ```typescript
    import { createClient } from '@supabase/supabase-js';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const fileName = `products/${Date.now()}_${imageName}.jpg`;
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, fileBuffer, {
        contentType: 'image/jpeg'
      });
    ```
4.  **Save Public URL**: Admin grabs the generated public link and stores it directly into Firestore `vegetables.imageUrl`.

---

## 6. Functional Specs & User Flow (Parity Mapping)

### 6.1 Customer App Flow (Blinkit-style Experience)
1.  **Dashboard**:
    *   **Category Selector**: Floating horizontal list (`Vegetable`, `Grocery`, `Namkeen`).
    *   **Search**: Fully responsive translation search (typing *Potato* fetches *બટાકા* / *बटाटू*).
    *   **Cart Banner**: Sticky footer appears if Cart contains > 0 items, with sub-second price calculation.
    *   **Free Item Indicator**: Highlighted banner ("Add ₹120 more to get FREE Ginger 100g!") displaying the promotional items retrieved from Firestore.
2.  **Product Card Selection**:
    *   Pricing Option drop-down inside the card (e.g. `250g` for ₹20, `1kg` for ₹70).
    *   Increment/Decrement buttons (`+` / `-`) modifying items directly in local memory.
3.  **Interactive Checkout Page**:
    *   **Distance calculation**: Native GPS (`geo-location`) picks coordinates. Uses Haversine/Google Distance formula against `settings/global` warehouse lat/long. Matches deliveryCharge structures.
    *   **Time Slot Selection**: Native wheel or radio select matching the global configuration slots.
    *   **Payment Picker**: Clean toggle between COD and custom payment links.

### 6.2 Admin Panel (Fully Built Native Drawer)
A special navigation drawer is only accessible to accounts holding the `"admin"` role mapping in Firestore:
*   **Dashboard Stats**: Beautiful, scannable native charts (using `react-native-svg` and `victory-native` or simply clean summary grids) tracking daily orders, sales, profit margins, and cancelled reasons.
*   **Inventory Control Center**:
    *   Fast Product creation and update: Multi-field forms featuring English, Gujarati, and Hindi translations.
    *   Direct camera uploads to Supabase Storage.
    *   Individual pricing options manager.
*   **Live Order Board**:
    *   Real-time order receipts with swipe-to-update statuses (`Pending` ➔ `Processing` ➔ `Shipped` ➔ `Delivered` ➔ `Cancelled`).
    *   Direct call action: Tap phone icon to prompt native Android dialer.
    *   WhatsApp notification dispatch: One-tap button formatting templates prepopulated with address metadata.

---

## 7. App Store Release Requirements (Play Store)

For compiling and publishing the `.aab` (Android App Bundle) to the Google Play Store Console:

### 7.1 Gradle & Configuration Checks
*   **Package Name**: `com.freshfarm.app` (Match Firebase Android client bundle configuration).
*   **App Icon & Splash Screen**: Set using `app.json` (for Expo) with dynamic size rendering.
*   **Build Settings**: Target SDK 34 (Android 14) minimum, ensuring compliant permission declarations for fine location accuracy.

### 7.2 Release Steps
1.  **Trigger Native Build**: Run `npx expo prebuild` or use EAS Build: `eas build --platform android`.
2.  **Generate Keystore File**: Generate a secure signature configuration for release signing.
3.  **Compile release binary**: Produce optimized bytecode bundle `app-release.aab`.
4.  **Testing Strategy**: Deploy to Google Play Console Internal Testing Track with up to 100 registered emails for immediate native feedback on target devices.

---
**Prepared By**: Antigravity Assistant
**Status**: Verified for Android Compilation & Firebase + Supabase Interfaces
