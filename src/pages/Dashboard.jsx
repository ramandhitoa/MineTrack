// ============================================================
// HALAMAN DASHBOARD
// Menampilkan KPI, grafik produksi, grafik loading method, dan log terbaru.
// ============================================================

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { Card, LogTable } from '../components/Common';
import { fmt, toWitaDateInput } from '../utils/formatters';
import { parseAcuanNiValue } from '../utils/acuanNi';
import {
  aggregateLoadingMethod,
  aggregateProduction,
  formatPeriodLabel,
  getLoadingPeriods,
} from '../utils/dashboardAggregations';
import { getRecentProductionLogs } from '../utils/dashboardRecentLogs';

const PIE_COLORS = ['#38bdf8', '#3b82f6'];
const PERIODS = [
  { id: 'daily', label: 'DAILY' },
  { id: 'weekly', label: 'WEEKLY' },
  { id: 'monthly', label: 'MONTHLY' },
];

function matchesSearch(log, keyword) {
  if (!keyword) return true;
  return Object.values(log).some((value) => {
    if (value === null || value === undefined) return false;
    const text = Array.isArray(value) ? value.join(' ') : String(value);
    return text.toLocaleLowerCase().includes(keyword);
  });
}

export default function Dashboard({ logs = [], pendingCount, setActiveTab }) {
  const [filterPit, setFilterPit] = useState('Semua');
  const [filterMaterial, setFilterMaterial] = useState('Semua');
  const [query, setQuery] = useState('');
  const [today, setToday] = useState(() => toWitaDateInput());
  const [productionPeriod, setProductionPeriod] = useState('daily');
  const [loadingPeriod, setLoadingPeriod] = useState('daily');
  const [selectedLoadingPeriod, setSelectedLoadingPeriod] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setToday(toWitaDateInput()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pitOptions = useMemo(() => [...new Set(logs.map((log) => log.pit).filter(Boolean))].sort(), [logs]);
  const materialOptions = useMemo(() => [...new Set(logs.map((log) => log.material).filter(Boolean))].sort(), [logs]);
  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return logs.filter((log) => (
      (filterPit === 'Semua' || log.pit === filterPit)
      && (filterMaterial === 'Semua' || log.material === filterMaterial)
      && matchesSearch(log, keyword)
    ));
  }, [logs, filterPit, filterMaterial, query]);
  const recentLogs = useMemo(
    () => getRecentProductionLogs(filteredLogs, today),
    [filteredLogs, today]
  );
  const dashboardMetrics = useMemo(() => {
    const totals = filteredLogs.reduce((result, log) => {
      result.rit += Number(log.ritToday) || 0;
      result.total += Number(log.ritTotal) || 0;
      result.ton += Number(log.tonnage) || 0;
      const ni = parseAcuanNiValue(log.niGrade);
      if (ni !== null) {
        const tonnage = Number(log.tonnage) || 0;
        result.weightedNi += tonnage * ni;
        result.niTonnage += tonnage;
      }
      return result;
    }, { rit: 0, total: 0, ton: 0, weightedNi: 0, niTonnage: 0 });
    return {
      ...totals,
      ni: totals.niTonnage ? (totals.weightedNi / totals.niTonnage).toFixed(2) : null,
    };
  }, [filteredLogs]);
  const productionData = useMemo(
    () => aggregateProduction(filteredLogs, productionPeriod),
    [filteredLogs, productionPeriod]
  );
  const loadingPeriods = useMemo(
    () => getLoadingPeriods(filteredLogs, loadingPeriod),
    [filteredLogs, loadingPeriod]
  );
  const activeLoadingPeriod = loadingPeriods.includes(selectedLoadingPeriod)
    ? selectedLoadingPeriod
    : loadingPeriods[0] || '';
  const loadingStats = useMemo(
    () => aggregateLoadingMethod(filteredLogs, loadingPeriod, activeLoadingPeriod),
    [filteredLogs, loadingPeriod, activeLoadingPeriod]
  );

  return (
    <section className="dashboard">
      <div className="panel filters">
        <div>
          <label>
            Filter PIT
            <select value={filterPit} onChange={(event) => setFilterPit(event.target.value)}>
              <option value="Semua">Semua</option>
              {pitOptions.map((pit) => <option key={pit} value={pit}>{pit}</option>)}
            </select>
          </label>
          <label>
            Filter Material
            <select value={filterMaterial} onChange={(event) => setFilterMaterial(event.target.value)}>
              <option value="Semua">Semua</option>
              {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
          </label>
          <label>
            Cari Data Dashboard
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari tanggal, PIT, sample, material..."
            />
          </label>
        </div>
        <div className="filterActions">Total Data: {filteredLogs.length} Entry</div>
      </div>

      <div className="kpis">
        <Card
          label="Total Ritase Hari Ini"
          value={fmt(dashboardMetrics.rit)}
          unit="Rit"
          sub={`Akumulasi Ritase: ${fmt(dashboardMetrics.total)} Rit`}
          accent="green"
        />
        <Card
          label="Estimasi Tonase Ore (MT)"
          value={fmt(dashboardMetrics.ton)}
          unit="MT"
          sub={`Rata-Rata Ni: ${dashboardMetrics.ni ?? '-'}${dashboardMetrics.ni === null ? '' : '% Ni'}`}
          accent="amber"
        />
        <Card
          label="Total Dumpingan"
          value={filteredLogs.filter((log) => String(log.dumpingArea ?? '').trim() !== '').length}
          unit="Dumpingan"
          sub="Laporan dengan dumping terisi"
          accent="cyan"
        />
        <Card
          label="Planning Job Pending"
          value={pendingCount}
          unit="Tugas"
          sub="Buka Planning →"
          accent="purple"
        />
      </div>

      <div className="chartGrid">
        <ProductionChart data={productionData} period={productionPeriod} setPeriod={setProductionPeriod} />
        <LoadingMethodChart
          data={loadingStats}
          period={loadingPeriod}
          setPeriod={(nextPeriod) => {
            setLoadingPeriod(nextPeriod);
            setSelectedLoadingPeriod('');
          }}
          periods={loadingPeriods}
          selectedPeriod={activeLoadingPeriod}
          setSelectedPeriod={setSelectedLoadingPeriod}
        />
      </div>

      <div className="panel">
        <div className="panelHead">
          <h3>Entri Hasil Kerja Terbaru</h3>
          <button className="link" onClick={() => setActiveTab('harian')}>
            Buka Semua Log Harian →
          </button>
        </div>
        <LogTable logs={recentLogs} averageLogs={recentLogs} />
      </div>
    </section>
  );
}

function PeriodTabs({ value, onChange }) {
  return (
    <div className="chartPeriodTabs" role="tablist" aria-label="Periode grafik">
      {PERIODS.map((period) => (
        <button
          key={period.id}
          type="button"
          role="tab"
          aria-selected={value === period.id}
          className={value === period.id ? 'active' : ''}
          onClick={() => onChange(period.id)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

function ProductionChart({ data, period, setPeriod }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <h3>Grafik Performa Produksi & Kadar Nikel (% Ni)</h3>
          <p>Pemantauan tren ritase harian dan mutasi kadar assay lab</p>
        </div>
        <b>Target: ≥ 1.60% Ni</b>
      </div>
      <PeriodTabs value={period} onChange={setPeriod} />

      <div className="chart productionChart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="rit" orientation="left" domain={[0, 90]} tickCount={10} />
            <YAxis yAxisId="ni" orientation="right" domain={[0, 2.5]} tickCount={6} />
            <Tooltip />
            <Legend verticalAlign="top" align="center" height={28} />

            {/* Keep the bar first so the legend matches the reference image.
                The line is rendered second, but its stroke remains visually subtle. */}
            <Bar
              yAxisId="rit"
              dataKey="rit"
              name="Ritase Hari Ini (Rit)"
              fill="#f59e0b"
              radius={[6, 6, 0, 0]}
              barCategoryGap="18%"
              isAnimationActive={false}
            />
            <Line
              yAxisId="ni"
              dataKey="ni"
              name="Kadar Lab % Ni"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LoadingMethodChart({ data, period, setPeriod, periods, selectedPeriod, setSelectedPeriod }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <h3>Distribusi Loading Method</h3>
          <p>Penggunaan metode pemuatan excavator</p>
        </div>
      </div>
      <PeriodTabs value={period} onChange={setPeriod} />
      <label className="loadingPeriodSelect">
        Periode
        <select
          value={selectedPeriod}
          onChange={(event) => setSelectedPeriod(event.target.value)}
          disabled={!periods.length}
        >
          {periods.length === 0 ? <option value="">Tidak ada data</option> : periods.map((key) => (
            <option key={key} value={key}>{formatPeriodLabel(key, period)}</option>
          ))}
        </select>
      </label>

      <div className="chart small loadingChart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={74}
              paddingAngle={0}
              stroke="#0f172a"
              strokeWidth={1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="loadingLegend">
        {data.map((entry, index) => (
          <div className="loadingLegendItem" key={entry.name}>
            <strong>{entry.value}</strong>
            <span>{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
