import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowCounterClockwise,
  ArrowRight,
  CaretLeft,
  CaretRight,
  GlobeHemisphereWest,
  HandSwipeLeft,
} from "@phosphor-icons/react";
import { bmsg } from "./belvedere-i18n";
import { countryName } from "./belvedere-data";
import { formatLocale, useLocale } from "./locale";
import geography from "./belvedere-globe-data.json";
import "./belvedere-globe.css";

// Natural Earth public-domain coastline samples and country label coordinates.
// Pinned source and deterministic sampling recipe: docs/BELVEDERE_GLOBE.md.
type Coordinate = readonly [number, number]; // longitude, latitude
type Vector = readonly [number, number, number];
type CountryCount = { country: string | null; connections: number };
type DistributionCountry = {
  country: string | null;
  dispatches: number;
  delivered: number;
  channels: { channel: string; dispatches: number }[];
};
export interface BelvedereGlobeProps {
  connections: CountryCount[];
  distribution: DistributionCountry[];
  onDistributionCountry?: (country: string | null) => void;
  loading?: boolean;
}
const RAD = Math.PI / 180;
const name = countryName;
const coordinates = geography.countries as Record<string, number[]>;
const DEFAULT_CENTER: Coordinate = [13, 29];
const vector = ([longitude, latitude]: Coordinate): Vector => {
  const lat = latitude * RAD;
  const lon = longitude * RAD;
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  ];
};
const land = geography.land.map((point) => vector(point as [number, number]));
function camera([longitude, latitude]: Coordinate) {
  const lon = longitude * RAD;
  const lat = latitude * RAD;
  return [
    [-Math.sin(lon), 0, Math.cos(lon)],
    [
      -Math.sin(lat) * Math.cos(lon),
      Math.cos(lat),
      -Math.sin(lat) * Math.sin(lon),
    ],
    [
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      Math.cos(lat) * Math.sin(lon),
    ],
  ] as const;
}
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function projectGlobePoint(point: Coordinate, center: Coordinate) {
  const pointVector = vector(point);
  const basis = camera(center);
  return {
    x: dot(pointVector, basis[0]),
    y: -dot(pointVector, basis[1]),
    depth: dot(pointVector, basis[2]),
  };
}
export function globeCountryCoordinate(code: string | null): Coordinate | null {
  const point = code && /^[A-Z]{2}$/.test(code) && coordinates[code];
  return point ? [point[0]!, point[1]!] : null;
}
export function globeCountryCounts(rows: CountryCount[]) {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.connections) || row.connections <= 0)
      continue;
    const country =
      row.country && /^[A-Z]{2}$/.test(row.country) ? row.country : null;
    const next = (counts.get(country) ?? 0) + row.connections;
    if (Number.isSafeInteger(next)) counts.set(country, next);
  }
  return [...counts]
    .map(([country, connections]) => ({ country, connections }))
    .sort(
      (a, b) =>
        b.connections - a.connections ||
        (a.country ?? "ZZZ").localeCompare(b.country ?? "ZZZ"),
    );
}

export function BelvedereGlobe({
  connections,
  distribution,
  onDistributionCountry,
  loading = false,
}: BelvedereGlobeProps) {
  useLocale();
  const formatTag = formatLocale();
  const format = useMemo(() => new Intl.NumberFormat(formatTag), [formatTag]);
  const [mode, setMode] = useState<"connections" | "distribution">(
    "connections",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [center, setCenter] = useState<Coordinate>(DEFAULT_CENTER);
  const [hover, setHover] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<
    { country: string; x: number; y: number; radius: number }[]
  >([]);
  const drag = useRef<{
    x: number;
    y: number;
    center: Coordinate;
    moved: boolean;
  } | null>(null);
  const titleId = useId();
  const helpId = useId();
  const data = useMemo(
    () =>
      globeCountryCounts(
        mode === "connections"
          ? connections
          : distribution.map((row) => ({
              country: row.country,
              connections: row.dispatches,
            })),
      ),
    [mode, connections, distribution],
  );
  const total = data.reduce((sum, row) => sum + row.connections, 0);
  const located = useMemo(
    () => data.filter((row) => globeCountryCoordinate(row.country)),
    [data],
  );
  const unlocated = data
    .filter((row) => !globeCountryCoordinate(row.country))
    .reduce((sum, row) => sum + row.connections, 0);
  const selectedRow = selected
    ? (data.find((row) => row.country === selected) ?? null)
    : null;
  const focus = hover ?? selected;
  const focusRow = data.find((row) => row.country === focus);
  const metric = mode === "connections" ? bmsg("connexions") : bmsg("envois");
  const max = Math.max(...data.map((row) => row.connections), 1);
  const selectCountry = useCallback((country: string) => {
    setSelected(country);
    setHover(null);
    const coordinate = globeCountryCoordinate(country);
    if (coordinate) setCenter(coordinate);
  }, []);
  const rotate = (amount: number) =>
    setCenter(([lon, lat]) => [((lon + amount + 540) % 360) - 180, lat]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d", { alpha: true });
    if (!context) return;
    let frame = 0;
    const render = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * density);
      element.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      const cx = width / 2;
      const cy = height / 2 - 3;
      const radius = Math.min(width * 0.405, height * 0.416);
      const basis = camera(center);
      context.clearRect(0, 0, width, height);

      // A restrained cast shadow grounds the globe on the same ivory surface.
      context.save();
      context.translate(cx, cy + radius * 1.1);
      context.scale(1, 0.13);
      const cast = context.createRadialGradient(0, 0, 0, 0, 0, radius * 0.83);
      cast.addColorStop(0, "rgba(35,57,106,0.17)");
      cast.addColorStop(1, "rgba(35,57,106,0)");
      context.fillStyle = cast;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();

      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.clip();
      const sphere = context.createRadialGradient(
        cx - radius * 0.44,
        cy - radius * 0.52,
        radius * 0.05,
        cx + radius * 0.15,
        cy + radius * 0.18,
        radius * 1.23,
      );
      sphere.addColorStop(0, "#fffefa");
      sphere.addColorStop(0.53, "#edf1ed");
      sphere.addColorStop(0.87, "#d5dfeb");
      sphere.addColorStop(1, "#8ea4c7");
      context.fillStyle = sphere;
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      // True meridians/parallels, clipped by hemisphere visibility.
      context.strokeStyle = "rgba(54,84,127,0.13)";
      context.lineWidth = 0.65;
      const trace = (points: Coordinate[]) => {
        let pen = false;
        context.beginPath();
        for (const point of points) {
          const v = vector(point);
          const depth = dot(v, basis[2]);
          if (depth < 0) {
            pen = false;
            continue;
          }
          const x = cx + dot(v, basis[0]) * radius;
          const y = cy - dot(v, basis[1]) * radius;
          if (pen) context.lineTo(x, y);
          else context.moveTo(x, y);
          pen = true;
        }
        context.stroke();
      };
      for (let lat = -60; lat <= 60; lat += 30)
        trace(Array.from({ length: 181 }, (_, i) => [-180 + i * 2, lat]));
      for (let lon = -180; lon < 180; lon += 30)
        trace(Array.from({ length: 91 }, (_, i) => [lon, -90 + i * 2]));

      const layers: { x: number; y: number; size: number }[][] = Array.from(
        { length: 8 },
        () => [],
      );
      for (const point of land) {
        const depth = dot(point, basis[2]);
        if (depth < 0.012) continue;
        const x = dot(point, basis[0]);
        const y = -dot(point, basis[1]);
        const light = Math.max(
          0,
          Math.min(
            7,
            Math.floor((depth * 0.7 - x * 0.18 - y * 0.15 + 0.22) * 7),
          ),
        );
        layers[light]!.push({
          x: cx + x * radius,
          y: cy + y * radius,
          size: Math.max(0.45, radius / 175) * (0.55 + depth * 0.5),
        });
      }
      for (let index = 0; index < layers.length; index++) {
        context.fillStyle = `rgba(38,73,141,${0.36 + index * 0.062})`;
        context.beginPath();
        for (const point of layers[index]!) {
          context.moveTo(point.x + point.size, point.y);
          context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        }
        context.fill();
      }
      context.restore();
      context.beginPath();
      context.arc(cx, cy, radius + 0.5, 0, Math.PI * 2);
      context.strokeStyle = "rgba(66,93,132,0.17)";
      context.lineWidth = 1;
      context.stroke();

      const positions: typeof hits.current = [];
      // Larger markers are drawn first, so tiny neighbouring countries stay selectable.
      for (const row of located) {
        const coordinate = globeCountryCoordinate(row.country)!;
        const point = projectGlobePoint(coordinate, center);
        if (point.depth < 0.04) continue;
        const x = cx + point.x * radius;
        const y = cy + point.y * radius;
        const size = 3.1 + Math.sqrt(row.connections / max) * 5.2;
        const active = row.country === focus;
        context.beginPath();
        context.arc(x, y, size + (active ? 6 : 3), 0, Math.PI * 2);
        context.fillStyle = active
          ? "rgba(36,80,219,0.20)"
          : "rgba(36,80,219,0.12)";
        context.fill();
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fillStyle = active ? "#1639aa" : "#2450db";
        context.fill();
        context.strokeStyle = "#fffefa";
        context.lineWidth = active ? 2 : 1.4;
        context.stroke();
        positions.push({
          country: row.country!,
          x,
          y,
          radius: Math.max(size + 5, 12),
        });
      }
      hits.current = positions;
      if (focusRow) {
        const position = positions.find(
          (point) => point.country === focusRow.country,
        );
        if (position) {
          const label = `${focusRow.country}  ${format.format(focusRow.connections)}`;
          context.font = '500 11px "IBM Plex Sans", sans-serif';
          const boxWidth = context.measureText(label).width + 20;
          const left = Math.max(
            8,
            Math.min(width - boxWidth - 8, position.x + 18),
          );
          const top = Math.max(12, position.y - 42);
          context.beginPath();
          context.moveTo(position.x + 4, position.y - 6);
          context.lineTo(left + 4, top + 21);
          context.strokeStyle = "#2450db";
          context.lineWidth = 1;
          context.stroke();
          context.fillStyle = "#fffefa";
          context.fillRect(left, top, boxWidth, 25);
          context.strokeStyle = "#cbd5eb";
          context.strokeRect(left, top, boxWidth, 25);
          context.fillStyle = "#173eaf";
          context.fillText(label, left + 10, top + 17);
        }
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [center, data, max, focus, focusRow, located, format]);
  const hit = (clientX: number, clientY: number) => {
    const bounds = canvas.current!.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    return hits.current
      .filter((point) => Math.hypot(point.x - x, point.y - y) <= point.radius)
      .sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )[0];
  };
  const selectedDistribution = distribution.find(
    (row) => row.country === selected,
  );
  return (
    <section
      className="bv-globe-panel"
      aria-labelledby={titleId}
      aria-busy={loading}
    >
      <header className="bv-globe-header">
        <div>
          <h2 id={titleId}>{bmsg("Le monde de guteneo.")}</h2>
          <p>
            {mode === "connections"
              ? bmsg("D’où l’on se connecte.")
              : bmsg("Où vont les envois.")}{" "}
            <span>{bmsg("Une vue, pays par pays.")}</span>
          </p>
        </div>
        <div
          className="bv-globe-switch"
          role="group"
          aria-label={bmsg("Données du globe")}
        >
          <button
            type="button"
            aria-pressed={mode === "connections"}
            onClick={() => {
              setMode("connections");
              setHover(null);
            }}
          >
            {bmsg("Connexions")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "distribution"}
            onClick={() => {
              setMode("distribution");
              setHover(null);
            }}
          >
            {bmsg("Distribution")}
          </button>
        </div>
      </header>
      <div className="bv-globe-layout">
        <div className="bv-globe-stage">
          <div className="bv-globe-coordinate" aria-hidden="true">
            <span>
              {new Intl.NumberFormat(formatLocale(), {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(Math.abs(center[1]))}
              ° {center[1] < 0 ? bmsg("S") : bmsg("N")}
            </span>
            <span>
              {new Intl.NumberFormat(formatLocale(), {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }).format(Math.abs(center[0]))}
              ° {center[0] < 0 ? bmsg("O") : bmsg("E")}
            </span>
          </div>
          <canvas
            ref={canvas}
            className="bv-globe-canvas"
            tabIndex={0}
            role="img"
            aria-label={bmsg(
              "Globe interactif : {0} {1}. Les mêmes données et la sélection des pays sont disponibles dans la liste.",
              format.format(total),
              metric,
            )}
            aria-describedby={helpId}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                rotate(event.key === "ArrowLeft" ? -12 : 12);
              } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                setCenter(([lon, lat]) => [
                  lon,
                  Math.max(
                    -80,
                    Math.min(80, lat + (event.key === "ArrowUp" ? 10 : -10)),
                  ),
                ]);
              } else if (event.key === "Home") {
                event.preventDefault();
                setCenter(DEFAULT_CENTER);
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                center,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current) {
                const dx = event.clientX - drag.current.x;
                const dy = event.clientY - drag.current.y;
                drag.current.moved ||= Math.hypot(dx, dy) > 5;
                if (drag.current.moved) {
                  setHover(null);
                  setCenter([
                    ((drag.current.center[0] - dx * 0.32 + 540) % 360) - 180,
                    Math.max(
                      -80,
                      Math.min(80, drag.current.center[1] + dy * 0.25),
                    ),
                  ]);
                }
              } else
                setHover(hit(event.clientX, event.clientY)?.country ?? null);
            }}
            onPointerUp={(event) => {
              if (drag.current && !drag.current.moved) {
                const point = hit(event.clientX, event.clientY);
                if (point) selectCountry(point.country);
              }
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerLeave={() => setHover(null)}
          />
          {loading && (
            <div className="bv-globe-loading" role="status">
              {bmsg("Chargement de la géographie…")}
            </div>
          )}
          <div className="bv-globe-toolbar">
            <p id={helpId}>
              <HandSwipeLeft size={17} aria-hidden="true" />
              {bmsg(" Glisser pour explorer ")}
              <span>{bmsg("· flèches au clavier")}</span>
            </p>
            <div>
              <button
                type="button"
                aria-label={bmsg("Tourner le globe vers l’ouest")}
                onClick={() => rotate(-20)}
              >
                <CaretLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={bmsg("Recentrer le globe sur l’Europe")}
                onClick={() => setCenter(DEFAULT_CENTER)}
              >
                <ArrowCounterClockwise size={17} />
              </button>
              <button
                type="button"
                aria-label={bmsg("Tourner le globe vers l’est")}
                onClick={() => rotate(20)}
              >
                <CaretRight size={17} />
              </button>
            </div>
          </div>
        </div>
        <div className="bv-globe-data">
          <div className="bv-globe-summary">
            <strong>{loading ? "—" : format.format(total)}</strong>
            <span>
              {metric}
              {bmsg(" sur la période")}
              <br />
              <b>
                {format.format(data.filter((row) => row.country).length)}
                {bmsg(" pays renseignés")}
              </b>
            </span>
          </div>
          {data.length ? (
            <ol
              className="bv-globe-ranking"
              aria-label={bmsg("Répartition des {0} par pays", metric)}
            >
              {data.map((row) => (
                <li key={row.country ?? "unknown"}>
                  {row.country ? (
                    <button
                      type="button"
                      aria-pressed={selected === row.country}
                      onClick={() => selectCountry(row.country!)}
                    >
                      <span className="bv-globe-country-code">
                        {row.country}
                      </span>
                      <span className="bv-globe-country-name">
                        {name(row.country)}
                        <span className="bv-globe-country-bar">
                          <i
                            style={{
                              width: `${(row.connections / max) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      <span className="bv-globe-country-value">
                        {format.format(row.connections)}
                        <small>
                          {new Intl.NumberFormat(formatLocale(), {
                            style: "percent",
                            maximumFractionDigits: 1,
                          }).format(row.connections / total)}
                        </small>
                      </span>
                    </button>
                  ) : (
                    <div className="bv-globe-unknown-row">
                      <span className="bv-globe-country-code">—</span>
                      <span className="bv-globe-country-name">
                        {bmsg("Pays non renseigné")}
                      </span>
                      <span className="bv-globe-country-value">
                        {format.format(row.connections)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="bv-globe-empty">
              <GlobeHemisphereWest
                size={28}
                weight="light"
                aria-hidden="true"
              />
              <strong>
                {loading
                  ? bmsg("La carte se prépare.")
                  : bmsg("La géographie reste à écrire.")}
              </strong>
              <p>
                {mode === "connections"
                  ? bmsg(
                      "Les pays apparaîtront lors des prochaines connexions observées.",
                    )
                  : bmsg(
                      "Aucun pays de destination n’est renseigné sur cette période.",
                    )}
              </p>
            </div>
          )}
          <div className="bv-globe-selection" aria-live="polite">
            <span>
              {selectedRow
                ? name(selectedRow.country)
                : bmsg("Sélectionnez un pays")}
            </span>
            <p>
              {selectedRow
                ? `${format.format(selectedRow.connections)} ${metric}${mode === "distribution" && selectedDistribution ? bmsg(" · {0} livrés", format.format(selectedDistribution.delivered)) : ""}`
                : bmsg(
                    "Les points du globe et la liste partagent la même sélection.",
                  )}
            </p>
            {mode === "distribution" &&
              selectedRow?.country &&
              onDistributionCountry && (
                <button
                  type="button"
                  onClick={() => onDistributionCountry(selectedRow.country)}
                >
                  {bmsg("Voir l’activité de ce pays")}{" "}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              )}
          </div>
        </div>
      </div>
      <footer className="bv-globe-footer">
        <span>
          <i />
          {bmsg(" Points dimensionnés selon le volume")}
        </span>
        <span>
          {unlocated
            ? bmsg(
                "{0} {1} sans position cartographique · ",
                format.format(unlocated),
                metric,
              )
            : ""}
          {mode === "connections"
            ? bmsg("Pays observé lors de la connexion")
            : bmsg("Pays renseigné pour la destination")}
          {bmsg(". Position représentative du pays.")}
        </span>
      </footer>
    </section>
  );
}
