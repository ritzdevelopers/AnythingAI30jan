/**
 * Simple realtime weather lookup using Open-Meteo (no API key required).
 */

export type WeatherResult = {
  location: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    humidityPercent: number | null;
    precipitationMm: number | null;
    windSpeedKph: number | null;
  };
};

const WEATHER_KEYWORDS = /\b(weather|temperature|forecast|humidity|wind|rain)\b/i;

function extractLocation(message: string): string | null {
  const inMatch = message.match(/\b(?:in|at)\s+([^?.!]+)$/i);
  if (inMatch?.[1]) return inMatch[1].trim();
  return null;
}

async function geocodeLocation(name: string): Promise<{ name: string; latitude: number; longitude: number; timezone: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number; timezone: string }> };
  const top = data.results?.[0];
  if (!top) return null;
  return { name: top.name, latitude: top.latitude, longitude: top.longitude, timezone: top.timezone };
}

async function fetchWeather(lat: number, lon: number, timezone: string): Promise<WeatherResult['current'] | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m` +
    `&timezone=${encodeURIComponent(timezone)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const current = data?.current;
  if (!current) return null;
  return {
    time: current.time,
    temperatureC: current.temperature_2m ?? null,
    apparentTemperatureC: current.apparent_temperature ?? null,
    humidityPercent: current.relative_humidity_2m ?? null,
    precipitationMm: current.precipitation ?? null,
    windSpeedKph: current.wind_speed_10m ?? null,
  };
}

export async function getWeatherData(message: string): Promise<WeatherResult | null> {
  if (!WEATHER_KEYWORDS.test(message)) return null;
  const location = extractLocation(message);
  if (!location) return null;

  const geo = await geocodeLocation(location);
  if (!geo) return null;

  const current = await fetchWeather(geo.latitude, geo.longitude, geo.timezone);
  if (!current) return null;

  return {
    location: geo.name,
    latitude: geo.latitude,
    longitude: geo.longitude,
    timezone: geo.timezone,
    current,
  };
}

export async function getWeatherContext(message: string): Promise<string | null> {
  const data = await getWeatherData(message);
  if (!data) return null;

  const parts = [
    `Location: ${data.location}`,
    `Time: ${data.current.time} (${data.timezone})`,
    data.current.temperatureC != null ? `Temperature: ${data.current.temperatureC}°C` : null,
    data.current.apparentTemperatureC != null ? `Feels like: ${data.current.apparentTemperatureC}°C` : null,
    data.current.humidityPercent != null ? `Humidity: ${data.current.humidityPercent}%` : null,
    data.current.precipitationMm != null ? `Precipitation: ${data.current.precipitationMm} mm` : null,
    data.current.windSpeedKph != null ? `Wind: ${data.current.windSpeedKph} km/h` : null,
  ].filter(Boolean);

  return `Realtime weather data:\\n${parts.join('\\n')}`;
}
