"use client";

import { Bar } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";

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
  const labels = data.map((item) => {
    const day = new Date(item.date).getDay().toString();
    return DAY_LABELS[day];
  });

  const chartData = {
    labels,
    datasets: [
      {
        data: data.map((item) => item.hours),
        backgroundColor: data.map((item) => (item.hours > 0 ? "#ff4655" : "#2a3540")),
        borderRadius: 3,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { raw: number }) => `${context.raw}시간`,
        },
      },
    },
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
      <Bar data={chartData} options={options as never} />
    </div>
  );
}
