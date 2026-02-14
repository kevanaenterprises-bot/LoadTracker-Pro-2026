import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/supabaseCompat';
import { HistoricalMarker } from '@/types/tms';

import { Landmark, Volume2, VolumeX, Loader2, MapPin, BookOpen, Clock, X, ChevronDown, ChevronUp } from 'lucide-react';

interface HistoryTourSectionProps {
  driverId: string | null;
  gpsPosition: { lat: number; lng: number } | null;
  gpsTracking: boolean;
}

// Haversine distance in meters
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function metersToYards(meters: number): number {
  return meters * 1.09361;
}

const HistoryTourSection: React.FC<HistoryTourSectionProps> = ({ driverId, gpsPosition, gpsTracking }) => {
  const [tourEnabled, setTourEnabled] = useState(false);
  const [currentMarker, setCurrentMarker] = useState<HistoricalMarker | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [heardMarkerIds, setHeardMarkerIds] = useState<Set<string>>(new Set());
  const [markersFound, setMarkersFound] = useState(0);
  const [showDetails, setShowDetails] = useState(true);
  const [lastCheckPosition, setLastCheckPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyMarker, setNearbyMarker] = useState<HistoricalMarker | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingRef = useRef(false);

  // Load heard markers from DB on mount
  useEffect(() => {
    if (!driverId) return;
    const loadHeardMarkers = async () => {
      try {
        const { data } = await db
          .from('driver_marker_history')
          .select('marker_id')
          .eq('driver_id', driverId);
        if (data) {
          setHeardMarkerIds(new Set(data.map(d => d.marker_id)));
        }
      } catch (err) {
        console.error('Failed to load marker history:', err);
      }
    };
    loadHeardMarkers();
  }, [driverId]);

  // Check for nearby markers
  const checkNearbyMarkers = useCallback(async () => {
    if (!gpsPosition || !tourEnabled || isCheckingRef.current || isNarrating) return;
    
    // Don't re-check if we haven't moved significantly (at least 10 meters)
    if (lastCheckPosition) {
      const moved = haversineDistance(lastCheckPosition.lat, lastCheckPosition.lng, gpsPosition.lat, gpsPosition.lng);
      if (moved < 10) return;
    }

    isCheckingRef.current = true;
    setLastCheckPosition({ lat: gpsPosition.lat, lng: gpsPosition.lng });

    try {
      // Query markers within a bounding box (~500m in each direction for efficiency)
      const latDelta = 0.005; // ~555m
      const lngDelta = 0.006; // ~555m at mid-latitudes
      
      const { data: markers, error } = await db
        .from('historical_markers')
        .select('*')
        .gte('latitude', gpsPosition.lat - latDelta)
        .lte('latitude', gpsPosition.lat + latDelta)
        .gte('longitude', gpsPosition.lng - lngDelta)
        .lte('longitude', gpsPosition.lng + lngDelta);

      if (error || !markers || markers.length === 0) {
        isCheckingRef.current = false;
        return;
      }

      // Calculate exact distances and find markers within 50 yards (45.72 meters)
      const RADIUS_METERS = 45.72; // 50 yards
      
      for (const marker of markers) {
        const distance = haversineDistance(gpsPosition.lat, gpsPosition.lng, marker.latitude, marker.longitude);
        
        if (distance <= RADIUS_METERS && !heardMarkerIds.has(marker.id)) {
          // Found a new marker within range!
          const markerWithDistance = { ...marker, distance_meters: distance };
          setNearbyMarker(markerWithDistance);
          setMarkersFound(prev => prev + 1);
          
          // Auto-narrate
          await narrateMarker(markerWithDistance);
          break; // Only narrate one at a time
        }
      }
    } catch (err) {
      console.error('Error checking nearby markers:', err);
    } finally {
      isCheckingRef.current = false;
    }
  }, [gpsPosition, tourEnabled, isNarrating, lastCheckPosition, heardMarkerIds]);

  // Set up proximity check interval
  useEffect(() => {
    if (tourEnabled && gpsTracking) {
      // Check every 5 seconds
      checkIntervalRef.current = setInterval(() => {
        checkNearbyMarkers();
      }, 5000);
      
      // Also check immediately
      checkNearbyMarkers();
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [tourEnabled, gpsTracking, checkNearbyMarkers]);

  // Narrate a marker
  const narrateMarker = async (marker: HistoricalMarker) => {
    if (isNarrating || isLoadingAudio) return;
    
    setIsLoadingAudio(true);
    setCurrentMarker(marker);
    setAudioError(null);
    setShowDetails(true);

    try {
      const distanceYards = marker.distance_meters ? metersToYards(marker.distance_meters) : undefined;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/narrate-marker`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            title: marker.title,
            subtitle: marker.subtitle,
            description: marker.description,
            city: marker.city,
            state: marker.state,
            year_erected: marker.year_erected,
            erected_by: marker.erected_by,
            distance_yards: distanceYards,
          }),
        }
      );


      if (!response.ok) {
        const errText = await response.text();
        console.error('Narration API error:', errText);
        setAudioError('Failed to generate narration. Will retry on next approach.');
        setIsLoadingAudio(false);
        return;
      }

      const audioBlob = await response.blob();
      
      // Clean up previous audio URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      const url = URL.createObjectURL(audioBlob);
      audioUrlRef.current = url;

      // Create and play audio
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setIsNarrating(true);
        setIsLoadingAudio(false);
      };
      
      audio.onended = () => {
        setIsNarrating(false);
        // Mark as heard
        markMarkerAsHeard(marker);
      };
      
      audio.onerror = () => {
        setIsNarrating(false);
        setIsLoadingAudio(false);
        setAudioError('Audio playback failed. Check your device volume.');
      };

      await audio.play();
    } catch (err) {
      console.error('Error narrating marker:', err);
      setAudioError('Failed to generate narration.');
      setIsLoadingAudio(false);
    }
  };

  // Mark marker as heard
  const markMarkerAsHeard = async (marker: HistoricalMarker) => {
    setHeardMarkerIds(prev => new Set([...prev, marker.id]));
    
    if (driverId) {
      try {
        await db.from('driver_marker_history').upsert({
          driver_id: driverId,
          marker_id: marker.id,
          heard_at: new Date().toISOString(),
        }, { onConflict: 'driver_id,marker_id' });
      } catch (err) {
        console.error('Failed to save marker history:', err);
      }
    }
  };

  // Stop narration
  const stopNarration = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsNarrating(false);
    setIsLoadingAudio(false);
    if (currentMarker) {
      markMarkerAsHeard(currentMarker);
    }
  };

  // Replay current marker
  const replayMarker = () => {
    if (currentMarker && !isNarrating && !isLoadingAudio) {
      // Remove from heard so it can be narrated again
      setHeardMarkerIds(prev => {
        const next = new Set(prev);
        next.delete(currentMarker.id);
        return next;
      });
      narrateMarker(currentMarker);
    }
  };

  // Toggle tour
  const handleToggleTour = () => {
    if (tourEnabled) {
      // Turning off
      stopNarration();
      setCurrentMarker(null);
      setNearbyMarker(null);
      setAudioError(null);
    }
    setTourEnabled(!tourEnabled);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`px-6 py-4 transition-colors ${tourEnabled ? 'bg-gradient-to-r from-amber-500 to-orange-600' : 'bg-gradient-to-r from-slate-700 to-slate-800'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className={`p-2 rounded-lg ${tourEnabled ? 'bg-white/20' : 'bg-white/10'}`}>
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">History Tour</h2>
              <p className="text-xs opacity-80">
                {tourEnabled 
                  ? (isNarrating ? 'Narrating...' : 'Scanning for nearby markers...') 
                  : 'Learn about historical markers as you drive'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleTour}
            disabled={!gpsTracking}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
              tourEnabled ? 'bg-white/30' : 'bg-white/10'
            } ${!gpsTracking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${
              tourEnabled ? 'left-7' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {!gpsTracking && (
          <div className="text-center py-4">
            <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">Enable GPS tracking first to use History Tour</p>
          </div>
        )}

        {gpsTracking && !tourEnabled && (
          <div className="text-center py-4">
            <div className="relative inline-block mb-3">
              <Landmark className="w-12 h-12 text-amber-400" />
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <Volume2 className="w-3 h-3 text-white" />
              </div>
            </div>
            <h3 className="font-semibold text-slate-800 mb-1">Historical Marker Narration</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Turn on History Tour and when you pass within 50 yards of a historical marker, 
              you'll hear a voice narration about its history. There are over 200,000 markers across the US!
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {heardMarkerIds.size} markers heard</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> 50 yard trigger</span>
            </div>
          </div>
        )}

        {gpsTracking && tourEnabled && (
          <div className="space-y-4">
            {/* Status bar */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                  SCANNING
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-500 text-xs">
                <span>{heardMarkerIds.size} heard</span>
                <span>{markersFound} found this trip</span>
              </div>
            </div>

            {/* Audio error */}
            {audioError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                <p className="text-red-700 text-sm">{audioError}</p>
                <button type="button" onClick={() => setAudioError(null)} className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Loading audio */}
            {isLoadingAudio && currentMarker && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                  <div>
                    <p className="font-semibold text-amber-800">Generating narration...</p>
                    <p className="text-amber-600 text-sm">{currentMarker.title}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Currently narrating marker */}
            {isNarrating && currentMarker && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl overflow-hidden">
                <div className="bg-amber-500 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    <span className="text-sm font-semibold">Now Playing</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopNarration}
                    className="text-white/80 hover:text-white transition-colors"
                  >
                    <VolumeX className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-slate-800 text-lg">{currentMarker.title}</h3>
                  {currentMarker.subtitle && (
                    <p className="text-amber-700 text-sm font-medium mt-0.5">{currentMarker.subtitle}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{currentMarker.city}, {currentMarker.state}</span>
                    {currentMarker.distance_meters && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span>{Math.round(metersToYards(currentMarker.distance_meters))} yards away</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="mt-2 text-amber-600 text-xs font-medium flex items-center gap-1 hover:text-amber-700"
                  >
                    {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showDetails ? 'Hide details' : 'Show details'}
                  </button>
                  {showDetails && (
                    <div className="mt-3 pt-3 border-t border-amber-200">
                      <p className="text-slate-700 text-sm leading-relaxed">{currentMarker.description}</p>
                      {(currentMarker.year_erected || currentMarker.erected_by) && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3" />
                          {currentMarker.year_erected && <span>Erected {currentMarker.year_erected}</span>}
                          {currentMarker.erected_by && <span>by {currentMarker.erected_by}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Audio waveform animation */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-center gap-0.5 h-6">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-amber-400 rounded-full animate-pulse"
                        style={{
                          height: `${Math.random() * 20 + 4}px`,
                          animationDelay: `${i * 0.05}s`,
                          animationDuration: `${0.5 + Math.random() * 0.5}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Last heard marker (when not currently narrating) */}
            {!isNarrating && !isLoadingAudio && currentMarker && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Last Marker</span>
                  <button
                    type="button"
                    onClick={replayMarker}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Replay
                  </button>
                </div>
                <h3 className="font-semibold text-slate-700">{currentMarker.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{currentMarker.city}, {currentMarker.state}</p>
              </div>
            )}

            {/* No markers found yet */}
            {!currentMarker && !isLoadingAudio && (
              <div className="text-center py-6 bg-slate-50 rounded-xl">
                <div className="relative inline-block mb-3">
                  <Landmark className="w-10 h-10 text-slate-300" />
                  <div className="absolute -bottom-1 -right-1">
                    <div className="w-4 h-4 bg-amber-400 rounded-full animate-ping opacity-75"></div>
                    <div className="absolute inset-0 w-4 h-4 bg-amber-500 rounded-full"></div>
                  </div>
                </div>
                <p className="text-slate-500 text-sm font-medium">Listening for nearby markers...</p>
                <p className="text-slate-400 text-xs mt-1">
                  You'll hear a narration when you pass within 50 yards of a historical marker
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryTourSection;
