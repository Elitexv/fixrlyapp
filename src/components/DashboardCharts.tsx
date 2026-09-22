import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Panel, Eyebrow } from "@/components/ui-kit";
import { currencySymbol, formatMoney } from "@/lib/currency";

// Split out from dashboard.tsx and lazy-loaded there — recharts is one of
// the heaviest dependencies in the app, and every provider dashboard load
// was paying for it up front even before this data exists to chart.
export default function DashboardCharts({
  weeklyData,
  currency,
}: {
  weeklyData: { week: string; bookings: number; earnings: number }[];
  currency: string;
}) {
  // recharts' auto tick algorithm picks a "nice" step size for the axis
  // range (e.g. 0.2 for a 0-1 range), then allowDecimals={false} strips
  // every non-integer candidate — for a low-volume week (max count 0 or 1)
  // that strips ALL of them, leaving zero ticks and no gridlines at all.
  // Booking counts are always whole numbers, so compute integer-only ticks
  // ourselves instead of trusting that algorithm.
  const bookingsTicks = useMemo(() => {
    const max = Math.max(0, ...weeklyData.map((w) => w.bookings));
    const top = Math.max(max, 4);
    if (top <= 8) return Array.from({ length: top + 1 }, (_, i) => i);
    const step = Math.ceil(top / 4);
    return Array.from({ length: 5 }, (_, i) => i * step);
  }, [weeklyData]);

  const bookingsChartConfig = { bookings: { label: "Bookings", color: "#ff5a1f" } } satisfies ChartConfig;
  const earningsChartConfig = { earnings: { label: "Earnings", color: "#ff5a1f" } } satisfies ChartConfig;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-5">
        <Eyebrow>Volume</Eyebrow>
        <h3 className="mt-1 text-lg font-semibold">Bookings per week</h3>
        <ChartContainer config={bookingsChartConfig} className="mt-4 aspect-auto h-52 w-full sm:h-56">
          <BarChart data={weeklyData} margin={{ left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval="preserveStartEnd" minTickGap={16} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
              width={32}
              domain={[0, bookingsTicks[bookingsTicks.length - 1]]}
              ticks={bookingsTicks}
            />
            <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="bookings" fill="var(--color-bookings)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </Panel>

      <Panel className="p-5">
        <Eyebrow>Revenue</Eyebrow>
        <h3 className="mt-1 text-lg font-semibold">Earnings per week</h3>
        <ChartContainer config={earningsChartConfig} className="mt-4 aspect-auto h-52 w-full sm:h-56">
          <BarChart data={weeklyData} margin={{ left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} interval="preserveStartEnd" minTickGap={16} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
              width={40}
              tickFormatter={(v: number) => (v >= 1000 ? `${currencySymbol(currency)}${(v / 1000).toFixed(0)}k` : `${currencySymbol(currency)}${v}`)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)" }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">{formatMoney(Number(value), currency)}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="earnings" fill="var(--color-earnings)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </Panel>
    </div>
  );
}
