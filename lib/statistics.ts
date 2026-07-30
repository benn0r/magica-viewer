import { scorePercent, type DriveData } from "./drive-data";

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" });

export function aggregateStatistics(data: DriveData) {
  const monthlyMap = new Map<
    string,
    { label: string; distance: number; cost: number; drives: number; order: number }
  >();
  const weatherMap = new Map<string, { drives: number; speed: number; score: number }>();

  for (const drive of data.drives) {
    const date = new Date(drive.startDate);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const month = monthlyMap.get(key) ?? {
      label: monthFormatter.format(date),
      distance: 0,
      cost: 0,
      drives: 0,
      order: date.getFullYear() * 12 + date.getMonth(),
    };
    month.distance += drive.distanceKm;
    month.cost += drive.consumptionCost;
    month.drives += 1;
    monthlyMap.set(key, month);

    if (drive.weather) {
      const weather = weatherMap.get(drive.weather) ?? { drives: 0, speed: 0, score: 0 };
      weather.drives += 1;
      weather.speed += drive.averageSpeedKmh;
      weather.score += scorePercent(drive.score);
      weatherMap.set(drive.weather, weather);
    }
  }

  const monthly = Array.from(monthlyMap.values())
    .sort((a, b) => a.order - b.order)
    .slice(-12);
  const weather = Array.from(weatherMap, ([name, value]) => ({
    name,
    drives: value.drives,
    speed: value.speed / value.drives,
    score: value.score / value.drives,
  }))
    .sort((a, b) => b.drives - a.drives || a.name.localeCompare(b.name))
    .slice(0, 8);
  const totals = data.drives.reduce(
    (sum, drive) => ({
      distance: sum.distance + drive.distanceKm,
      cost: sum.cost + drive.consumptionCost,
      consumption: sum.consumption + drive.consumptionUnits,
      co2: sum.co2 + drive.co2Kg,
      score: sum.score + scorePercent(drive.score),
    }),
    { distance: 0, cost: 0, consumption: 0, co2: 0, score: 0 },
  );
  const fuel = data.fuelEntries.reduce(
    (sum, entry) => ({ amount: sum.amount + entry.amount, cost: sum.cost + entry.cost }),
    { amount: 0, cost: 0 },
  );

  return { monthly, weather, totals, fuel };
}

export function averageFuelPrice(amount: number, cost: number) {
  return amount > 0 ? cost / amount : 0;
}
