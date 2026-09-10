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
import { Card, LogTable } from '../components/Common';
import { fmt } from '../utils/formatters';

const PIE_COLORS = ['#38bdf8', '#3b82f6'];

export default function Dashboard({ metrics, logs, chartData, loadingStats, pendingCount, setActiveTab }) {
  return (
    <section className="dashboard">
      <div className="kpis">
        <Card
          label="Total Ritase Hari Ini"
          value={fmt(metrics.rit)}
          unit="Rit"
          sub={`Akumulasi Ritase: ${fmt(metrics.total)} Rit`}
          accent="green"
        />
        <Card
          label="Estimasi Tonase Ore (MT)"
          value={fmt(metrics.ton)}
          unit="MT"
          sub={`Rata-Rata Ni: ${metrics.ni}% Ni`}
          accent="amber"
        />
        <Card
          label="Jam Operasional Shift"
          value={metrics.hours}
          unit="Jam"
          sub={`Rata-Rata Moisture MC: ${metrics.mc}% MC`}
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
        <ProductionChart data={chartData} />
        <LoadingMethodChart data={loadingStats} />
      </div>

      <div className="panel">
        <div className="panelHead">
          <h3>Entri Hasil Kerja Terbaru</h3>
          <button className="link" onClick={() => setActiveTab('harian')}>
            Buka Semua Log Harian →
          </button>
        </div>
        <LogTable logs={logs.slice(0, 5)} />
      </div>
    </section>
  );
}

function ProductionChart({ data }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <h3>Grafik Performa Produksi & Kadar Nikel (% Ni)</h3>
          <p>Pemantauan tren ritase harian dan mutasi kadar assay lab</p>
        </div>
        <b>Target: ≥ 1.60% Ni</b>
      </div>

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

function LoadingMethodChart({ data }) {
  return (
    <div className="panel">
      <h3>Distribusi Loading Method</h3>
      <p>Penggunaan metode pemuatan excavator</p>

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
