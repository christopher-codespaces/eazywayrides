"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const USER_COLORS = ["#2563eb", "#10b981"]; // blue, emerald
const JOB_COLORS = ["#0ea5e9", "#4f46e5", "#22c55e"]; // sky, indigo, green

type UserDistributionData = { name: string; value: number }[];
type JobStatusData = { name: string; value: number }[];

interface ChartsClientProps {
  userDistributionData: UserDistributionData;
  jobStatusData: JobStatusData;
}

export default function ChartsClient({
  userDistributionData,
  jobStatusData,
}: ChartsClientProps) {
  const userTotal = userDistributionData.reduce((sum, d) => sum + (d.value || 0), 0);
  const jobTotal = jobStatusData.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="space-y-3">
      {/* User Distribution */}
      <div className="p-3 md:p-4 bg-white rounded-lg shadow border space-y-3">
        <div>
          <h3 className="font-medium text-sm md:text-base">User Distribution</h3>
          <p className="text-gray-600 mt-1 text-xs md:text-sm">
            Breakdown of active drivers and businesses on the platform.
          </p>
        </div>

        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={userDistributionData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(((percent ?? 0) * 100).toFixed(0))}%`
                }
              >
                {userDistributionData.map((_, index) => (
                  <Cell
                    key={`cell-user-${index}`}
                    fill={USER_COLORS[index % USER_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: any, name: any) => {
                  const v = Number(value) || 0;
                  const pct = userTotal > 0 ? ((v / userTotal) * 100).toFixed(0) : "0";
                  return [`${v} (${pct}%)`, name];
                }}
              />
              <Legend verticalAlign="bottom" height={24} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Job Status Breakdown */}
      <div className="p-3 md:p-4 bg-white rounded-lg shadow border space-y-3">
        <div>
          <h3 className="font-medium text-sm md:text-base">Job Status Breakdown</h3>
          <p className="text-gray-600 mt-1 text-xs md:text-sm">
            Distribution of jobs across key states.
          </p>
        </div>

        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={jobStatusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(((percent ?? 0) * 100).toFixed(0))}%`
                }
              >
                {jobStatusData.map((_, index) => (
                  <Cell
                    key={`cell-job-${index}`}
                    fill={JOB_COLORS[index % JOB_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: any, name: any) => {
                  const v = Number(value) || 0;
                  const pct = jobTotal > 0 ? ((v / jobTotal) * 100).toFixed(0) : "0";
                  return [`${v} (${pct}%)`, name];
                }}
              />
              <Legend verticalAlign="bottom" height={24} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
