"use client";

import { useMemo } from "react";
import type { DriveData } from "./page";

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

function scorePercent(score: number) {
  return score <= 1 ? score * 100 : score;
}

export default function StatisticsView({ data }: { data: DriveData }) {
  const analytics = useMemo(() => {
    const monthlyMap = new Map<string, { label: string; distance: number; cost: number; drives: number; order: number }>();
    const weatherMap = new Map<string, { drives: number; speed: number; score: number }>();
    for (const drive of data.drives) {
      const date = new Date(drive.startDate);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const month = monthlyMap.get(key) ?? { label: monthFormatter.format(date), distance: 0, cost: 0, drives: 0, order: date.getFullYear() * 12 + date.getMonth() };
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
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.order - b.order).slice(-12);
    const weather = Array.from(weatherMap, ([name, value]) => ({
      name, drives: value.drives, speed: value.speed / value.drives, score: value.score / value.drives,
    })).sort((a, b) => b.drives - a.drives).slice(0, 8);
    const totals = data.drives.reduce((sum, drive) => ({
      distance: sum.distance + drive.distanceKm,
      cost: sum.cost + drive.consumptionCost,
      consumption: sum.consumption + drive.consumptionUnits,
      co2: sum.co2 + drive.co2Kg,
      score: sum.score + scorePercent(drive.score),
    }), { distance: 0, cost: 0, consumption: 0, co2: 0, score: 0 });
    const fuel = data.fuelEntries.reduce((sum, entry) => ({
      amount: sum.amount + entry.amount, cost: sum.cost + entry.cost,
    }), { amount: 0, cost: 0 });
    return { monthly, weather, totals, fuel };
  }, [data]);

  const maxMonthlyDistance = Math.max(...analytics.monthly.map((month) => month.distance), 1);
  const firstOdometer = data.odometerEntries[0];
  const lastOdometer = data.odometerEntries.at(-1);

  return <div className="statistics-view">
    <div className="stat-cards">
      <article><span>Total distance</span><strong>{Math.round(analytics.totals.distance).toLocaleString()} km</strong></article>
      <article><span>Fuel cost estimate</span><strong>CHF {analytics.totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></article>
      <article><span>Consumption</span><strong>{analytics.totals.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></article>
      <article><span>CO₂</span><strong>{analytics.totals.co2.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg</strong></article>
      <article><span>Average score</span><strong>{Math.round(analytics.totals.score / Math.max(data.drives.length, 1))}%</strong></article>
    </div>

    <div className="statistics-grid">
      <section className="analytics-card monthly-card">
        <header><div><h3>Monthly driving</h3><p>Distance over the last 12 recorded months</p></div></header>
        <div className="bar-chart">
          {analytics.monthly.map((month) => <div className="bar-column" key={month.order}>
            <span>{Math.round(month.distance)} km</span>
            <i style={{ height: `${Math.max(4, month.distance / maxMonthlyDistance * 100)}%` }} />
            <small>{month.label}</small>
          </div>)}
        </div>
      </section>

      <section className="analytics-card">
        <header><div><h3>Weather insights</h3><p>Driving behavior by recorded condition</p></div></header>
        <div className="analytics-table">
          <div className="table-head"><span>Condition</span><span>Drives</span><span>Avg speed</span><span>Score</span></div>
          {analytics.weather.map((weather) => <div key={weather.name}><strong>{weather.name}</strong><span>{weather.drives}</span><span>{Math.round(weather.speed)} km/h</span><span>{Math.round(weather.score)}%</span></div>)}
        </div>
      </section>

      <section className="analytics-card">
        <header><div><h3>Refuelling ledger</h3><p>{data.fuelEntries.length} recorded entries</p></div><strong>CHF {analytics.fuel.cost.toFixed(2)}</strong></header>
        <div className="fuel-summary"><span><strong>{analytics.fuel.amount.toFixed(1)}</strong> total units</span><span><strong>CHF {(analytics.fuel.cost / Math.max(analytics.fuel.amount, 1)).toFixed(2)}</strong> average/unit</span></div>
        <div className="analytics-table fuel-table">
          <div className="table-head"><span>Entry</span><span>Amount</span><span>Price/unit</span><span>Cost</span></div>
          {data.fuelEntries.slice(0, 10).map((entry, index) => <div key={entry.id}><strong>#{data.fuelEntries.length - index}</strong><span>{entry.amount.toFixed(2)}</span><span>CHF {entry.pricePerUnit.toFixed(2)}</span><span>CHF {entry.cost.toFixed(2)}</span></div>)}
        </div>
      </section>

      <section className="analytics-card">
        <header><div><h3>Odometer history</h3><p>{data.odometerEntries.length.toLocaleString()} readings</p></div></header>
        {firstOdometer && lastOdometer && <div className="odometer-summary">
          <div><span>{dateFormatter.format(firstOdometer.date)}</span><strong>{Math.round(firstOdometer.value).toLocaleString()} km</strong></div>
          <i />
          <div><span>{dateFormatter.format(lastOdometer.date)}</span><strong>{Math.round(lastOdometer.value).toLocaleString()} km</strong></div>
        </div>}
        <div className="analytics-table odometer-table">
          <div className="table-head"><span>Date</span><span>Reading</span></div>
          {data.odometerEntries.slice(-8).reverse().map((entry) => <div key={`${entry.date}-${entry.value}`}><strong>{dateFormatter.format(entry.date)}</strong><span>{Math.round(entry.value).toLocaleString()} km</span></div>)}
        </div>
      </section>
    </div>
  </div>;
}
