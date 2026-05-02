"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface WeeklyData {
  date: string;
  hours: number;
}

const DAY_LABELS: Record<string, string> = {
  "0": "일",
  "1": "월",
  "2": "화",
  "3": "수",
  "4": "목",
  "5": "금",
  "6": "토",
};

export default function ActivityChart({ data }: { data: WeeklyData[] }) {
  const labels = data.map((d) => {
    const day = new Date(d.date).getDay().toString();
    return DAY_LABELS[day];
  });

  const chartData = {
    labels,
    datasets: [
      {
        data: data.map((d) => d.hours),
        backgroundColor: data.map((d) => (d.hours > 0 ? "#ff4655" : "#2a3540")),
        borderRadius: 3,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.raw}시간`,
      },
    }},
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#7b8a96", font: { size: 11 } },
        border: { display: false },
      },
      y: {
        display: false,
        grid: { display: false },
      },
    },
  };

  return (
    <div style={{ height: "80px" }}>
      <Bar data={chartData} options={options as any} />
    </div>
  );
}
