"use client";

import { useMemo } from "react";
import type { DriveData } from "../lib/drive-data";
import { aggregateStatistics, averageFuelPrice } from "../lib/statistics";

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function StatisticsView({ data }: { data: DriveData }) {
  const analytics = useMemo(() => aggregateStatistics(data), [data]);

  const maxMonthlyDistance = Math.max(...analytics.monthly.map((month) => month.distance), 1);
  const firstOdometer = data.odometerEntries[0];
  const lastOdometer = data.odometerEntries.at(-1);

  return (
    <div className="statistics-view">
      <div className="stat-cards">
        <article>
          <span>Total distance</span>
          <strong>{Math.round(analytics.totals.distance).toLocaleString()} km</strong>
        </article>
        <article>
          <span>Fuel cost estimate</span>
          <strong>
            CHF {analytics.totals.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </strong>
        </article>
        <article>
          <span>Consumption</span>
          <strong>
            {analytics.totals.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </strong>
        </article>
        <article>
          <span>CO₂</span>
          <strong>
            {analytics.totals.co2.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg
          </strong>
        </article>
        <article>
          <span>Average score</span>
          <strong>{Math.round(analytics.totals.score / Math.max(data.drives.length, 1))}%</strong>
        </article>
      </div>

      <div className="statistics-grid">
        <section className="analytics-card monthly-card">
          <header>
            <div>
              <h3>Monthly driving</h3>
              <p>Distance over the last 12 recorded months</p>
            </div>
          </header>
          <div className="bar-chart">
            {analytics.monthly.map((month) => (
              <div className="bar-column" key={month.order}>
                <span>{Math.round(month.distance)} km</span>
                <i
                  style={{ height: `${Math.max(4, (month.distance / maxMonthlyDistance) * 100)}%` }}
                />
                <small>{month.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-card">
          <header>
            <div>
              <h3>Weather insights</h3>
              <p>Driving behavior by recorded condition</p>
            </div>
          </header>
          <div className="analytics-table">
            <div className="table-head">
              <span>Condition</span>
              <span>Drives</span>
              <span>Avg speed</span>
              <span>Score</span>
            </div>
            {analytics.weather.map((weather) => (
              <div key={weather.name}>
                <strong>{weather.name}</strong>
                <span>{weather.drives}</span>
                <span>{Math.round(weather.speed)} km/h</span>
                <span>{Math.round(weather.score)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-card">
          <header>
            <div>
              <h3>Refuelling ledger</h3>
              <p>{data.fuelEntries.length} recorded entries</p>
            </div>
            <strong>CHF {analytics.fuel.cost.toFixed(2)}</strong>
          </header>
          <div className="fuel-summary">
            <span>
              <strong>{analytics.fuel.amount.toFixed(1)}</strong> total units
            </span>
            <span>
              <strong>
                CHF {averageFuelPrice(analytics.fuel.amount, analytics.fuel.cost).toFixed(2)}
              </strong>{" "}
              average/unit
            </span>
          </div>
          <div className="analytics-table fuel-table">
            <div className="table-head">
              <span>Entry</span>
              <span>Amount</span>
              <span>Price/unit</span>
              <span>Cost</span>
            </div>
            {data.fuelEntries.slice(0, 10).map((entry, index) => (
              <div key={entry.id}>
                <strong>#{data.fuelEntries.length - index}</strong>
                <span>{entry.amount.toFixed(2)}</span>
                <span>CHF {entry.pricePerUnit.toFixed(2)}</span>
                <span>CHF {entry.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-card">
          <header>
            <div>
              <h3>Odometer history</h3>
              <p>{data.odometerEntries.length.toLocaleString()} readings</p>
            </div>
          </header>
          {firstOdometer && lastOdometer && (
            <div className="odometer-summary">
              <div>
                <span>{dateFormatter.format(firstOdometer.date)}</span>
                <strong>{Math.round(firstOdometer.value).toLocaleString()} km</strong>
              </div>
              <i />
              <div>
                <span>{dateFormatter.format(lastOdometer.date)}</span>
                <strong>{Math.round(lastOdometer.value).toLocaleString()} km</strong>
              </div>
            </div>
          )}
          <div className="analytics-table odometer-table">
            <div className="table-head">
              <span>Date</span>
              <span>Reading</span>
            </div>
            {data.odometerEntries
              .slice(-8)
              .reverse()
              .map((entry) => (
                <div key={`${entry.date}-${entry.value}`}>
                  <strong>{dateFormatter.format(entry.date)}</strong>
                  <span>{Math.round(entry.value).toLocaleString()} km</span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
