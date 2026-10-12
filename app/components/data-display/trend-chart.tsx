import { useMemo, useState } from "react";

export type TrendChartDatum = {
  day: string;
  type: string;
  value: number;
};

type TrendSeries = {
  type: string;
  color: string;
  values: number[];
};

const CHART_WIDTH = 760;
const CHART_HEIGHT = 232;
const PADDING = { top: 22, right: 18, bottom: 34, left: 38 };
const SERIES_COLORS = ["#0b9da8", "#c88a22", "#7b61a8", "#4f7fbf"];

function linePath(values: number[], maxValue: number) {
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  return values.map((value, index) => {
    const x = PADDING.left + (values.length === 1 ? plotWidth / 2 : index * plotWidth / (values.length - 1));
    const y = PADDING.top + plotHeight - value / maxValue * plotHeight;
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function TrendChart({ data }: { data: TrendChartDatum[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { days, series, maxValue, ticks } = useMemo(() => {
    const nextDays = [...new Set(data.map((item) => item.day))];
    const types = [...new Set(data.map((item) => item.type))];
    const nextSeries: TrendSeries[] = types.map((type, index) => ({
      type,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values: nextDays.map((day) => data.find((item) => item.day === day && item.type === type)?.value ?? 0),
    }));
    const rawMax = Math.max(1, ...data.map((item) => item.value));
    const step = Math.max(1, Math.ceil(rawMax / 4 / 5) * 5);
    const nextMax = step * 4;
    return {
      days: nextDays,
      series: nextSeries,
      maxValue: nextMax,
      ticks: Array.from({ length: 5 }, (_, index) => index * step),
    };
  }, [data]);

  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const activeX = activeIndex === null ? null : PADDING.left + activeIndex * plotWidth / Math.max(1, days.length - 1);

  const updateActivePoint = (clientX: number, rect: DOMRect) => {
    const relativeX = (clientX - rect.left) / rect.width * CHART_WIDTH;
    const index = Math.round((relativeX - PADDING.left) / plotWidth * Math.max(1, days.length - 1));
    setActiveIndex(Math.max(0, Math.min(days.length - 1, index)));
  };

  return (
    <div className="lightweight-trend-chart">
      {activeIndex !== null ? (
        <div className="dashboard-chart-tooltip" role="status">
          <strong>{days[activeIndex]}</strong>
          {series.map((item) => <span key={item.type}><i style={{ background: item.color }} />{item.type}<b>{item.values[activeIndex]}</b></span>)}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="最近 7 天扫描视频与候选码趋势"
        onMouseMove={(event) => updateActivePoint(event.clientX, event.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setActiveIndex(null)}
        onTouchStart={(event) => updateActivePoint(event.touches[0].clientX, event.currentTarget.getBoundingClientRect())}
      >
        {ticks.map((tick) => {
          const y = PADDING.top + plotHeight - tick / maxValue * plotHeight;
          return <g key={tick}><line className="trend-grid-line" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} /><text className="trend-axis-label" x={PADDING.left - 8} y={y + 4} textAnchor="end">{tick}</text></g>;
        })}
        {days.map((day, index) => {
          const x = PADDING.left + index * plotWidth / Math.max(1, days.length - 1);
          return <text className="trend-axis-label" key={day} x={x} y={CHART_HEIGHT - 8} textAnchor="middle">{day}</text>;
        })}
        {series.map((item) => <path className="trend-series-line" key={item.type} d={linePath(item.values, maxValue)} stroke={item.color} />)}
        {activeX !== null ? <line className="trend-active-line" x1={activeX} x2={activeX} y1={PADDING.top} y2={PADDING.top + plotHeight} /> : null}
        {activeIndex !== null ? series.map((item) => {
          const y = PADDING.top + plotHeight - item.values[activeIndex] / maxValue * plotHeight;
          return <circle key={item.type} cx={activeX ?? 0} cy={y} r="4" fill={item.color} stroke="#fff" strokeWidth="2" />;
        }) : null}
      </svg>
    </div>
  );
}
