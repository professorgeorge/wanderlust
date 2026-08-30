/**
 * Weather Service — The Wandering Layer
 * Real-time atmospheric conditions & predictive en-route weather forecasts.
 * Powered by Open-Meteo High-Resolution Global Weather API.
 * 100% Free forever ($0.00), zero API keys, privacy-first.
 */

export class WeatherService {
  constructor() {
    this.lastWeatherFetch = null;
    this.currentWeather = null;
    this.lastCoords = null;
    this.cacheExpiryMs = 10 * 60 * 1000; // 10 minutes cache
    this.activeHazards = [];
  }

  /**
   * Convert WMO Weather Interpretation Code to human label & icon
   * Standard WMO Code Table 4677
   */
  getWmoDetails(code, isDay = 1) {
    const table = {
      0: { label: isDay ? 'Clear Sky' : 'Clear Night', icon: isDay ? '☀️' : '🌙', severity: 'clear' },
      1: { label: 'Mainly Clear', icon: isDay ? '🌤️' : '🌤️', severity: 'clear' },
      2: { label: 'Partly Cloudy', icon: '⛅', severity: 'cloudy' },
      3: { label: 'Overcast', icon: '☁️', severity: 'cloudy' },
      45: { label: 'Foggy', icon: '🌫️', severity: 'fog' },
      48: { label: 'Depositing Rime Fog', icon: '🌫️', severity: 'fog' },
      51: { label: 'Light Drizzle', icon: '🌦️', severity: 'rain_light' },
      53: { label: 'Moderate Drizzle', icon: '🌦️', severity: 'rain_light' },
      55: { label: 'Dense Drizzle', icon: '🌧️', severity: 'rain_mod' },
      56: { label: 'Light Freezing Drizzle', icon: '🌨️', severity: 'freezing' },
      57: { label: 'Dense Freezing Drizzle', icon: '🌨️', severity: 'freezing' },
      61: { label: 'Slight Rain', icon: '🌧️', severity: 'rain_light' },
      63: { label: 'Moderate Rain', icon: '🌧️', severity: 'rain_mod' },
      65: { label: 'Heavy Rain', icon: '🌧️', severity: 'rain_heavy' },
      66: { label: 'Light Freezing Rain', icon: '🌨️', severity: 'freezing' },
      67: { label: 'Heavy Freezing Rain', icon: '🌨️', severity: 'freezing' },
      71: { label: 'Slight Snow Fall', icon: '❄️', severity: 'snow' },
      73: { label: 'Moderate Snow Fall', icon: '❄️', severity: 'snow' },
      75: { label: 'Heavy Snow Fall', icon: '❄️', severity: 'snow' },
      77: { label: 'Snow Grains', icon: '❄️', severity: 'snow' },
      80: { label: 'Slight Rain Showers', icon: '🌦️', severity: 'rain_light' },
      81: { label: 'Moderate Rain Showers', icon: '🌧️', severity: 'rain_mod' },
      82: { label: 'Violent Rain Showers', icon: '⛈️', severity: 'rain_heavy' },
      85: { label: 'Slight Snow Showers', icon: '🌨️', severity: 'snow' },
      86: { label: 'Heavy Snow Showers', icon: '🌨️', severity: 'snow' },
      95: { label: 'Thunderstorm', icon: '⛈️', severity: 'storm' },
      96: { label: 'Thunderstorm with Slight Hail', icon: '⛈️', severity: 'storm' },
      99: { label: 'Thunderstorm with Heavy Hail', icon: '⛈️', severity: 'storm' }
    };

    return table[code] || { label: 'Fair Weather', icon: isDay ? '☀️' : '🌙', severity: 'clear' };
  }

  /**
   * Fetch current real-time weather at coordinates
   */
  async getCurrentWeather(lat, lng, unitSystem = 'imperial') {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

    // Return cached if within 10 minutes and within 5km
    const now = Date.now();
    if (this.currentWeather && this.lastCoords &&
        (now - this.lastWeatherFetch < this.cacheExpiryMs) &&
        this.calcDistMeters(lat, lng, this.lastCoords.lat, this.lastCoords.lng) < 5000) {
      return this.currentWeather;
    }

    const tempUnit = unitSystem === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unitSystem === 'imperial' ? 'mph' : 'kmh';
    const precipUnit = unitSystem === 'imperial' ? 'inch' : 'mm';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,visibility&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();

      const curr = data.current;
      if (!curr) return null;

      const wmo = this.getWmoDetails(curr.weather_code, curr.is_day);
      const tempSymbol = unitSystem === 'imperial' ? '°F' : '°C';
      const speedSymbol = unitSystem === 'imperial' ? 'mph' : 'km/h';

      const weatherObj = {
        temp: Math.round(curr.temperature_2m),
        feelsLike: Math.round(curr.apparent_temperature),
        tempDisplay: `${Math.round(curr.temperature_2m)}${tempSymbol}`,
        feelsLikeDisplay: `${Math.round(curr.apparent_temperature)}${tempSymbol}`,
        wmoCode: curr.weather_code,
        condition: wmo.label,
        icon: wmo.icon,
        severity: wmo.severity,
        isDay: curr.is_day === 1,
        windSpeed: Math.round(curr.wind_speed_10m),
        windGusts: Math.round(curr.wind_gusts_10m || curr.wind_speed_10m),
        windDisplay: `${Math.round(curr.wind_speed_10m)} ${speedSymbol}`,
        visibilityMeters: curr.visibility || 10000,
        precipitation: curr.precipitation || 0,
        rain: curr.rain || 0,
        hazards: this.evaluateHazards(curr, wmo, unitSystem),
        timestamp: Date.now()
      };

      this.currentWeather = weatherObj;
      this.lastCoords = { lat, lng };
      this.lastWeatherFetch = now;
      return weatherObj;
    } catch (e) {
      console.warn('Weather fetch error:', e);
      return null;
    }
  }

  /**
   * Predictive Route Weather Forecasting
   * Samples 3–4 checkpoints along the route and computes weather at estimated time of arrival (ETA)
   */
  async getRouteWeatherForecast(routeLatLngs, totalDurationMinutes, unitSystem = 'imperial') {
    if (!routeLatLngs || routeLatLngs.length < 2) return [];

    const tempUnit = unitSystem === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = unitSystem === 'imperial' ? 'mph' : 'kmh';
    const precipUnit = unitSystem === 'imperial' ? 'inch' : 'mm';
    const tempSymbol = unitSystem === 'imperial' ? '°F' : '°C';

    // 4 Checkpoints: Start (0%), Corridor Mid 1 (33%), Corridor Mid 2 (66%), Destination (100%)
    const checkpoints = [
      { label: 'Departure', ratio: 0.05, etaMinutes: 0 },
      { label: 'Mid-Route (1/3)', ratio: 0.35, etaMinutes: Math.round(totalDurationMinutes * 0.35) },
      { label: 'Mid-Route (2/3)', ratio: 0.70, etaMinutes: Math.round(totalDurationMinutes * 0.70) },
      { label: 'Arrival', ratio: 0.98, etaMinutes: totalDurationMinutes }
    ];

    const currentHourIndex = new Date().getHours();

    const fetchPromises = checkpoints.map(async (cp) => {
      const idx = Math.floor(cp.ratio * (routeLatLngs.length - 1));
      const pt = routeLatLngs[idx];
      if (!pt) return null;

      const etaHoursAhead = Math.max(0, Math.round(cp.etaMinutes / 60));
      const targetHourIndex = Math.min(23, currentHourIndex + etaHoursAhead);

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt[0].toFixed(4)}&longitude=${pt[1].toFixed(4)}&current=temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,visibility&hourly=temperature_2m,precipitation_probability,weather_code,visibility&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&precipitation_unit=${precipUnit}&forecast_hours=12`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const data = await res.json();

        let temp = Math.round(data.current?.temperature_2m || 70);
        let code = data.current?.weather_code || 0;
        let precipProb = 0;
        let vis = data.current?.visibility || 10000;

        if (data.hourly && data.hourly.temperature_2m && data.hourly.temperature_2m[targetHourIndex] !== undefined) {
          temp = Math.round(data.hourly.temperature_2m[targetHourIndex]);
          code = data.hourly.weather_code ? data.hourly.weather_code[targetHourIndex] : code;
          precipProb = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[targetHourIndex] : 0;
          vis = data.hourly.visibility ? data.hourly.visibility[targetHourIndex] : vis;
        }

        const isDayTime = (currentHourIndex + etaHoursAhead >= 6 && currentHourIndex + etaHoursAhead <= 20) ? 1 : 0;
        const wmo = this.getWmoDetails(code, isDayTime);

        let hazardNote = null;
        if (vis < 1500) hazardNote = '🌫️ Mountain Fog / Low Visibility';
        else if (wmo.severity === 'storm' || precipProb > 65) hazardNote = '⛈️ Heavy Rain / Storm Chance';
        else if (wmo.severity === 'snow') hazardNote = '❄️ Snowfall Expected';
        else if (temp <= (unitSystem === 'imperial' ? 32 : 0)) hazardNote = '🧊 Freezing Conditions';

        return {
          label: cp.label,
          etaMinutes: cp.etaMinutes,
          etaDisplay: cp.etaMinutes === 0 ? 'Now' : `+${cp.etaMinutes}m ETA`,
          lat: pt[0],
          lng: pt[1],
          temp: temp,
          tempDisplay: `${temp}${tempSymbol}`,
          condition: wmo.label,
          icon: wmo.icon,
          precipProb: precipProb,
          hazardNote: hazardNote
        };
      } catch (e) {
        return null;
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
  }

  /**
   * Evaluate active driving hazards
   */
  evaluateHazards(curr, wmo, unitSystem) {
    const hazards = [];
    const isImperial = unitSystem === 'imperial';

    // 1. Fog / Low Visibility
    if (curr.visibility && curr.visibility < 1200) {
      hazards.push({
        type: 'fog',
        icon: '🌫️',
        level: 'warning',
        title: 'Dense Fog Warning',
        text: 'Visibility reduced under 1.2 km. Maintain safe driving distance.'
      });
    }

    // 2. Heavy Rain / Thunderstorms
    if (wmo.severity === 'storm' || (curr.rain && curr.rain > 3)) {
      hazards.push({
        type: 'storm',
        icon: '⛈️',
        level: 'danger',
        title: 'Severe Rain & Thunderstorm',
        text: 'Wet road surfaces and reduced tire traction along this stretch.'
      });
    }

    // 3. High Winds
    const windSpeed = curr.wind_speed_10m || 0;
    const windGusts = curr.wind_gusts_10m || windSpeed;
    const highWindThreshold = isImperial ? 28 : 45;
    if (windGusts > highWindThreshold) {
      hazards.push({
        type: 'wind',
        icon: '💨',
        level: 'warning',
        title: 'High Crosswinds',
        text: `Gusts up to ${Math.round(windGusts)} ${isImperial ? 'mph' : 'km/h'}. Exercise caution on bridges and open bluffs.`
      });
    }

    // 4. Freezing Temps
    const temp = curr.temperature_2m;
    const freezeLimit = isImperial ? 32 : 0;
    if (temp <= freezeLimit && (curr.precipitation > 0 || wmo.severity === 'snow' || wmo.severity === 'freezing')) {
      hazards.push({
        type: 'ice',
        icon: '❄️',
        level: 'danger',
        title: 'Freezing / Black Ice Risk',
        text: 'Sub-freezing road temperatures with moisture.'
      });
    }

    return hazards;
  }

  calcDistMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
