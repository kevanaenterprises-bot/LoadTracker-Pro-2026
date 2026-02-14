# Testing Guide: HERE Maps Geocoding Implementation

This guide will help you test the new HERE Maps geocoding functionality.

## Prerequisites

1. **HERE Maps API Key**: Get a free API key from [HERE Developer Portal](https://developer.here.com/)
2. **PostgreSQL Database**: Connection string should be in `.env` as `DATABASE_URL`
3. **Node.js**: Version 16 or higher

## Setup

1. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and add your HERE API key:**
   ```bash
   HERE_API_KEY=your_actual_here_api_key
   DATABASE_URL=your_postgresql_connection_string
   VITE_API_URL=http://localhost:3001
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the frontend:**
   ```bash
   npm run build
   ```

## Running the Application

### Option 1: Development Mode (Separate Processes)

**Terminal 1 - Start the API server:**
```bash
npm run dev:server
```

You should see:
```
🚀 API server running on port 3001
📊 Database: Connected
```

If HERE_API_KEY is missing, you'll see:
```
⚠️  WARNING: HERE_API_KEY environment variable is not set!
   Geocoding and routing features will not work.
   Get your API key from: https://developer.here.com/
```

**Terminal 2 - Start the frontend:**
```bash
npm run dev
```

### Option 2: Production Mode (Single Process)

```bash
npm start
```

The server will serve both the API and the built frontend.

## Test Cases

### Test 1: Single Location Geocoding

1. Navigate to **TMS > Locations**
2. Click **Add Shipper** (or Add Receiver)
3. Fill in the form:
   - Company Name: "Test Company"
   - Address: "1600 Pennsylvania Avenue NW"
   - City: "Washington"
   - State: "DC"
   - ZIP: "20500"
4. Click **Save**

**Expected Results:**
- ✅ Location is created
- ✅ Geocoding starts automatically
- ✅ Success toast appears: "Location geocoded successfully"
- ✅ Coordinates shown in toast (e.g., "Coordinates: 38.897957, -77.036560")
- ✅ Location card shows green "Geofence Ready" badge
- ✅ No console errors

**Console logs should show:**
```
[HERE Geocode] Query: 1600 Pennsylvania Avenue NW, Washington, DC, 20500
[HERE Geocode] Success: 38.897957, -77.036560
[HERE Geocode] Updated location abc-123 with coordinates: 38.897957, -77.036560
```

### Test 2: Manual Geocoding

1. Navigate to **TMS > Locations**
2. Find a location without coordinates (yellow "Not Geocoded" badge)
3. Click **Geocode Now** button on the location card

**Expected Results:**
- ✅ "Geocoding..." spinner appears
- ✅ Success toast appears with coordinates
- ✅ Badge changes to green "Geofence Ready"
- ✅ Location is updated in the database

### Test 3: Bulk Geocoding

1. Create 3-5 locations without waiting for geocoding:
   - Use different addresses (e.g., famous landmarks)
   - Don't manually geocode them
2. Click the **Geocode All (N)** button at the top

**Expected Results:**
- ✅ Info toast: "Starting bulk geocoding"
- ✅ All locations show "Geocoding..." spinners
- ✅ Summary toast at end: "Successfully geocoded N location(s)"
- ✅ All badges change to green "Geofence Ready"

### Test 4: Geocoding Error Handling

1. Create a location with invalid address:
   - Address: "asdfasdfasdf"
   - City: "Nonexistent"
   - State: "ZZ"
   - ZIP: "00000"
2. Try to geocode it

**Expected Results:**
- ✅ Error toast appears: "Geocoding failed"
- ✅ Specific error message shown
- ✅ Location remains in "Not Geocoded" state
- ✅ No crash or console errors

### Test 5: Live Tracking Map

1. Navigate to **TMS > Live Tracking**
2. Wait for map to load

**Expected Results:**
- ✅ Map loads successfully
- ✅ No "Edge function not implemented" errors in console
- ✅ HERE Maps tiles render correctly
- ✅ Driver locations display (if any drivers exist)

**Console logs should show:**
```
[LiveTracking] Fetching map config (attempt 1/2)...
[LiveTracking] API key fetched successfully
[LiveTracking] HERE SDK already loaded (or loading)
```

### Test 6: Driver Portal Map

1. Create a load with pickup and delivery locations
2. Assign a driver to the load
3. Navigate to **Driver Portal** (or view load details with driver assigned)
4. View the map section

**Expected Results:**
- ✅ Map loads with route polyline
- ✅ Pickup and delivery markers shown
- ✅ Route drawn on map
- ✅ No console errors

**Console logs should show:**
```
[HERE] Fetching API key (attempt 1/2)...
[HERE] API key fetched successfully
[HERE] Creating map with container: 800 x 400
[HERE] Map created successfully
```

### Test 7: API Endpoint Testing (Advanced)

Use curl or Postman to test endpoints directly:

**Test GET /api/here-config:**
```bash
curl http://localhost:3001/api/here-config
```

Expected response:
```json
{"apiKey": "your_api_key_here"}
```

**Test POST /api/geocode:**
```bash
curl -X POST http://localhost:3001/api/geocode \
  -H "Content-Type: application/json" \
  -d '{
    "address": "1600 Pennsylvania Avenue NW",
    "city": "Washington",
    "state": "DC",
    "zip": "20500"
  }'
```

Expected response:
```json
{
  "success": true,
  "latitude": 38.897957,
  "longitude": -77.036560,
  "formattedAddress": "1600 Pennsylvania Avenue Northwest, Washington, DC 20500, United States"
}
```

**Test POST /api/calculate-route:**
```bash
curl -X POST http://localhost:3001/api/calculate-route \
  -H "Content-Type: application/json" \
  -d '{
    "waypoints": [
      {"lat": 32.7767, "lng": -96.7970},
      {"lat": 33.7490, "lng": -84.3880}
    ]
  }'
```

Expected response:
```json
{
  "polylines": ["encoded_polyline_data"],
  "distance": 1179234,
  "duration": 42650,
  "distanceMiles": 733,
  "durationHours": 11.8
}
```

## Troubleshooting

### Problem: "HERE_API_KEY not configured"

**Solution:**
1. Check that `.env` file exists in project root
2. Verify `HERE_API_KEY=...` is set in `.env`
3. Restart the server after changing `.env`
4. Check for typos in the environment variable name

### Problem: "401 Unauthorized" from HERE API

**Solution:**
1. Verify your API key is valid at [HERE Developer Dashboard](https://developer.here.com/projects)
2. Check that the API key has the correct permissions enabled:
   - Geocoding & Search API
   - Routing API
3. Ensure API key hasn't expired

### Problem: "No results found" when geocoding

**Solution:**
1. Check that address is valid and properly formatted
2. Try with a known address (e.g., "1600 Pennsylvania Avenue NW, Washington, DC, 20500")
3. Verify internet connection
4. Check HERE API status at [HERE Status Page](https://status.here.com/)

### Problem: Map doesn't load

**Solution:**
1. Open browser console and check for specific errors
2. Verify `/api/here-config` returns an API key
3. Check that HERE SDK scripts are loading (Network tab)
4. Clear browser cache and reload

### Problem: Database errors when saving coordinates

**Solution:**
1. Check database connection in server logs
2. Verify `locations` table has `latitude`, `longitude`, `geofence_radius` columns
3. Check database user has UPDATE permissions
4. Review server logs for specific SQL errors

## Performance Benchmarks

Expected response times (with good internet connection):

- Single geocode: 100-300ms
- Bulk geocode (10 locations): 1-3 seconds
- Route calculation: 200-500ms
- Map loading: 1-2 seconds (first load, includes SDK download)

## Success Criteria Checklist

After completing all tests, verify:

- [ ] ✅ Geocode button successfully geocodes locations
- [ ] ✅ Coordinates are saved to database
- [ ] ✅ User sees success/error messages (not just console)
- [ ] ✅ No "Edge function not implemented" errors
- [ ] ✅ LiveTracking maps load correctly
- [ ] ✅ DriverPortal maps load correctly
- [ ] ✅ Bulk geocoding works with progress feedback
- [ ] ✅ Error handling works for invalid addresses

## API Rate Limits

Be aware of rate limits:

1. **Express Server**: 100 requests per 15 minutes per IP
2. **HERE Maps Free Tier**: 
   - Geocoding: 250,000 requests/month
   - Routing: 250,000 requests/month

For production use, consider upgrading your HERE plan or implementing caching.

## Next Steps

After successful testing:

1. Set up production environment variables on Railway/hosting platform
2. Configure HERE API key restrictions (domain allowlist) in HERE Developer Portal
3. Monitor API usage in HERE Developer Dashboard
4. Consider implementing caching for frequently geocoded addresses
5. Set up error tracking/monitoring (e.g., Sentry)

## Support

If you encounter issues not covered in this guide:

1. Check `GEOCODING_IMPLEMENTATION.md` for implementation details
2. Review server logs for specific error messages
3. Check HERE Developer documentation: https://developer.here.com/documentation
4. Verify environment variables are correctly set
5. Check GitHub issues for similar problems
