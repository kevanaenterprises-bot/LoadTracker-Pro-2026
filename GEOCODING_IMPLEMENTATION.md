# HERE Maps Geocoding Implementation

## Overview

This document describes the implementation of HERE Maps geocoding functionality as REST API endpoints, replacing the previous Supabase edge function stub.

## Implementation Summary

### 1. Server-side API (`server/hereApi.js`)

Created a new module that interfaces with HERE Maps APIs:

#### Functions Implemented:

- **`geocodeAddress(address, city, state, zip)`**
  - Uses HERE Geocoding API v7
  - Returns: `{latitude, longitude, formattedAddress}`
  
- **`geocodeAndSaveLocation(pool, locationId, address, city, state, zip, geofenceRadius)`**
  - Geocodes address and updates database
  - Returns: `{success, latitude, longitude, geofence_radius, error?}`
  
- **`reverseGeocode(latitude, longitude)`**
  - Converts coordinates to address
  - Returns: `{address, city, state, zip, country}`
  
- **`calculateTruckRoute(waypoints)`**
  - Calculates truck-specific routes using HERE Routing API v8
  - Includes truck parameters (height, weight, axle count, etc.)
  - Returns: `{polylines, distance, duration, distanceMiles, durationHours}`

### 2. REST API Endpoints (`server/index.js`)

Added 5 new endpoints:

#### `GET /api/here-config`
- Returns HERE API key for frontend map rendering
- Response: `{apiKey: string}`

#### `POST /api/geocode`
- Geocodes an address without saving to database
- Request: `{address, city, state, zip}`
- Response: `{success: true, latitude, longitude, formattedAddress}`

#### `POST /api/geocode-and-save`
- Geocodes an address and saves to database
- Request: `{location_id, address, city, state, zip, geofence_radius}`
- Response: `{success: true, latitude, longitude, geofence_radius}`

#### `POST /api/reverse-geocode`
- Reverse geocodes coordinates to address
- Request: `{latitude, longitude}`
- Response: `{address, city, state, zip, country}`

#### `POST /api/calculate-route`
- Calculates truck route between waypoints
- Request: `{waypoints: [{lat, lng}, ...]}`
- Response: `{polylines, distance, duration, distanceMiles, durationHours}`

### 3. Frontend Compatibility Layer (`src/lib/supabaseCompat.ts`)

Replaced the stub `functions.invoke()` implementation with actual REST API calls:

#### Supported Actions:

| Edge Function Action | REST API Endpoint | Description |
|---------------------|-------------------|-------------|
| `geocode-location` | `POST /api/geocode` | Geocode address only |
| `geocode-and-save-location` | `POST /api/geocode-and-save` | Geocode and save to DB |
| `reverse-geocode` | `POST /api/reverse-geocode` | Coordinates to address |
| `calculate-truck-route`<br>`calculate-route`<br>`get-route-for-load` | `POST /api/calculate-route` | Calculate truck route |
| `get-map-config` | `GET /api/here-config` | Get HERE API key |

#### Graceful Handling:
- Unsupported actions log a warning and return a stub response
- All actions return Supabase-compatible response format: `{data, error}`

### 4. UI Enhancements (`src/components/tms/LocationsView.tsx`)

Added user-visible feedback for geocoding operations:

#### Success Messages:
- Single location: Toast with coordinates
- Bulk geocode: Summary toast with success/failure counts

#### Error Messages:
- Specific error messages from API
- User-friendly toast notifications
- No more silent console-only warnings

#### Features:
- Real-time geocoding status indicators
- Loading spinners during operations
- Bulk geocoding with progress tracking

### 5. Configuration (`.env.example`)

Added required environment variable:

```bash
HERE_API_KEY=your_here_api_key_here
```

Get your API key from: https://developer.here.com/

## API Specifications

### HERE Maps Geocoding API v7
- Endpoint: `https://geocode.search.hereapi.com/v1/geocode`
- Documentation: https://developer.here.com/documentation/geocoding-search-api/dev_guide/index.html

### HERE Maps Routing API v8
- Endpoint: `https://router.hereapi.com/v8/routes`
- Documentation: https://developer.here.com/documentation/routing-api/8/dev_guide/index.html
- Truck parameters included:
  - Height: 4.11m (13.5 feet)
  - Width: 2.59m (8.5 feet)
  - Length: 22.25m (73 feet)
  - Gross Weight: 36,287kg (80,000 lbs)
  - Axle Count: 5
  - Type: Tractor

## Testing Checklist

### Local Development Testing:

1. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your HERE_API_KEY
   ```

2. **Start the server:**
   ```bash
   npm run dev:all
   ```

3. **Test LocationsView:**
   - Navigate to Locations tab
   - Create a new location with address
   - Click "Geocode Now" button
   - Verify success toast appears
   - Verify coordinates are saved and displayed

4. **Test bulk geocoding:**
   - Create multiple locations without coordinates
   - Click "Geocode All" button
   - Verify progress and summary toast

5. **Test LiveTracking:**
   - Navigate to Live Tracking view
   - Verify map loads without "Edge function not implemented" errors
   - Verify driver locations display correctly

6. **Test DriverPortal:**
   - Navigate to Driver Portal (or assign driver to load)
   - Verify map loads with route polyline
   - Verify no console errors

### Expected Console Output:

#### Success:
```
[HERE Geocode] Query: 123 Main St, Dallas, TX, 75201
[HERE Geocode] Success: 32.776665, -96.796989
[HERE Geocode] Updated location abc-123 with coordinates: 32.776665, -96.796989
```

#### API Key Missing:
```
[HERE] Map config unavailable (edge function may not be deployed): HERE_API_KEY not configured
```

## Migration Notes

### Breaking Changes:
- **None** - Implementation maintains backward compatibility with existing code

### Deprecation Warnings:
- Old Supabase edge function `here-webhook` is now replaced with REST endpoints
- No code changes required in components using `db.functions.invoke()`

### New Features:
- User-visible error messages via toast notifications
- Better error handling and logging
- Specific error messages from HERE Maps API
- Bulk geocoding with progress feedback

## Troubleshooting

### Issue: "HERE_API_KEY not configured"
**Solution:** Add HERE_API_KEY to your .env file

### Issue: "Geocoding failed" with 401 Unauthorized
**Solution:** Verify your HERE API key is valid and not expired

### Issue: "No results found"
**Solution:** Check that the address is valid and properly formatted

### Issue: Map doesn't load in LiveTracking/DriverPortal
**Solution:** 
1. Check browser console for specific errors
2. Verify HERE_API_KEY is set
3. Check network tab for failed API requests

## Security Considerations

- HERE_API_KEY is stored server-side (not exposed to frontend in .env)
- API key is only sent to frontend via `/api/here-config` endpoint
- Rate limiting applied to all API endpoints (100 req/15min)
- Input validation on all endpoints

## Performance

- Geocoding: ~100-300ms per request
- Route calculation: ~200-500ms depending on waypoint count
- No caching implemented (future enhancement)

## Future Enhancements

1. **Caching**: Cache geocoding results to reduce API calls
2. **Batch geocoding**: Process multiple locations in a single API call
3. **Progressive enhancement**: Show partial results during bulk operations
4. **Retry logic**: Automatic retry with exponential backoff
5. **Address validation**: Pre-validate addresses before geocoding

## Support

For issues or questions:
1. Check console logs for specific error messages
2. Verify environment variables are set correctly
3. Review HERE Maps API documentation
4. Check API usage/limits in HERE developer dashboard
