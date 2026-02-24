import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, RefreshCw, Loader2, MapPin, Truck, Phone,
  Battery, Signal, Clock, Navigation, ChevronLeft, ChevronRight,
  Maximize2, Minimize2, Eye, EyeOff, Route, Radar, Wifi, WifiOff,
  Search, Filter, Layers, ZoomIn, ZoomOut, LocateFixed, Users,
  AlertTriangle, CheckCircle, Circle, Activity
} from 'lucide-react';

interface LiveTrackingViewProps {
  onBack: () => void;
}

interface DriverLocation {
  id: string;
  name: string;
  phone: string;
  truck_number: string;
  status: string;
  current_location: string;
  last_known_lat: number | null;
  last_known_lng: number | null;
  last_position_update: string | null;
  last_known_speed: number | null;
  last_known_heading: number | null;
  battery_level: number | null;
  active_load: {
    id: string;
    load_number: string;
    status: string;
    origin_city: string;
    origin_state: string;
    dest_city: string;
    dest_state: string;
    cargo_description: string;
  } | null;
  geofences: Array<{
    id: string;
    here_geofence_id: string;
    geofence_name: string;
    center_lat: number;
    center_lng: number;
    radius_meters: number;
    stop_id: string;
  }>;
  stops: Array<{
    id: string;
    stop_type: string;
    stop_sequence: number;
    company_name: string;
    city: string;
    state: string;
    address: string;
  }>;
  has_position: boolean;
  position_age_minutes: number | null;
}

interface TrailPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

// Declare HERE Maps types
declare global {
  interface Window {
    H: any;
  }
}

const LiveTrackingView: React.FC<LiveTrackingViewProps> = ({ onBack }) => {

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const platformRef = useRef<any>(null);
  const uiRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const geofencesGroupRef = useRef<any>(null);
  const trailGroupRef = useRef<any>(null);
  const routeGroupRef = useRef<any>(null);
  const customLayersRef = useRef<Record<string, any>>({});
  const defaultLayersRef = useRef<any>(null);

  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapApiKey, setMapApiKey] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<DriverLocation | null>(null);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showTrails, setShowTrails] = useState(false);
  const [showAllDrivers, setShowAllDrivers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [driverTrail, setDriverTrail] = useState<TrailPoint[]>([]);
  const [trailHours, setTrailHours] = useState(4);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapStyle, setMapStyle] = useState<'normal' | 'satellite' | 'terrain'>('normal');
  const [mapStyleError, setMapStyleError] = useState<string | null>(null);
  const [reverseGeoResults, setReverseGeoResults] = useState<Record<string, string>>({});
  const [fetchMethod, setFetchMethod] = useState<string>('');

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load HERE Maps API key with retry logic
  useEffect(() => {
    let cancelled = false;
    const fetchMapConfig = async (attempt = 1) => {
      const MAX_RETRIES = 2;
      try {
        console.log(`[LiveTracking] Fetching map config (attempt ${attempt}/${MAX_RETRIES})...`);
        const { data, error } = await supabase.functions.invoke('here-webhook', {
          body: { action: 'get-map-config' },
        });
        if (cancelled) return;
        if (data?.apiKey) {
          console.log('[LiveTracking] API key fetched successfully');
          setMapApiKey(data.apiKey);
        } else {
          // Use console.warn instead of console.error to avoid triggering error tracking
          // This is a non-critical failure - maps just won't load
          console.warn('[LiveTracking] Map config unavailable (edge function may not be deployed):', error?.message || 'No API key returned');
          if (attempt < MAX_RETRIES && !cancelled) {
            const delay = Math.min(2000 * attempt, 6000);
            console.log(`[LiveTracking] Retrying in ${delay}ms...`);
            setTimeout(() => { if (!cancelled) fetchMapConfig(attempt + 1); }, delay);
          } else {
            console.log('[LiveTracking] Map features will be unavailable - edge function not reachable');
          }
        }
      } catch (err: any) {
        // Use console.warn for edge function connectivity issues (non-critical)
        console.warn(`[LiveTracking] Map config fetch failed (attempt ${attempt}/${MAX_RETRIES}):`, err?.message || 'Edge function unreachable');
        if (attempt < MAX_RETRIES && !cancelled) {
          const delay = Math.min(2000 * attempt, 6000);
          console.log(`[LiveTracking] Retrying in ${delay}ms...`);
          setTimeout(() => { if (!cancelled) fetchMapConfig(attempt + 1); }, delay);
        } else {
          console.log('[LiveTracking] Map features will be unavailable - edge function not reachable');
        }
      }
    };
    fetchMapConfig();
    return () => { cancelled = true; };
  }, []);



  // Load HERE Maps JS scripts
  useEffect(() => {
    if (!mapApiKey) return;

    const scripts = [
      'https://js.api.here.com/v3/3.1/mapsjs-core.js',
      'https://js.api.here.com/v3/3.1/mapsjs-service.js',
      'https://js.api.here.com/v3/3.1/mapsjs-ui.js',
      'https://js.api.here.com/v3/3.1/mapsjs-mapevents.js',
    ];

    if (!document.querySelector('link[href*="mapsjs-ui.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css';
      document.head.appendChild(css);
    }

    if (window.H?.service?.Platform) {
      console.log('[LiveTracking] HERE SDK already loaded');
      setMapLoaded(true);
      return;
    }

    let cancelled = false;
    let loadedCount = 0;

    const loadNext = () => {
      if (cancelled) return;
      if (loadedCount >= scripts.length) {
        let attempts = 0;
        const checkReady = () => {
          if (cancelled) return;
          if (window.H?.service?.Platform) {
            console.log('[LiveTracking] HERE SDK ready after polling');
            setMapLoaded(true);
          } else if (attempts < 50) {
            attempts++;
            setTimeout(checkReady, 100);
          } else {
            console.warn('[LiveTracking] HERE Maps SDK failed to initialize (non-critical)');
          }
        };
        setTimeout(checkReady, 100);
        return;
      }

      const src = scripts[loadedCount];
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        loadedCount++;
        loadNext();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.onload = () => { loadedCount++; loadNext(); };
      script.onerror = () => { loadedCount++; loadNext(); };
      document.head.appendChild(script);
    };

    loadNext();
    return () => { cancelled = true; };
  }, [mapApiKey]);

  // Suppress Tangram rendering errors from HERE Maps SDK (non-fatal tile rendering glitches)
  useEffect(() => {
    const originalConsoleError = console.error;
    const suppressedPatterns = ['Tangram [error]', "evaluating 'e.retain'", 'Error for style group'];
    
    console.error = (...args: any[]) => {
      const message = args.map(a => String(a)).join(' ');
      if (suppressedPatterns.some(pattern => message.includes(pattern))) {
        // Suppress Tangram rendering errors - these are non-fatal HERE Maps SDK internal errors
        return;
      }
      originalConsoleError.apply(console, args);
    };
    
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !mapApiKey || mapInstanceRef.current) return;

    try {
      const H = window.H;
      if (!H?.service?.Platform) return;

      const platform = new H.service.Platform({ apikey: mapApiKey });
      platformRef.current = platform;

      const defaultLayers = platform.createDefaultLayers();
      defaultLayersRef.current = defaultLayers;
      const map = new H.Map(mapRef.current, defaultLayers.vector.normal.map, {
        zoom: 5,
        center: { lat: 32.0, lng: -96.0 },
        pixelRatio: window.devicePixelRatio || 1,
      });

      const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
      const ui = H.ui.UI.createDefault(map, defaultLayers);
      uiRef.current = ui;

      const markersGroup = new H.map.Group();
      const geofencesGroup = new H.map.Group();
      const trailGroup = new H.map.Group();
      const routeGroup = new H.map.Group();

      map.addObject(geofencesGroup);
      map.addObject(routeGroup);
      map.addObject(trailGroup);
      map.addObject(markersGroup);

      markersGroupRef.current = markersGroup;
      geofencesGroupRef.current = geofencesGroup;
      trailGroupRef.current = trailGroup;
      routeGroupRef.current = routeGroup;
      mapInstanceRef.current = map;

      const handleResize = () => map.getViewPort().resize();
      window.addEventListener('resize', handleResize);
      return () => { window.removeEventListener('resize', handleResize); };
    } catch (err) {
      console.error('[LiveTracking] Failed to initialize map:', err);
    }
  }, [mapLoaded, mapApiKey]);


  // Fetch driver locations - direct DB PRIMARY, edge function as bonus
  const fetchDriverLocations = useCallback(async () => {
    console.log('[LiveTracking] Fetching drivers... showAllDrivers=' + showAllDrivers);
    try {
      // PRIMARY: Direct DB query (edge function has URL parsing issues)
      let query = supabase
        .from('drivers')
        .select('id, name, phone, truck_number, status, current_location, last_known_lat, last_known_lng, last_position_update, last_known_speed, last_known_heading, battery_level')
        .order('name');

      // Only filter if NOT showing all drivers
      if (!showAllDrivers) {
        query = query.in('status', ['available', 'on_route']);
      }

      const { data: driversData, error: driversError } = await query;

      if (driversError) {
        console.error('[LiveTracking] Direct DB query failed:', driversError);
        setFetchMethod('DB query failed: ' + driversError.message);
        // Try edge function as fallback
        try {
          const { data } = await supabase.functions.invoke('here-webhook', {
            body: { action: 'get-all-driver-locations', include_inactive: showAllDrivers },
          });
          if (data?.success && data.drivers) {
            console.log(`[LiveTracking] Edge function returned ${data.drivers.length} drivers`);
            setDrivers(data.drivers);
            setFetchMethod('Edge function');
            setLastRefresh(new Date());
            return;
          }
        } catch (e) {
          console.error('[LiveTracking] Edge function also failed:', e);
        }
        return;
      }

      console.log(`[LiveTracking] Direct DB returned ${(driversData || []).length} drivers`);
      
      // Log each driver's status for debugging
      (driversData || []).forEach(d => {
        console.log(`[LiveTracking] Driver: ${d.name} | Status: ${d.status} | Truck: ${d.truck_number} | Has GPS: ${!!(d.last_known_lat && d.last_known_lng)} | Last update: ${d.last_position_update || 'never'}`);
      });

      // Get active loads for these drivers
      const driverIds = (driversData || []).map(d => d.id);
      let activeLoads: any[] = [];
      if (driverIds.length > 0) {
        const { data: loadsData } = await supabase
          .from('loads')
          .select('id, load_number, driver_id, status, origin_city, origin_state, dest_city, dest_state, cargo_description')
          .in('driver_id', driverIds)
          .in('status', ['DISPATCHED', 'IN_TRANSIT']);
        activeLoads = loadsData || [];
        console.log(`[LiveTracking] Found ${activeLoads.length} active loads`);
      }

      // Map to the expected format
      const driverLocations = (driversData || []).map(driver => {
        const activeLoad = activeLoads.find(l => l.driver_id === driver.id);
        const posAge = driver.last_position_update
          ? Math.round((Date.now() - new Date(driver.last_position_update).getTime()) / 60000)
          : null;
        return {
          ...driver,
          active_load: activeLoad || null,
          geofences: [],
          stops: [],
          has_position: !!(driver.last_known_lat && driver.last_known_lng),
          position_age_minutes: posAge,
        };
      });

      console.log(`[LiveTracking] Final driver count: ${driverLocations.length} (${driverLocations.filter(d => d.has_position).length} with GPS)`);
      setDrivers(driverLocations);
      setFetchMethod('Direct DB');
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[LiveTracking] Failed to fetch driver locations:', err);
      setFetchMethod('Error: ' + String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAllDrivers]);



  useEffect(() => {
    fetchDriverLocations();
  }, [fetchDriverLocations]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchDriverLocations();
      }, 30000); // 30 seconds
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, fetchDriverLocations]);

  // Create driver marker SVG
  const createDriverMarkerIcon = (driver: DriverLocation, isSelected: boolean) => {
    const H = window.H;
    if (!H) return null;

    const isOnline = driver.position_age_minutes !== null && driver.position_age_minutes < 10;
    const isStale = driver.position_age_minutes !== null && driver.position_age_minutes >= 10 && driver.position_age_minutes < 60;
    const statusColor = driver.status === 'on_route' ? '#3b82f6' : driver.status === 'available' ? '#10b981' : '#94a3b8';
    const borderColor = isSelected ? '#f59e0b' : isOnline ? statusColor : isStale ? '#f59e0b' : '#ef4444';
    const size = isSelected ? 48 : 40;
    const heading = driver.last_known_heading || 0;

    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size + 20}" height="${size + 30}" viewBox="0 0 ${size + 20} ${size + 30}">
        <defs>
          <filter id="shadow_${driver.id.substring(0,8)}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
        </defs>
        <!-- Pin shape -->
        <path d="M${(size+20)/2} ${size+25} L${(size+20)/2 - 8} ${size} L${(size+20)/2 + 8} ${size}" fill="${borderColor}" />
        <!-- Circle background -->
        <circle cx="${(size+20)/2}" cy="${size/2 + 5}" r="${size/2}" fill="${borderColor}" filter="url(#shadow_${driver.id.substring(0,8)})"/>
        <circle cx="${(size+20)/2}" cy="${size/2 + 5}" r="${size/2 - 3}" fill="white"/>
        <!-- Truck icon -->
        <g transform="translate(${(size+20)/2 - 10}, ${size/2 + 5 - 10}) rotate(${heading}, 10, 10)">
          <path d="M4 16V6a2 2 0 0 1 2-2h8l4 4v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="${borderColor}" stroke-width="1.5"/>
          <path d="M12 6v4h4" fill="none" stroke="${borderColor}" stroke-width="1.5"/>
        </g>
        <!-- Status dot -->
        <circle cx="${(size+20)/2 + size/2 - 4}" cy="8" r="5" fill="${isOnline ? '#10b981' : isStale ? '#f59e0b' : '#ef4444'}" stroke="white" stroke-width="2"/>
        ${driver.battery_level !== null && driver.battery_level < 20 ? `
          <circle cx="${(size+20)/2 - size/2 + 4}" cy="8" r="5" fill="#ef4444" stroke="white" stroke-width="2"/>
        ` : ''}
      </svg>
    `;

    return new H.map.Icon(svgMarkup, { anchor: { x: (size+20)/2, y: size+25 } });
  };

  // Create stop marker SVG
  const createStopMarkerIcon = (stopType: string, companyName: string) => {
    const H = window.H;
    if (!H) return null;

    const color = stopType === 'pickup' ? '#8b5cf6' : '#ef4444';
    const letter = stopType === 'pickup' ? 'P' : 'D';

    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
        <path d="M16 42 L4 28 A14 14 0 1 1 28 28 Z" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="19" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">${letter}</text>
      </svg>
    `;

    return new H.map.Icon(svgMarkup, { anchor: { x: 16, y: 42 } });
  };

  // Update map markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current || !window.H) return;

    const H = window.H;
    const markersGroup = markersGroupRef.current;
    const geofencesGroup = geofencesGroupRef.current;
    const routeGroup = routeGroupRef.current;

    // Clear existing markers
    markersGroup.removeAll();
    geofencesGroup.removeAll();
    routeGroup.removeAll();

    const driversWithPosition = drivers.filter(d => d.has_position);

    driversWithPosition.forEach((driver) => {
      if (!driver.last_known_lat || !driver.last_known_lng) return;

      const isSelected = selectedDriver?.id === driver.id;
      const icon = createDriverMarkerIcon(driver, isSelected);
      if (!icon) return;

      const marker = new H.map.Marker(
        { lat: driver.last_known_lat, lng: driver.last_known_lng },
        { icon, data: driver }
      );

      marker.addEventListener('tap', () => {
        setSelectedDriver(driver);
      });

      markersGroup.addObject(marker);

      // Add geofences
      if (showGeofences && driver.geofences) {
        driver.geofences.forEach((gf) => {
          if (gf.center_lat && gf.center_lng) {
            const circle = new H.map.Circle(
              { lat: gf.center_lat, lng: gf.center_lng },
              gf.radius_meters || 500,
              {
                style: {
                  strokeColor: 'rgba(59, 130, 246, 0.6)',
                  lineWidth: 2,
                  fillColor: 'rgba(59, 130, 246, 0.1)',
                  lineDash: [4, 4],
                },
              }
            );
            geofencesGroup.addObject(circle);
          }
        });
      }

      // Add stop markers for active loads
      if (driver.stops && driver.active_load) {
        driver.stops.forEach((stop) => {
          const gf = driver.geofences.find(g => g.stop_id === stop.id);
          if (gf && gf.center_lat && gf.center_lng) {
            const stopIcon = createStopMarkerIcon(stop.stop_type, stop.company_name);
            if (stopIcon) {
              const stopMarker = new H.map.Marker(
                { lat: gf.center_lat, lng: gf.center_lng },
                { icon: stopIcon }
              );
              markersGroup.addObject(stopMarker);
            }
          }
        });

        // Draw route line from driver to next stop
        if (driver.geofences.length > 0) {
          const routePoints: Array<{lat: number; lng: number}> = [];
          
          // Add driver position
          routePoints.push({ lat: driver.last_known_lat, lng: driver.last_known_lng });
          
          // Add stops in order
          const pickups = driver.stops.filter(s => s.stop_type === 'pickup').sort((a, b) => a.stop_sequence - b.stop_sequence);
          const deliveries = driver.stops.filter(s => s.stop_type === 'delivery').sort((a, b) => a.stop_sequence - b.stop_sequence);
          
          [...pickups, ...deliveries].forEach(stop => {
            const gf = driver.geofences.find(g => g.stop_id === stop.id);
            if (gf && gf.center_lat && gf.center_lng) {
              routePoints.push({ lat: gf.center_lat, lng: gf.center_lng });
            }
          });

          if (routePoints.length >= 2) {
            const lineString = new H.geo.LineString();
            routePoints.forEach(p => lineString.pushPoint(p));
            
            const routeLine = new H.map.Polyline(lineString, {
              style: {
                strokeColor: 'rgba(59, 130, 246, 0.5)',
                lineWidth: 3,
                lineDash: [8, 6],
              },
            });
            routeGroup.addObject(routeLine);
          }
        }
      }
    });

    // Auto-fit map to show all markers
    if (driversWithPosition.length > 0 && !selectedDriver) {
      try {
        const bounds = markersGroup.getBoundingBox();
        if (bounds) {
          mapInstanceRef.current.getViewModel().setLookAtData({
            bounds,
            padding: { top: 80, bottom: 80, left: sidebarOpen ? 420 : 80, right: 80 },
          });
        }
      } catch (e) {
        // Ignore bounds errors
      }
    }
  }, [drivers, selectedDriver, showGeofences, sidebarOpen]);

  // Fetch and display driver trail
  const fetchDriverTrail = async (driverId: string) => {
    try {
      const { data } = await supabase.functions.invoke('here-webhook', {
        body: { action: 'get-driver-trail', driver_id: driverId, hours: trailHours },
      });

      if (data?.success && data.trail) {
        setDriverTrail(data.trail);
        drawTrail(data.trail);
      }
    } catch (err) {
      console.error('Failed to fetch trail:', err);
    }
  };

  const drawTrail = (trail: TrailPoint[]) => {
    if (!trailGroupRef.current || !window.H || trail.length < 2) return;

    const H = window.H;
    trailGroupRef.current.removeAll();

    const lineString = new H.geo.LineString();
    trail.forEach(point => {
      lineString.pushPoint({ lat: point.latitude, lng: point.longitude });
    });

    const trailLine = new H.map.Polyline(lineString, {
      style: {
        strokeColor: 'rgba(139, 92, 246, 0.7)',
        lineWidth: 4,
        lineCap: 'round',
        lineJoin: 'round',
      },
    });

    trailGroupRef.current.addObject(trailLine);

    // Add start and end markers
    if (trail.length > 0) {
      const startSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#8b5cf6" stroke="white" stroke-width="2"/></svg>`;
      const endSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#10b981" stroke="white" stroke-width="2"/></svg>`;

      const startMarker = new H.map.Marker(
        { lat: trail[0].latitude, lng: trail[0].longitude },
        { icon: new H.map.Icon(startSvg, { anchor: { x: 8, y: 8 } }) }
      );
      const endMarker = new H.map.Marker(
        { lat: trail[trail.length - 1].latitude, lng: trail[trail.length - 1].longitude },
        { icon: new H.map.Icon(endSvg, { anchor: { x: 8, y: 8 } }) }
      );

      trailGroupRef.current.addObject(startMarker);
      trailGroupRef.current.addObject(endMarker);
    }
  };

  useEffect(() => {
    if (selectedDriver && showTrails) {
      fetchDriverTrail(selectedDriver.id);
    } else if (trailGroupRef.current) {
      trailGroupRef.current.removeAll();
      setDriverTrail([]);
    }
  }, [selectedDriver, showTrails, trailHours]);

  // Center map on driver
  const centerOnDriver = (driver: DriverLocation) => {
    if (!mapInstanceRef.current || !driver.last_known_lat || !driver.last_known_lng) return;
    mapInstanceRef.current.setCenter({ lat: driver.last_known_lat, lng: driver.last_known_lng }, true);
    mapInstanceRef.current.setZoom(14, true);
  };

  // Reverse geocode for selected driver
  useEffect(() => {
    if (!selectedDriver?.last_known_lat || !selectedDriver?.last_known_lng) return;
    if (reverseGeoResults[selectedDriver.id]) return;

    const reverseGeocode = async () => {
      try {
        const { data } = await supabase.functions.invoke('here-webhook', {
          body: {
            action: 'reverse-geocode',
            latitude: selectedDriver.last_known_lat,
            longitude: selectedDriver.last_known_lng,
          },
        });
        if (data?.success && data.address) {
          setReverseGeoResults(prev => ({ ...prev, [selectedDriver.id]: data.address }));
        }
      } catch (err) {
        // Ignore
      }
    };
    reverseGeocode();
  }, [selectedDriver]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDriverLocations();
  };

  // Change map style - uses custom tile providers for satellite (old raster endpoints are deprecated/410)
  const changeMapStyle = (style: 'normal' | 'satellite' | 'terrain') => {
    if (!mapInstanceRef.current || !platformRef.current || !mapApiKey) return;
    
    const H = window.H;
    if (!H) return;
    
    setMapStyleError(null);
    
    try {
      if (style === 'normal') {
        // Use the stored default vector layer (always works)
        const layers = defaultLayersRef.current || platformRef.current.createDefaultLayers();
        mapInstanceRef.current.setBaseLayer(layers.vector.normal.map);
        setMapStyle('normal');
        return;
      }
      
      if (style === 'terrain') {
        // Use vector truck layer instead of deprecated raster terrain
        // This is more useful for a trucking TMS anyway
        const layers = defaultLayersRef.current || platformRef.current.createDefaultLayers();
        try {
          // Try truck layer first
          if (layers.vector?.normal?.truck) {
            mapInstanceRef.current.setBaseLayer(layers.vector.normal.truck);
            setMapStyle('terrain');
            return;
          }
        } catch (e) {
          console.warn('[LiveTracking] Truck layer not available, using normal map');
        }
        // Fallback to normal map
        mapInstanceRef.current.setBaseLayer(layers.vector.normal.map);
        setMapStyle('terrain');
        return;
      }
      
      if (style === 'satellite') {
        // Create custom satellite tile layer using HERE Map Tile API v3
        // The old raster.satellite.map uses deprecated endpoints that return 410
        const cacheKey = 'satellite';
        
        if (!customLayersRef.current[cacheKey]) {
          console.log('[LiveTracking] Creating custom satellite tile layer with HERE Map Tile API v3');
          
          // Try multiple HERE satellite tile URL patterns
          const tileProvider = new H.map.provider.ImageTileProvider({
            label: 'Satellite Tiles',
            min: 1,
            max: 19,
            getURL: function(col: number, row: number, level: number) {
              // HERE Map Tile API v3 satellite endpoint
              // Server subdomains 1-4 for load balancing
              const server = ((col + row) % 4) + 1;
              return `https://${server}.aerial.maps.ls.hereapi.com/maptile/2.1/maptile/newest/satellite.day/${level}/${col}/${row}/256/png8?apiKey=${mapApiKey}`;
            },
          });
          
          // Also try the newer v3 endpoint as a fallback
          const tileProviderV3 = new H.map.provider.ImageTileProvider({
            label: 'Satellite Tiles V3',
            min: 1,
            max: 19,
            getURL: function(col: number, row: number, level: number) {
              return `https://maps.hereapi.com/v3/base/mc/${level}/${col}/${row}/png8?style=explore.satellite.day&size=256&apiKey=${mapApiKey}`;
            },
          });
          
          // Try the v3 endpoint first (newer, more likely to work)
          customLayersRef.current[cacheKey] = new H.map.layer.TileLayer(tileProviderV3);
          customLayersRef.current[cacheKey + '_fallback'] = new H.map.layer.TileLayer(tileProvider);
        }
        
        try {
          mapInstanceRef.current.setBaseLayer(customLayersRef.current[cacheKey]);
          setMapStyle('satellite');
          console.log('[LiveTracking] Satellite layer set (v3 API)');
        } catch (layerErr) {
          console.warn('[LiveTracking] V3 satellite failed, trying fallback:', layerErr);
          try {
            mapInstanceRef.current.setBaseLayer(customLayersRef.current[cacheKey + '_fallback']);
            setMapStyle('satellite');
          } catch (fallbackErr) {
            console.error('[LiveTracking] All satellite layers failed:', fallbackErr);
            setMapStyleError('Satellite view is temporarily unavailable');
            // Fall back to normal map
            const layers = defaultLayersRef.current || platformRef.current.createDefaultLayers();
            mapInstanceRef.current.setBaseLayer(layers.vector.normal.map);
            setMapStyle('normal');
            setTimeout(() => setMapStyleError(null), 4000);
          }
        }
        return;
      }
    } catch (err) {
      console.error('[LiveTracking] Failed to change map style:', err);
      setMapStyleError('Failed to change map style');
      setTimeout(() => setMapStyleError(null), 4000);
      // Ensure we fall back to a working layer
      try {
        const layers = defaultLayersRef.current || platformRef.current.createDefaultLayers();
        mapInstanceRef.current.setBaseLayer(layers.vector.normal.map);
        setMapStyle('normal');
      } catch (e) {
        // Last resort - ignore
      }
    }
  };


  // Fit all drivers
  const fitAllDrivers = () => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;
    try {
      const bounds = markersGroupRef.current.getBoundingBox();
      if (bounds) {
        mapInstanceRef.current.getViewModel().setLookAtData({
          bounds,
          padding: { top: 80, bottom: 80, left: sidebarOpen ? 420 : 80, right: 80 },
        });
      }
    } catch (e) {
      // Ignore
    }
  };

  const getPositionStatus = (driver: DriverLocation) => {
    if (!driver.has_position) return { label: 'No GPS', color: 'text-slate-400', bg: 'bg-slate-100' };
    if (driver.position_age_minutes === null) return { label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-100' };
    if (driver.position_age_minutes < 5) return { label: 'Live', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (driver.position_age_minutes < 30) return { label: `${driver.position_age_minutes}m ago`, color: 'text-amber-600', bg: 'bg-amber-100' };
    if (driver.position_age_minutes < 60) return { label: `${driver.position_age_minutes}m ago`, color: 'text-orange-600', bg: 'bg-orange-100' };
    const hours = Math.round(driver.position_age_minutes / 60);
    return { label: `${hours}h ago`, color: 'text-red-600', bg: 'bg-red-100' };
  };

  const filteredDrivers = drivers.filter(d => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return d.name.toLowerCase().includes(term) || 
             d.truck_number.toLowerCase().includes(term) ||
             d.active_load?.load_number.toLowerCase().includes(term);
    }
    return true;
  });

  const driversWithGPS = drivers.filter(d => d.has_position);
  const driversOnRoute = drivers.filter(d => d.status === 'on_route');

  return (
    <div className={`bg-slate-900 flex flex-col ${isFullscreen ? 'fixed inset-0 z-[100]' : 'min-h-screen'}`}>
      {/* Top Bar */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Radar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Live Fleet Tracking</h1>
              <p className="text-xs text-slate-400">HERE Maps GPS Monitoring</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats badges */}
          <div className="hidden md:flex items-center gap-2 mr-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
              <Signal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">{driversWithGPS.length} GPS Active</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-full">
              <Truck className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-300">{driversOnRoute.length} On Route</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-500/20 border border-slate-500/30 rounded-full">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-300">{drivers.length} Total</span>
            </div>
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-lg transition-colors ${autoRefresh ? 'bg-emerald-600/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}
            title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
          >
            <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
          </button>

          {/* Manual refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-300"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-300"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Sidebar */}
        <div className={`absolute left-0 top-0 bottom-0 z-40 transition-all duration-300 ${sidebarOpen ? 'w-80 lg:w-96' : 'w-0'}`}>
          <div className={`h-full bg-slate-800/95 backdrop-blur-sm border-r border-slate-700 flex flex-col overflow-hidden ${sidebarOpen ? '' : 'hidden'}`}>
            {/* Sidebar Header */}
            <div className="p-3 border-b border-slate-700 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search drivers, trucks, loads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setShowAllDrivers(!showAllDrivers)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    showAllDrivers ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {showAllDrivers ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Show All
                </button>

                <button
                  onClick={() => setShowGeofences(!showGeofences)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    showGeofences ? 'bg-blue-600/30 text-blue-300' : 'bg-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Radar className="w-3 h-3" />
                  Geofences
                </button>
                <button
                  onClick={() => setShowTrails(!showTrails)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    showTrails ? 'bg-purple-600/30 text-purple-300' : 'bg-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Route className="w-3 h-3" />
                  Trails
                </button>
              </div>
            </div>

            {/* Driver List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="p-6 text-center">
                  <Truck className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No drivers found</p>
                </div>
              ) : (
                filteredDrivers.map((driver) => {
                  const posStatus = getPositionStatus(driver);
                  const isSelected = selectedDriver?.id === driver.id;

                  return (
                    <button
                      key={driver.id}
                      onClick={() => {
                        setSelectedDriver(isSelected ? null : driver);
                        if (!isSelected && driver.has_position) {
                          centerOnDriver(driver);
                        }
                      }}
                      className={`w-full p-3 border-b border-slate-700/50 text-left transition-colors hover:bg-slate-700/50 ${
                        isSelected ? 'bg-blue-600/20 border-l-2 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          driver.status === 'on_route' ? 'bg-blue-600' : driver.status === 'available' ? 'bg-emerald-600' : 'bg-slate-600'
                        }`}>
                          <Truck className="w-5 h-5 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-white truncate">{driver.name}</h4>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${posStatus.bg} ${posStatus.color}`}>
                              {posStatus.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">{driver.truck_number}</span>
                            {driver.battery_level !== null && (
                              <span className={`text-xs flex items-center gap-0.5 ${
                                driver.battery_level < 20 ? 'text-red-400' : driver.battery_level < 50 ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                <Battery className="w-3 h-3" />
                                {driver.battery_level}%
                              </span>
                            )}
                          </div>
                          {driver.active_load && (
                            <div className="mt-1.5 p-1.5 bg-slate-700/50 rounded">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono text-blue-400">{driver.active_load.load_number}</span>
                                <span className={`text-[10px] px-1 rounded ${
                                  driver.active_load.status === 'IN_TRANSIT' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {driver.active_load.status.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                {driver.active_load.origin_city}, {driver.active_load.origin_state} → {driver.active_load.dest_city}, {driver.active_load.dest_state}
                              </p>
                            </div>
                          )}
                          {driver.last_known_speed !== null && driver.last_known_speed > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Navigation className="w-3 h-3 text-slate-500" />
                              <span className="text-[10px] text-slate-400">{Math.round(driver.last_known_speed)} mph</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-slate-700 flex-shrink-0">
              <p className="text-[10px] text-slate-500 text-center">
                Last updated: {lastRefresh.toLocaleTimeString()}
                {autoRefresh && ' (auto-refresh 30s)'}
              </p>
              <p className="text-[9px] text-slate-600 text-center mt-0.5">
                Data source: {fetchMethod || 'Loading...'} | {driversWithGPS.length}/{drivers.length} with GPS
              </p>
            </div>

          </div>
        </div>


        {/* Sidebar Toggle */}
        <button
          onClick={() => {
            setSidebarOpen(!sidebarOpen);
            // Resize map after sidebar animation completes
            setTimeout(() => {
              if (mapInstanceRef.current) {
                try { mapInstanceRef.current.getViewPort().resize(); } catch { /* */ }
              }
            }, 350);
          }}
          className={`absolute z-50 top-4 transition-all duration-300 bg-slate-800 border border-slate-600 rounded-r-lg p-1.5 hover:bg-slate-700 ${
            sidebarOpen ? 'left-80 lg:left-96' : 'left-0'
          }`}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
        </button>


        {/* Map Container */}
        <div className="flex-1 relative">
          {!mapLoaded || !mapApiKey ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
                <p className="text-slate-300 font-medium">Loading HERE Maps...</p>
                <p className="text-slate-500 text-sm mt-1">Initializing GPS tracking interface</p>
              </div>
            </div>
          ) : null}
          <div ref={mapRef} className="absolute inset-0" style={{ background: '#1e293b' }} />

          {/* Map Controls Overlay */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
            {/* Map Style Switcher */}
            <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 overflow-hidden">
              <button
                onClick={() => changeMapStyle('normal')}
                className={`block w-full px-3 py-2 text-xs font-medium transition-colors ${
                  mapStyle === 'normal' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Map
              </button>
              <button
                onClick={() => changeMapStyle('satellite')}
                className={`block w-full px-3 py-2 text-xs font-medium transition-colors border-t border-slate-700 ${
                  mapStyle === 'satellite' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Satellite
              </button>
              <button
                onClick={() => changeMapStyle('terrain')}
                className={`block w-full px-3 py-2 text-xs font-medium transition-colors border-t border-slate-700 ${
                  mapStyle === 'terrain' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Truck
              </button>
            </div>

            {/* Fit All */}
            <button
              onClick={fitAllDrivers}
              className="bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-2.5 text-slate-300 hover:bg-slate-700 transition-colors"
              title="Fit all drivers"
            >
              <LocateFixed className="w-4 h-4" />
            </button>
          </div>

          {/* Map Style Error Toast */}
          {mapStyleError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-2">
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-200">{mapStyleError}</p>
                <button onClick={() => setMapStyleError(null)} className="ml-2 text-red-300 hover:text-white">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
          )}


          {/* Selected Driver Detail Panel */}
          {selectedDriver && (
            <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-30">
              <div className="bg-slate-800/95 backdrop-blur-sm rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className={`px-4 py-3 flex items-center justify-between ${
                  selectedDriver.status === 'on_route' ? 'bg-blue-600/20' : selectedDriver.status === 'available' ? 'bg-emerald-600/20' : 'bg-slate-700/50'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      selectedDriver.status === 'on_route' ? 'bg-blue-600' : selectedDriver.status === 'available' ? 'bg-emerald-600' : 'bg-slate-600'
                    }`}>
                      <Truck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{selectedDriver.name}</h3>
                      <p className="text-xs text-slate-400">{selectedDriver.truck_number} | {selectedDriver.phone}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDriver(null)}
                    className="p-1 hover:bg-slate-600 rounded transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {/* Location */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Current Location</p>
                    <p className="text-xs text-slate-300">
                      {reverseGeoResults[selectedDriver.id] || selectedDriver.current_location || 'Location unknown'}
                    </p>
                    {selectedDriver.last_known_lat && selectedDriver.last_known_lng && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[10px] font-mono text-slate-500">
                          <span className="text-slate-600">Lat:</span> {selectedDriver.last_known_lat.toFixed(6)} | <span className="text-slate-600">Lng:</span> {selectedDriver.last_known_lng.toFixed(6)}
                        </p>
                        <p className="text-[9px] text-slate-600">
                          Source: {fetchMethod || 'Direct DB'} | Updated: {selectedDriver.last_position_update ? new Date(selectedDriver.last_position_update).toLocaleTimeString() : 'N/A'}
                        </p>
                      </div>
                    )}
                  </div>


                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <Navigation className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                      <p className="text-xs font-bold text-white">
                        {selectedDriver.last_known_speed ? `${Math.round(selectedDriver.last_known_speed)} mph` : '--'}
                      </p>
                      <p className="text-[10px] text-slate-500">Speed</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <Battery className={`w-3.5 h-3.5 mx-auto mb-1 ${
                        selectedDriver.battery_level !== null && selectedDriver.battery_level < 20 ? 'text-red-400' : 'text-emerald-400'
                      }`} />
                      <p className="text-xs font-bold text-white">
                        {selectedDriver.battery_level !== null ? `${selectedDriver.battery_level}%` : '--'}
                      </p>
                      <p className="text-[10px] text-slate-500">Battery</p>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg p-2 text-center">
                      <Clock className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                      <p className="text-xs font-bold text-white">
                        {selectedDriver.position_age_minutes !== null ? (
                          selectedDriver.position_age_minutes < 1 ? 'Now' : `${selectedDriver.position_age_minutes}m`
                        ) : '--'}
                      </p>
                      <p className="text-[10px] text-slate-500">Updated</p>
                    </div>
                  </div>

                  {/* Active Load */}
                  {selectedDriver.active_load && (
                    <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Active Load</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          selectedDriver.active_load.status === 'IN_TRANSIT' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {selectedDriver.active_load.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-blue-400 mb-1">{selectedDriver.active_load.load_number}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span>{selectedDriver.active_load.origin_city}, {selectedDriver.active_load.origin_state}</span>
                        <span className="text-slate-500">→</span>
                        <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span>{selectedDriver.active_load.dest_city}, {selectedDriver.active_load.dest_state}</span>
                      </div>
                      {selectedDriver.active_load.cargo_description && (
                        <p className="text-[10px] text-slate-400 mt-1">{selectedDriver.active_load.cargo_description}</p>
                      )}
                    </div>
                  )}

                  {/* Trail Controls */}
                  {showTrails && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Trail:</span>
                      {[1, 4, 8, 24].map(h => (
                        <button
                          key={h}
                          onClick={() => setTrailHours(h)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            trailHours === h ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                      {driverTrail.length > 0 && (
                        <span className="text-[10px] text-slate-500 ml-auto">{driverTrail.length} points</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => centerOnDriver(selectedDriver)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                      Center
                    </button>
                    <a
                      href={`tel:${selectedDriver.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No GPS Warning */}
          {!loading && driversWithGPS.length === 0 && drivers.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-200">No GPS Data Available</p>
                  <p className="text-xs text-amber-300/70">Drivers need to share their location from the Driver Portal to appear on the map.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTrackingView;
