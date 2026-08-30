/**
 * GPS & Route Simulation Service
 * Handles live browser Geolocation, speed-adaptive lookahead horizons,
 * forward heading cone filtering, and built-in Scenic Driving Routes for simulation.
 */
export class GpsService {
  constructor() {
    this.watchId = null;
    this.currentPosition = null;
    this.previousPosition = null;
    this.heading = 0; // degrees (0 = North, 90 = East, 180 = South, 270 = West)
    this.speed = 0; // km/h
    this.isSimulating = false;
    this.simTimer = null;
    this.simIndex = 0;
    this.simSpeedMultiplier = 3; // default 3x speed for demo
    this.simRoutePoints = [];
    this.onLocationUpdate = null;
  }

  /**
   * Start tracking live hardware GPS
   */
  startLiveTracking() {
    this.stopSimulation();
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return false;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        this.updatePosition(latitude, longitude, heading, speed, false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000
      }
    );

    return true;
  }

  stopLiveTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Start simulated driving along any custom route polyline / waypoints
   * @param {Array} routeLatLngs - Array of [lat, lng] or {lat, lng} points
   */
  startSimulation(routeLatLngs) {
    this.stopLiveTracking();
    this.stopSimulation();

    if (!routeLatLngs || routeLatLngs.length < 2) {
      console.warn('Simulation requires at least 2 coordinate points');
      return false;
    }

    // Standardize input points to {lat, lng}
    const waypoints = routeLatLngs.map(pt => {
      if (Array.isArray(pt)) return { lat: pt[0], lng: pt[1] };
      return { lat: pt.lat, lng: pt.lng };
    });

    this.simRoutePoints = waypoints;
    this.isSimulating = true;
    this.simIndex = 0;

    // Generate interpolated points between polyline vertices for smooth vehicular motion
    const interpolatedRoute = this.generateSmoothRoute(waypoints);
    let currentStep = 0;

    // Trigger first position update immediately
    if (interpolatedRoute.length > 0) {
      const firstPt = interpolatedRoute[0];
      const secondPt = interpolatedRoute[1] || firstPt;
      const initialHeading = this.calculateBearing(firstPt.lat, firstPt.lng, secondPt.lat, secondPt.lng);
      this.updatePosition(firstPt.lat, firstPt.lng, initialHeading, 70, true);
    }

    this.simTimer = setInterval(() => {
      if (currentStep >= interpolatedRoute.length) {
        currentStep = 0; // Loop or continuous cruising
      }

      const pt = interpolatedRoute[currentStep];
      const nextPt = interpolatedRoute[(currentStep + 1) % interpolatedRoute.length];
      const calculatedHeading = this.calculateBearing(pt.lat, pt.lng, nextPt.lat, nextPt.lng);

      // Realistic cruising speed of ~75 km/h (47 mph)
      this.updatePosition(pt.lat, pt.lng, calculatedHeading, 75, true);
      currentStep++;
    }, Math.max(500 / this.simSpeedMultiplier, 100));

    return true;
  }

  /**
   * Interpolate between polyline points for ultra-smooth GPS motion
   */
  generateSmoothRoute(waypoints, maxStepMeters = 80) {
    if (!waypoints || waypoints.length === 0) return [];
    if (waypoints.length === 1) return [waypoints[0]];

    const smooth = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      
      const distDeg = Math.hypot(p2.lat - p1.lat, p2.lng - p1.lng);
      const steps = Math.max(1, Math.min(20, Math.round(distDeg * 400)));

      for (let s = 0; s < steps; s++) {
        const ratio = s / steps;
        smooth.push({
          lat: p1.lat + (p2.lat - p1.lat) * ratio,
          lng: p1.lng + (p2.lng - p1.lng) * ratio
        });
      }
    }
    smooth.push(waypoints[waypoints.length - 1]);
    return smooth;
  }

  stopSimulation() {
    this.isSimulating = false;
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  setSpeedMultiplier(mult) {
    this.simSpeedMultiplier = Math.max(1, mult);
    if (this.isSimulating && this.simRoutePoints.length > 0) {
      this.startSimulation(this.simRoutePoints);
    }
  }

  updatePosition(lat, lng, heading = null, speed = 0, isSimulated = false) {
    if (this.currentPosition) {
      this.previousPosition = { ...this.currentPosition };
    }

    let resolvedHeading = heading;
    if (resolvedHeading === null || isNaN(resolvedHeading)) {
      if (this.previousPosition) {
        resolvedHeading = this.calculateBearing(
          this.previousPosition.lat,
          this.previousPosition.lng,
          lat,
          lng
        );
      } else {
        resolvedHeading = 0;
      }
    }

    this.heading = resolvedHeading;
    this.speed = speed ? Math.round(speed * 3.6) : (isSimulated ? 65 : 0); // km/h

    // Calculate speed-adaptive lookahead distance (meters)
    // When driving 100 km/h, look ahead ~2,000m; when slow (20 km/h), look ahead 300m
    const lookaheadMeters = Math.max(300, Math.min(3500, (this.speed / 100) * 2500));
    const lookaheadCoords = this.projectCoordinates(lat, lng, this.heading, lookaheadMeters);

    this.currentPosition = {
      lat,
      lng,
      heading: this.heading,
      speed: this.speed,
      lookaheadLat: lookaheadCoords.lat,
      lookaheadLng: lookaheadCoords.lng,
      lookaheadMeters: lookaheadMeters,
      isSimulated,
      timestamp: Date.now()
    };

    if (this.onLocationUpdate) {
      this.onLocationUpdate(this.currentPosition);
    }
  }

  /**
   * Check if a POI is within the vehicle's forward viewing cone (e.g. ±60°)
   * Prevents alerting for landmarks already passed or on unreachable rear roads
   */
  isInForwardCone(poiLat, poiLng, maxAngleDegrees = 65) {
    if (!this.currentPosition) return true;
    
    // If vehicle is virtually stationary (< 10 km/h), allow 360 degree discovery
    if (this.speed < 10) return true;

    const poiBearing = this.calculateBearing(
      this.currentPosition.lat,
      this.currentPosition.lng,
      poiLat,
      poiLng
    );

    let angleDiff = Math.abs((poiBearing - this.heading + 180) % 360 - 180);
    return angleDiff <= maxAngleDegrees;
  }

  /**
   * Determine whether a POI is on the Driver's Left, Right, or Ahead
   */
  getRelativeDirection(poiLat, poiLng) {
    if (!this.currentPosition) return 'ahead';
    const poiBearing = this.calculateBearing(
      this.currentPosition.lat,
      this.currentPosition.lng,
      poiLat,
      poiLng
    );

    let diff = (poiBearing - this.heading + 360) % 360;
    if (diff > 180) diff -= 360; // range -180 to +180

    if (Math.abs(diff) < 25) return 'straight ahead';
    if (diff >= 25 && diff <= 120) return 'on your right';
    if (diff <= -25 && diff >= -120) return 'on your left';
    return 'behind you';
  }

  /**
   * Project a coordinate given a start point, bearing, and distance in meters
   */
  projectCoordinates(lat, lng, bearingDeg, distanceMeters) {
    const R = 6371e3; // Earth's radius in meters
    const d = distanceMeters / R;
    const brng = bearingDeg * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lng * Math.PI / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
      lat: lat2 * 180 / Math.PI,
      lng: lon2 * 180 / Math.PI
    };
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLambda = toRad(lon2 - lon1);

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    return (toDeg(theta) + 360) % 360;
  }
}
