"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type WeatherData = {
  city: string;
  temperature: number;
  apparent: number;
  wind: number;
  humidity: number;
  cloudCover?: number;
  icon: string;
  description: string;
  updatedAt: Date;
  error?: string;
};

type ForecastDay = {
  date: string;
  weekday: string;
  dayIcon: string;
  nightIcon: string;
  dayTemp: number;
  nightTemp: number;
  description: string;
};

type ForecastData = {
  city: string;
  days: ForecastDay[];
  updatedAt: Date;
  error?: string;
};

type CurrencyData = {
  code: string;
  rate: number;
  date: string;
  updatedAt: Date;
  error?: string;
};

type HolidayData = {
  date: string;
  localName: string;
  daysLeft: number;
};

type HolidaysState = {
  holidays: HolidayData[];
  updatedAt: Date;
  error?: string;
};

type Restaurant = {
  name: string;
  cuisine: string;
  url: string;
  score?: number;
};

type RestaurantsState = {
  city: string;
  restaurants: Restaurant[];
  updatedAt: Date;
  note?: string;
  error?: string;
};

type QuoteState = {
  text: string;
  author: string;
  updatedAt: Date;
  error?: string;
};

type DashboardResponse = {
  weather?: {
    city?: string;
    temperature?: number;
    apparent?: number;
    wind?: number;
    humidity?: number;
    cloudCover?: number;
    icon?: string;
    description?: string;
    updatedAt?: string;
    error?: string;
  };
  forecast?: {
    city?: string;
    days?: ForecastDay[];
    updatedAt?: string;
    error?: string;
  };
  currencies?: Array<{
    code: string;
    rate?: number;
    date?: string;
    updatedAt?: string;
    error?: string;
  }>;
  holidays?: {
    holidays?: HolidayData[];
    updatedAt?: string;
    error?: string;
  };
  restaurants?: {
    city?: string;
    restaurants?: Restaurant[];
    updatedAt?: string;
    note?: string;
    error?: string;
  };
  quote?: {
    text?: string;
    author?: string;
    updatedAt?: string;
    error?: string;
  };
};

const quickActions = [
  { href: "/travel", icon: "\u{1F30D}", label: "Zaplanuj podróż" },
  {
    href: "/react?prompt=Porownaj%20kursy%20EUR%2C%20USD%2C%20CHF",
    icon: "\u{1F4CA}",
    label: "Porównaj waluty",
  },
  { href: "/react", icon: "\u{1F504}", label: "Agent ReAct" },
  { href: "/chat", icon: "\u{1F4AC}", label: "Chat z agentem" },
  { href: "/think", icon: "\u{1F9E0}", label: "Tryb myślenia" },
  { href: "/fewshot", icon: "\u{1F4D6}", label: "Słownik AI" },
];

const restaurantMedals = ["\u{1F3C6}", "\u{1F948}", "\u{1F31F}"];
const cityOptions = [
  "Warszawa",
  "Kraków",
  "Wrocław",
  "Gdańsk",
  "Poznań",
  "Łódź",
  "Katowice",
  "Lublin",
  "Szczecin",
  "Bydgoszcz",
  "Toruń",
  "Rzeszów",
  "Białystok",
  "Zakopane",
  "Berlin",
  "Praga",
  "Wiedeń",
  "Paryż",
  "Londyn",
  "Rzym",
  "Barcelona",
  "Madryt",
  "Amsterdam",
  "Nowy Jork",
  "Tokio",
];
const currencyFlags: Record<string, string> = {
  CHF: "\u{1F1E8}\u{1F1ED}",
  EUR: "\u{1F1EA}\u{1F1FA}",
  USD: "\u{1F1FA}\u{1F1F8}",
};
const cloudIcons = new Set([
  "cloud",
  "moon-cloud",
  "night-cloud",
  "night-rain",
  "night-snow",
  "night-storm",
  "rain",
  "snow",
  "storm",
  "sun-cloud",
]);

function formatTime(date?: Date) {
  if (!date) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function parseDate(value?: string) {
  return value ? new Date(value) : new Date();
}

function WeatherGlyph({ icon }: { icon?: string }) {
  const normalizedIcon = icon ?? "sun";
  const showSun = ["day", "sun", "sun-cloud"].includes(normalizedIcon);
  const showMoon = [
    "moon",
    "moon-cloud",
    "night",
    "night-cloud",
    "night-rain",
    "night-snow",
    "night-storm",
  ].includes(normalizedIcon);
  const showCloud = cloudIcons.has(normalizedIcon);
  const showRain = ["night-rain", "rain", "storm", "night-storm"].includes(
    normalizedIcon,
  );
  const showSnow = ["night-snow", "snow"].includes(normalizedIcon);
  const showStorm = ["night-storm", "storm"].includes(normalizedIcon);

  return (
    <span
      aria-label={normalizedIcon}
      className={`weather-glyph weather-glyph-${normalizedIcon}`}
      role="img"
    >
      {showSun && <span className="glyph-sun" />}
      {showMoon && <span className="glyph-moon" />}
      {showCloud && (
        <span className="glyph-cloud">
          <span />
          <span />
          <span />
        </span>
      )}
      {showRain && (
        <span className="glyph-rain">
          <span />
          <span />
          <span />
        </span>
      )}
      {showSnow && <span className="glyph-snow">*</span>}
      {showStorm && <span className="glyph-bolt">z</span>}
    </span>
  );
}

function renderCurrencyLabel(code: string) {
  return `${currencyFlags[code] ?? "\u{1F3F3}\u{FE0F}"} ${code}`;
}

function DashboardSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="dashboard-card skeleton-card" key={index}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </>
  );
}

function CardTopline({
  label,
  updatedAt,
}: {
  label: string;
  updatedAt?: Date;
}) {
  return (
    <div className="card-topline">
      <span>{label}</span>
      <small>Ostatnia aktualizacja: {formatTime(updatedAt)}</small>
    </div>
  );
}

export default function DashboardPage() {
  const [selectedCity, setSelectedCity] = useState("Warszawa");
  const selectedCityRef = useRef("Warszawa");
  const [cityQuery, setCityQuery] = useState("Warszawa");
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyData[]>([]);
  const [holidays, setHolidays] = useState<HolidaysState | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantsState | null>(null);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const now = useMemo(() => new Date(), []);
  const filteredCities = useMemo(() => {
    const query = cityQuery.trim().toLowerCase();
    const matches = cityOptions.filter((city) =>
      city.toLowerCase().includes(query),
    );

    if (query && !matches.some((city) => city.toLowerCase() === query)) {
      return [cityQuery.trim(), ...matches].filter(Boolean).slice(0, 8);
    }

    return matches.slice(0, 8);
  }, [cityQuery]);

  async function refreshAll(city = selectedCityRef.current) {
    const normalizedCity = city.trim() || "Warszawa";
    setRefreshing(true);

    try {
      const response = await fetch(
        `/api/dashboard?city=${encodeURIComponent(normalizedCity)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Dashboard API HTTP ${response.status}`);
      }

      const data = (await response.json()) as DashboardResponse;
      const weatherData = data.weather;
      const forecastData = data.forecast;

      setWeather({
        city: weatherData?.city ?? "Warszawa",
        temperature: weatherData?.temperature ?? 0,
        apparent: weatherData?.apparent ?? 0,
        humidity: weatherData?.humidity ?? 0,
        cloudCover: weatherData?.cloudCover,
        wind: weatherData?.wind ?? 0,
        icon: weatherData?.icon ?? "day",
        description: weatherData?.description ?? "Brak danych",
        updatedAt: parseDate(weatherData?.updatedAt),
        error: weatherData?.error,
      });
      setForecast({
        city: forecastData?.city ?? "Warszawa",
        days: forecastData?.days ?? [],
        updatedAt: parseDate(forecastData?.updatedAt),
        error: forecastData?.error,
      });
      setCurrencies(
        (data.currencies ?? []).map((currency) => ({
          code: currency.code,
          rate: currency.rate ?? 0,
          date: currency.date ?? new Date().toISOString().slice(0, 10),
          updatedAt: parseDate(currency.updatedAt),
          error: currency.error,
        })),
      );
      setHolidays({
        holidays: data.holidays?.holidays ?? [],
        updatedAt: parseDate(data.holidays?.updatedAt),
        error: data.holidays?.error,
      });
      setRestaurants({
        city: data.restaurants?.city ?? "Warszawa",
        restaurants: data.restaurants?.restaurants ?? [],
        updatedAt: parseDate(data.restaurants?.updatedAt),
        note: data.restaurants?.note,
        error: data.restaurants?.error,
      });
      setQuote({
        text: data.quote?.text ?? "",
        author: data.quote?.author ?? "",
        updatedAt: parseDate(data.quote?.updatedAt),
        error: data.quote?.error,
      });
      selectedCityRef.current = normalizedCity;
      setSelectedCity(normalizedCity);
      setCityQuery(normalizedCity);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd";
      const updatedAt = new Date();

      setWeather({
        city: "Warszawa",
        temperature: 0,
        apparent: 0,
        humidity: 0,
        wind: 0,
        icon: "day",
        description: "Brak danych",
        updatedAt,
        error: message,
      });
      setForecast({
        city: "Warszawa",
        days: [],
        updatedAt,
        error: message,
      });
      setCurrencies(
        ["EUR", "USD", "CHF"].map((code) => ({
          code,
          rate: 0,
          date: "-",
          updatedAt,
          error: message,
        })),
      );
      setHolidays({ holidays: [], updatedAt, error: message });
      setRestaurants({
        city: "Warszawa",
        restaurants: [],
        updatedAt,
        error: message,
      });
      setQuote({ text: "", author: "", updatedAt, error: message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function chooseCity(city: string) {
    const normalizedCity = city.trim();

    if (!normalizedCity) {
      return;
    }

    setSelectedCity(normalizedCity);
    selectedCityRef.current = normalizedCity;
    setCityQuery(normalizedCity);
    setCityPickerOpen(false);
    void refreshAll(normalizedCity);
  }

  useEffect(() => {
    void refreshAll();

    const interval = window.setInterval(() => {
      void refreshAll();
    }, 30 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-hero">
        <div>
          <p>Dzisiaj: {formatDate(now)}</p>
          <h1>{"Dzie\u0144 dobry!"}</h1>
          {quote?.error ? (
            <p className="quote-line">{"Cytat dnia chwilowo niedost\u0119pny."}</p>
          ) : (
            <p className="quote-line">
              Cytat dnia: {quote?.text ? `"${quote.text}"` : "\u0142adowanie..."}
              {quote?.author ? ` - ${quote.author}` : ""}
            </p>
          )}
        </div>
        <div className="dashboard-controls" title={`Wybrane miasto: ${selectedCity}`}>
          <div className="city-picker">
            <label htmlFor="dashboard-city">Miasto</label>
            <input
              autoComplete="off"
              id="dashboard-city"
              onBlur={() => {
                window.setTimeout(() => setCityPickerOpen(false), 120);
              }}
              onChange={(event) => {
                setCityQuery(event.target.value);
                setCityPickerOpen(true);
              }}
              onFocus={() => setCityPickerOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  chooseCity(cityQuery);
                }
              }}
              placeholder="Wpisz miasto"
              type="text"
              value={cityQuery}
            />
            {cityPickerOpen && filteredCities.length > 0 && (
              <div className="city-picker-list">
                {filteredCities.map((city) => (
                  <button
                    key={city}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCity(city)}
                    type="button"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            aria-label={"Od\u015bwie\u017c dane"}
            className="refresh-button"
            disabled={refreshing}
            onClick={() => void refreshAll()}
            title={"Od\u015bwie\u017c wszystkie dane"}
            type="button"
          >
            {refreshing ? "\u{23F3}" : "\u{1F504}"}
          </button>
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Live data">
        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <article className="dashboard-card weather-card">
              <CardTopline label="Pogoda" updatedAt={weather?.updatedAt} />
              <h2>{weather?.city ?? "Warszawa"}</h2>
              {weather?.error ? (
                <p className="dashboard-error">{weather.error}</p>
              ) : (
                <>
                  <div className="weather-main">
                    <WeatherGlyph icon={weather?.icon} />
                    <strong>{weather?.temperature.toFixed(1)} C</strong>
                  </div>
                  <p>{weather?.description}</p>
                  <dl>
                    <div>
                      <dt>Odczuwalnie</dt>
                      <dd>{weather?.apparent.toFixed(1)} C</dd>
                    </div>
                    <div>
                      <dt>Wiatr</dt>
                      <dd>{weather?.wind.toFixed(1)} km/h</dd>
                    </div>
                    <div>
                      <dt>{"Wilgotno\u015b\u0107"}</dt>
                      <dd>{weather?.humidity}%</dd>
                    </div>
                  </dl>
                </>
              )}
            </article>

            <article className="dashboard-card forecast-card">
              <CardTopline label="Prognoza na 5 dni" updatedAt={forecast?.updatedAt} />
              <h2>{forecast?.city ?? "Warszawa"}</h2>
              {forecast?.error ? (
                <p className="dashboard-error">{forecast.error}</p>
              ) : (
                <div className="forecast-list">
                  {forecast?.days.map((day) => (
                    <div key={day.date}>
                      <time>{day.weekday}</time>
                      <span>
                        <WeatherGlyph icon={day.dayIcon} />
                        <WeatherGlyph icon={day.nightIcon} />
                      </span>
                      <strong>
                        {day.dayTemp.toFixed(0)} C / {day.nightTemp.toFixed(0)} C
                        <small>{day.description}</small>
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="dashboard-card holiday-card">
              <CardTopline
                label={"Nadchodz\u0105ce \u015bwi\u0119ta"}
                updatedAt={holidays?.updatedAt}
              />
              {holidays?.error ? (
                <p className="dashboard-error">{holidays.error}</p>
              ) : (
                <>
                  <ul className="holiday-list">
                    {holidays?.holidays.map((holiday) => (
                      <li key={holiday.date}>
                        <time>{holiday.date.slice(5)}</time>
                        <span>{holiday.localName}</span>
                        <strong>za {holiday.daysLeft} dni</strong>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Następne za:{" "}
                    <strong>{holidays?.holidays[0]?.daysLeft ?? "-"} dni</strong>
                  </p>
                </>
              )}
            </article>

            <article className="dashboard-card restaurants-card">
              <CardTopline
                label="Ranking restauracji"
                updatedAt={restaurants?.updatedAt}
              />
              <h2>{restaurants?.city ?? "Warszawa"}</h2>
              {restaurants?.error ? (
                <p className="dashboard-error">{restaurants.error}</p>
              ) : (
                <>
                  <div className="restaurant-list">
                    {restaurants?.restaurants.map((restaurant, index) => (
                      <a
                        href={restaurant.url}
                        key={`${restaurant.name}-${restaurant.url}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>{restaurantMedals[index] ?? `#${index + 1}`}</span>
                        <strong>{restaurant.name}</strong>
                        <small>{restaurant.cuisine}</small>
                      </a>
                    ))}
                  </div>
                  {restaurants?.note && <p className="card-note">{restaurants.note}</p>}
                </>
              )}
            </article>

            <article className="dashboard-card currency-card">
              <CardTopline
                label="Kursy walut"
                updatedAt={currencies[0]?.updatedAt}
              />
              <h2>NBP</h2>
              <div className="currency-list">
                {currencies.map((currency) => (
                  <div key={currency.code}>
                    <span>{renderCurrencyLabel(currency.code)}</span>
                    {currency.error ? (
                      <small>{currency.error}</small>
                    ) : (
                      <>
                        <strong>{currency.rate.toFixed(4)} PLN</strong>
                        <small>Kurs z: {currency.date}</small>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-card actions-card">
              <div className="card-topline">
                <span>Szybkie akcje</span>
                <small>Start</small>
              </div>
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <Link href={action.href} key={action.href}>
                    <span>{action.icon}</span>
                    {action.label}
                  </Link>
                ))}
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}
