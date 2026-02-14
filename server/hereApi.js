/**
 * HERE Maps API Integration
 * Handles geocoding, reverse geocoding, and route calculation
 */

const HERE_API_KEY = process.env.HERE_API_KEY;

// Validate API key on module load
if (!HERE_API_KEY) {
  console.error('⚠️  WARNING: HERE_API_KEY environment variable is not set!');
  console.error('   Geocoding and routing features will not work.');
  console.error('   Get your API key from: https://developer.here.com/');
}

// Default truck specifications for route calculation
// These represent a typical semi-truck/tractor-trailer
const DEFAULT_TRUCK_SPECS = {
  height: 411,        // 4.11 meters (13.5 feet)
  width: 259,         // 2.59 meters (8.5 feet)
  length: 2225,       // 22.25 meters (73 feet)
  grossWeight: 36287, // 36,287 kg (80,000 lbs - US legal limit)
  axleCount: 5,       // Standard 5-axle configuration
  type: 'tractor',    // Tractor type
};

/**
 * Geocode an address using HERE Maps Geocoding API v7
 * @param {string} address - Street address
 * @param {string} city - City name
 * @param {string} state - State code (e.g., "TX")
 * @param {string} zip - ZIP code
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
async function geocodeAddress(address, city, state, zip) {
  if (!HERE_API_KEY) {
    throw new Error('HERE_API_KEY not configured');
  }

  try {
    // Build the query string for geocoding
    const parts = [];
    if (address) parts.push(address);
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zip) parts.push(zip);
    
    const query = parts.join(', ');
    
    if (!query) {
      throw new Error('No address information provided');
    }

    console.log(`[HERE Geocode] Query: ${query}`);

    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&apiKey=${HERE_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[HERE Geocode] API Error:', response.status, errorText);
      throw new Error(`HERE API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const location = data.items[0];
      const latitude = location.position.lat;
      const longitude = location.position.lng;
      
      console.log(`[HERE Geocode] Success: ${latitude}, ${longitude}`);
      
      return {
        latitude,
        longitude,
        formattedAddress: location.address?.label || query,
      };
    } else {
      console.warn('[HERE Geocode] No results found for:', query);
      return null;
    }
  } catch (error) {
    console.error('[HERE Geocode] Error:', error);
    throw error;
  }
}

/**
 * Geocode an address and save coordinates to database
 * @param {object} pool - PostgreSQL connection pool
 * @param {string} locationId - Location ID to update
 * @param {string} address - Street address
 * @param {string} city - City name
 * @param {string} state - State code
 * @param {string} zip - ZIP code
 * @param {number} geofenceRadius - Geofence radius in meters (default: 500)
 * @returns {Promise<{success: boolean, latitude?: number, longitude?: number, error?: string}>}
 */
async function geocodeAndSaveLocation(pool, locationId, address, city, state, zip, geofenceRadius = 500) {
  try {
    // Geocode the address
    const result = await geocodeAddress(address, city, state, zip);
    
    if (!result) {
      return {
        success: false,
        error: 'Could not geocode address',
      };
    }

    // Update the database
    await pool.query(
      `UPDATE locations 
       SET latitude = $1, longitude = $2, geofence_radius = $3, updated_at = NOW()
       WHERE id = $4`,
      [result.latitude, result.longitude, geofenceRadius, locationId]
    );

    console.log(`[HERE Geocode] Updated location ${locationId} with coordinates: ${result.latitude}, ${result.longitude}`);

    return {
      success: true,
      latitude: result.latitude,
      longitude: result.longitude,
      geofence_radius: geofenceRadius,
    };
  } catch (error) {
    console.error('[HERE Geocode] Error in geocodeAndSaveLocation:', error);
    return {
      success: false,
      error: error.message || 'Geocoding failed',
    };
  }
}

/**
 * Reverse geocode coordinates to get an address
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Promise<{address: string} | null>}
 */
async function reverseGeocode(latitude, longitude) {
  if (!HERE_API_KEY) {
    throw new Error('HERE_API_KEY not configured');
  }

  try {
    console.log(`[HERE Reverse Geocode] Coordinates: ${latitude}, ${longitude}`);

    const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${latitude},${longitude}&apiKey=${HERE_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[HERE Reverse Geocode] API Error:', response.status, errorText);
      throw new Error(`HERE API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const location = data.items[0];
      const address = location.address?.label || '';
      
      console.log(`[HERE Reverse Geocode] Success: ${address}`);
      
      return {
        address,
        city: location.address?.city || '',
        state: location.address?.stateCode || '',
        zip: location.address?.postalCode || '',
        country: location.address?.countryCode || '',
      };
    } else {
      console.warn('[HERE Reverse Geocode] No results found');
      return null;
    }
  } catch (error) {
    console.error('[HERE Reverse Geocode] Error:', error);
    throw error;
  }
}

/**
 * Calculate a truck route between multiple waypoints
 * @param {Array<{lat: number, lng: number}>} waypoints - Array of waypoint coordinates
 * @returns {Promise<object>} Route information including polyline and distance
 */
async function calculateTruckRoute(waypoints) {
  if (!HERE_API_KEY) {
    throw new Error('HERE_API_KEY not configured');
  }

  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least 2 waypoints required for route calculation');
  }

  try {
    console.log(`[HERE Route] Calculating route for ${waypoints.length} waypoints`);

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const via = waypoints.slice(1, -1);

    // Build URL with truck parameters
    let url = `https://router.hereapi.com/v8/routes?transportMode=truck&routingMode=fast`;
    url += `&origin=${origin.lat},${origin.lng}`;
    url += `&destination=${destination.lat},${destination.lng}`;
    
    // Add via points
    via.forEach(point => {
      url += `&via=${point.lat},${point.lng}`;
    });

    // Add truck specifications (typical semi-truck)
    url += `&truck[height]=${DEFAULT_TRUCK_SPECS.height}`;
    url += `&truck[width]=${DEFAULT_TRUCK_SPECS.width}`;
    url += `&truck[length]=${DEFAULT_TRUCK_SPECS.length}`;
    url += `&truck[grossWeight]=${DEFAULT_TRUCK_SPECS.grossWeight}`;
    url += `&truck[axleCount]=${DEFAULT_TRUCK_SPECS.axleCount}`;
    url += `&truck[type]=${DEFAULT_TRUCK_SPECS.type}`;
    
    // Request polyline data
    url += `&return=polyline,summary`;
    url += `&apiKey=${HERE_API_KEY}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[HERE Route] API Error:', response.status, errorText);
      throw new Error(`HERE API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const sections = route.sections || [];
      
      // Extract polylines from all sections
      const polylines = sections.map(section => section.polyline).filter(Boolean);
      
      // Calculate total distance and duration
      const totalDistance = sections.reduce((sum, section) => sum + (section.summary?.length || 0), 0);
      const totalDuration = sections.reduce((sum, section) => sum + (section.summary?.duration || 0), 0);
      
      console.log(`[HERE Route] Success: ${totalDistance}m, ${totalDuration}s, ${polylines.length} sections`);
      
      return {
        polylines,
        distance: totalDistance, // in meters
        duration: totalDuration, // in seconds
        distanceMiles: Math.round(totalDistance * 0.000621371), // convert to miles
        durationHours: Math.round(totalDuration / 3600 * 10) / 10, // convert to hours, 1 decimal
      };
    } else {
      console.warn('[HERE Route] No route found');
      return null;
    }
  } catch (error) {
    console.error('[HERE Route] Error:', error);
    throw error;
  }
}

module.exports = {
  geocodeAddress,
  geocodeAndSaveLocation,
  reverseGeocode,
  calculateTruckRoute,
};
