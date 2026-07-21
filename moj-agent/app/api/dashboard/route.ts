export const dynamic = "force-dynamic";

const DEFAULT_CITY = "Warszawa";
const COUNTRY = "PL";

type GeoPlace = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  type: "node" | "way" | "relation";
};

type NominatimPlace = {
  display_name?: string;
  name?: string;
  importance?: number;
  extratags?: Record<string, string>;
};

const polishQuotes = [
  {
    text: "Miej serce i patrzaj w serce.",
    author: "Adam Mickiewicz",
  },
  {
    text: "Nie czas żałować róż, gdy płoną lasy.",
    author: "Juliusz Słowacki",
  },
  {
    text: "Aby mierzyć drogę przyszłą, trzeba wiedzieć, skąd się wyszło.",
    author: "Cyprian Kamil Norwid",
  },
  {
    text: "Szlachetne zdrowie, nikt się nie dowie, jako smakujesz, aż się zepsujesz.",
    author: "Jan Kochanowski",
  },
  {
    text: "Nic dwa razy się nie zdarza.",
    author: "Wisława Szymborska",
  },
  {
    text: "Tyle wiemy o sobie, ile nas sprawdzono.",
    author: "Wisława Szymborska",
  },
  {
    text: "Być zwyciężonym i nie ulec - to zwycięstwo.",
    author: "Józef Piłsudski",
  },
];

const weatherCodes: Record<number, string> = {
  0: "Słonecznie",
  1: "Prawie bezchmurnie",
  2: "Częściowe zachmurzenie",
  3: "Pochmurno",
  45: "Mgła",
  48: "Mgła osadzająca",
  51: "Lekka mżawka",
  53: "Mżawka",
  55: "Silna mżawka",
  61: "Słaby deszcz",
  63: "Deszcz",
  65: "Silny deszcz",
  71: "Słaby śnieg",
  73: "Śnieg",
  75: "Silny śnieg",
  80: "Przelotny deszcz",
  81: "Przelotny deszcz",
  82: "Ulewa",
  95: "Burza",
  96: "Burza z gradem",
  99: "Silna burza z gradem",
};

function weatherIcon(code: number, night = false) {
  if (code === 0) {
    return night ? "moon" : "sun";
  }

  if ([1, 2].includes(code)) {
    return night ? "moon-cloud" : "sun-cloud";
  }

  if ([3, 45, 48].includes(code)) {
    return night ? "night-cloud" : "cloud";
  }

  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return night ? "night-rain" : "rain";
  }

  if ([71, 73, 75].includes(code)) {
    return night ? "night-snow" : "snow";
  }

  if ([95, 96, 99].includes(code)) {
    return night ? "night-storm" : "storm";
  }

  return night ? "night" : "day";
}

function skyStateFromCloudCover(cloudCover: number | undefined, night = false) {
  if (typeof cloudCover !== "number") {
    return null;
  }

  if (cloudCover <= 20) {
    return {
      icon: night ? "moon" : "sun",
      description: "Słonecznie",
    };
  }

  if (cloudCover <= 60) {
    return {
      icon: night ? "moon-cloud" : "sun-cloud",
      description: "Częściowe zachmurzenie",
    };
  }

  return {
    icon: night ? "night-cloud" : "cloud",
    description: "Pochmurno",
  };
}

function weatherPresentation(
  code: number,
  cloudCover: number | undefined,
  night = false,
) {
  if ([0, 1, 2, 3].includes(code)) {
    const skyState = skyStateFromCloudCover(cloudCover, night);

    if (skyState) {
      return skyState;
    }
  }

  return {
    icon: weatherIcon(code, night),
    description: weatherCodes[code] ?? `Kod ${code}`,
  };
}

function isNightNow(currentTime: string, sunrise?: string, sunset?: string) {
  if (!sunrise || !sunset) {
    return false;
  }

  return currentTime < sunrise || currentTime >= sunset;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout - zewnętrzne API nie odpowiedziało na czas.";
  }

  return error instanceof Error ? error.message : "Nieznany błąd.";
}

async function geocodeCity(city: string): Promise<GeoPlace> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city,
  )}&count=1&language=pl&format=json`;
  const geoResponse = await fetchWithTimeout(geoUrl);

  if (!geoResponse.ok) {
    throw new Error(`Geocoding HTTP ${geoResponse.status}`);
  }

  const geo = (await geoResponse.json()) as {
    results?: Array<GeoPlace>;
  };
  const place = geo.results?.[0];

  if (!place) {
    throw new Error(`Nie znaleziono miasta ${city}.`);
  }

  return place;
}

function normalizeCity(value: string | null) {
  const city = value?.trim() || DEFAULT_CITY;
  return city.slice(0, 80);
}

async function loadWeatherAndForecast(city: string) {
  const place = await geocodeCity(city);
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
    `&longitude=${place.longitude}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m" +
    "&hourly=weather_code,cloud_cover" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset" +
    "&forecast_days=5&timezone=auto";
  const response = await fetchWithTimeout(weatherUrl);

  if (!response.ok) {
    throw new Error(`Pogoda HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    current?: {
      time: string;
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      weather_code: number;
      cloud_cover?: number;
      wind_speed_10m: number;
    };
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      sunrise?: string[];
      sunset?: string[];
    };
    hourly?: {
      time: string[];
      weather_code: number[];
      cloud_cover?: number[];
    };
  };
  const current = data.current;
  const daily = data.daily;
  const hourly = data.hourly;

  if (!current || !daily) {
    throw new Error("Brak danych pogodowych.");
  }

  const currentDayIndex = daily.time.findIndex((date) =>
    current.time.startsWith(date),
  );
  const currentIsNight = isNightNow(
    current.time,
    daily.sunrise?.[currentDayIndex],
    daily.sunset?.[currentDayIndex],
  );
  const currentPresentation = weatherPresentation(
    current.weather_code,
    current.cloud_cover,
    currentIsNight,
  );

  return {
    weather: {
      city: place.name,
      temperature: current.temperature_2m,
      apparent: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      code: current.weather_code,
      cloudCover: current.cloud_cover,
      icon: currentPresentation.icon,
      description: currentPresentation.description,
      isNight: currentIsNight,
      sunrise: daily.sunrise?.[currentDayIndex],
      sunset: daily.sunset?.[currentDayIndex],
      updatedAt: new Date().toISOString(),
      source: "Open-Meteo",
    },
    forecast: {
      city: place.name,
      days: daily.time.map((date, index) => {
        const dailyCode = daily.weather_code[index] ?? 0;
        const dayHourIndex = hourly?.time.indexOf(`${date}T14:00`) ?? -1;
        const nightHourIndex = hourly?.time.indexOf(`${date}T23:00`) ?? -1;
        const dayCode =
          dayHourIndex >= 0 ? hourly?.weather_code[dayHourIndex] ?? dailyCode : dailyCode;
        const nightCode =
          nightHourIndex >= 0
            ? hourly?.weather_code[nightHourIndex] ?? dailyCode
            : dailyCode;
        const dayCloudCover =
          dayHourIndex >= 0 ? hourly?.cloud_cover?.[dayHourIndex] : undefined;
        const nightCloudCover =
          nightHourIndex >= 0 ? hourly?.cloud_cover?.[nightHourIndex] : undefined;
        const dayPresentation = weatherPresentation(dayCode, dayCloudCover);
        const nightPresentation = weatherPresentation(
          nightCode,
          nightCloudCover,
          true,
        );
        const descriptionPresentation = weatherPresentation(
          dailyCode,
          dayCloudCover,
        );

        return {
          date,
          weekday: new Intl.DateTimeFormat("pl-PL", {
            weekday: "short",
            timeZone: "Europe/Warsaw",
          }).format(new Date(`${date}T12:00:00`)),
          dayIcon: dayPresentation.icon,
          nightIcon: nightPresentation.icon,
          dayTemp: daily.temperature_2m_max[index] ?? 0,
          nightTemp: daily.temperature_2m_min[index] ?? 0,
          description: descriptionPresentation.description,
        };
      }),
      updatedAt: new Date().toISOString(),
      source: "Open-Meteo",
    },
  };
}

async function loadCurrency(code: string) {
  const response = await fetchWithTimeout(
    `https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/?format=json`,
  );

  if (!response.ok) {
    throw new Error(`NBP HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    code: string;
    rates?: Array<{ effectiveDate: string; mid: number }>;
  };
  const rate = data.rates?.[0];

  if (!rate) {
    throw new Error(`Brak kursu ${code}.`);
  }

  return {
    code: data.code,
    rate: rate.mid,
    date: rate.effectiveDate,
    updatedAt: new Date().toISOString(),
    source: "NBP",
  };
}

async function loadHolidays() {
  const year = new Date().getFullYear();
  const response = await fetchWithTimeout(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${COUNTRY}`,
  );

  if (!response.ok) {
    throw new Error(`Swieta HTTP ${response.status}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const data = (await response.json()) as Array<{
    date: string;
    localName: string;
  }>;

  return {
    holidays: data
      .map((holiday) => {
        const holidayDate = new Date(`${holiday.date}T00:00:00`);
        return {
          date: holiday.date,
          localName: holiday.localName,
          daysLeft: Math.ceil(
            (holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          ),
        };
      })
      .filter((holiday) => holiday.daysLeft >= 0)
      .slice(0, 4),
    updatedAt: new Date().toISOString(),
    source: "Nager.Date",
  };
}

async function loadQuoteOfTheDay() {
  const day = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
  const quoteIndex =
    Array.from(day).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    polishQuotes.length;
  const quote = polishQuotes[quoteIndex];

  return {
    text: quote.text,
    author: quote.author,
    updatedAt: new Date().toISOString(),
    source: "Polskie cytaty",
  };
}

function restaurantScore(tags: Record<string, string>) {
  let score = 0;

  if (tags.website || tags["contact:website"]) {
    score += 4;
  }

  if (tags.wikidata || tags.wikipedia) {
    score += 3;
  }

  if (tags.cuisine) {
    score += 2;
  }

  if (tags.opening_hours) {
    score += 1;
  }

  return score;
}

function restaurantUrl(name: string, tags: Record<string, string>, city: string) {
  const website = tags.website || tags["contact:website"];

  if (website?.startsWith("http")) {
    return website;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(
    `${name} restauracja ${city}`,
  )}`;
}

async function loadTopRestaurants(city: string) {
  const place = await geocodeCity(city);

  try {
    const latPadding = 0.16;
    const lonPadding = 0.22;
    const left = place.longitude - lonPadding;
    const right = place.longitude + lonPadding;
    const top = place.latitude + latPadding;
    const bottom = place.latitude - latPadding;
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        "restaurant",
      )}&limit=12&addressdetails=0&extratags=1&namedetails=1&bounded=1&viewbox=${left},${top},${right},${bottom}`,
      {
        headers: {
          "user-agent": "MojAgentDashboard/1.0",
        },
      },
      6000,
    );

    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }

    const places = (await response.json()) as NominatimPlace[];
    const restaurants = places
      .map((place) => {
        const tags = place.extratags ?? {};
        const name =
          place.name?.trim() ??
          place.display_name?.split(",")[0]?.trim() ??
          "";

        if (!name) {
          return null;
        }

        return {
          name,
          cuisine: tags.cuisine?.replace(/;/g, ", ") ?? "restauracja",
          url: restaurantUrl(name, tags, city),
          score: place.importance ?? 0,
        };
      })
      .filter((restaurant): restaurant is NonNullable<typeof restaurant> =>
        Boolean(restaurant),
      )
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"))
      .slice(0, 3);

    if (restaurants.length > 0) {
      return {
        city: place.name,
        restaurants,
        updatedAt: new Date().toISOString(),
        source: "OpenStreetMap Nominatim",
        note:
          "Ranking bez dodatkowych kluczy API: realne miejsca z OpenStreetMap, sortowane po trafności/importance; link prowadzi do strony miejsca albo wyszukania Google.",
      };
    }
  } catch {
    // Fall back to Overpass below when Nominatim is unavailable or empty.
  }

  const query = `
    [out:json][timeout:10];
    area["name"="${place.name.replace(/"/g, '\\"')}"]["boundary"="administrative"]->.searchArea;
    (
      node["amenity"="restaurant"]["name"](area.searchArea);
      way["amenity"="restaurant"]["name"](area.searchArea);
      relation["amenity"="restaurant"]["name"](area.searchArea);
    );
    out center tags 60;
  `;
  const response = await fetchWithTimeout(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    {
      headers: {
        "user-agent": "MojAgentDashboard/1.0",
      },
    },
    7000,
  );

  if (!response.ok) {
    throw new Error(`Restauracje HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    elements?: OverpassElement[];
  };
  const restaurants =
    data.elements
      ?.map((element) => {
        const tags = element.tags ?? {};
        const name = tags.name?.trim();

        if (!name) {
          return null;
        }

        return {
          name,
          cuisine: tags.cuisine?.replace(/;/g, ", ") ?? "restauracja",
          url: restaurantUrl(name, tags, city),
          score: restaurantScore(tags),
          lat: element.lat ?? element.center?.lat,
          lon: element.lon ?? element.center?.lon,
        };
      })
      .filter((restaurant): restaurant is NonNullable<typeof restaurant> =>
        Boolean(restaurant),
      )
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pl"))
      .slice(0, 3) ?? [];

  if (restaurants.length === 0) {
    throw new Error("Nie znaleziono restauracji w OpenStreetMap.");
  }

  return {
    city: place.name,
    restaurants,
    updatedAt: new Date().toISOString(),
    source: "OpenStreetMap Overpass API",
    note:
      "Ranking bez dodatkowych kluczy API: realne miejsca z OpenStreetMap, premiowane za stronę WWW i uzupełnione dane.",
  };
}

export async function GET(request: Request) {
  const city = normalizeCity(new URL(request.url).searchParams.get("city"));
  const [
    weatherBundleResult,
    currencyResults,
    holidaysResult,
    restaurantsResult,
    quoteResult,
  ] = await Promise.all([
    loadWeatherAndForecast(city)
      .then((data) => ({ data }))
      .catch((error) => ({ error: errorMessage(error) })),
    Promise.all(
      ["EUR", "USD", "CHF"].map((code) =>
        loadCurrency(code)
          .then((data) => ({ data }))
          .catch((error) => ({ data: { code, error: errorMessage(error) } })),
      ),
    ),
    loadHolidays()
      .then((data) => ({ data }))
      .catch((error) => ({ error: errorMessage(error) })),
    loadTopRestaurants(city)
      .then((data) => ({ data }))
      .catch((error) => ({ error: errorMessage(error) })),
    loadQuoteOfTheDay()
      .then((data) => ({ data }))
      .catch((error) => ({ error: errorMessage(error) })),
  ]);

  return Response.json({
    weather:
      "data" in weatherBundleResult
        ? weatherBundleResult.data.weather
        : weatherBundleResult,
    forecast:
      "data" in weatherBundleResult
        ? weatherBundleResult.data.forecast
        : weatherBundleResult,
    currencies: currencyResults.map((result) => result.data),
    holidays: "data" in holidaysResult ? holidaysResult.data : holidaysResult,
    restaurants:
      "data" in restaurantsResult ? restaurantsResult.data : restaurantsResult,
    quote: "data" in quoteResult ? quoteResult.data : quoteResult,
  });
}
