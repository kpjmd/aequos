'use client';

import { useEffect, useState } from 'react';

interface SystemMetrics {
  totalConsultations: number;
  consultationsToday: number;
  consultationsThisWeek: number;
  weekOverWeekGrowth: number;
  averageAgentsPerConsultation: number;
  totalAgentInvocations: number;
  averageMDApprovalRate: number;
  averageUserSatisfaction: number;
  outcomeValidationRate: number;
  totalTokensIssued: number;
  tokensInCirculation: number;
  consultationTrend: Array<{ date: string; count: number }>;
  agentStatsAvailable: boolean;
}

export function SystemOverview() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/admin/metrics/overview');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch system metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <p className="text-gray-500">Failed to load system metrics</p>
      </div>
    );
  }

  const MetricCard = ({ label, value, subtext, icon }: { label: string; value: string | number; subtext?: string; icon: string }) => (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {subtext && (
          <span className={`text-xs font-medium ${subtext.startsWith('+') ? 'text-green-600' : 'text-gray-500'}`}>
            {subtext}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="px-6 py-4 border-b">
        <h2 className="text-xl font-bold text-gray-900">System Overview</h2>
        <p className="text-sm text-gray-500">Real-time health metrics</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Top Row Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon="📊"
            label="Total Cases"
            value={metrics.totalConsultations.toLocaleString()}
            subtext={`+${metrics.weekOverWeekGrowth}% WoW`}
          />
          <MetricCard
            icon="👥"
            label="Avg Agents"
            value={typeof metrics.averageAgentsPerConsultation === 'string' ? metrics.averageAgentsPerConsultation : metrics.averageAgentsPerConsultation.toFixed(1)}
          />
          <MetricCard
            icon="🎯"
            label="Avg Consensus"
            value={`${Math.round((metrics.averageMDApprovalRate || 0) * 100)}%`}
          />
        </div>

        {/* Bottom Row Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon="✅"
            label="MD Approval"
            value={`${Math.round((metrics.averageMDApprovalRate || 0) * 100)}%`}
          />
          <MetricCard
            icon="⭐"
            label="User Satisfaction"
            value={typeof metrics.averageUserSatisfaction === 'string' ? metrics.averageUserSatisfaction : `${metrics.averageUserSatisfaction.toFixed(1)}/10`}
          />
          <MetricCard
            icon="📈"
            label="Validated"
            value={`${Math.round((metrics.outcomeValidationRate || 0) * 100)}%`}
          />
        </div>

        {/* Token Economics (if available) */}
        {metrics.agentStatsAvailable && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard
              icon="🪙"
              label="Total Tokens Issued"
              value={metrics.totalTokensIssued.toLocaleString()}
            />
            <MetricCard
              icon="💰"
              label="Tokens in Circulation"
              value={metrics.tokensInCirculation.toLocaleString()}
            />
          </div>
        )}

        {/* Consultation Volume Chart */}
        {metrics.consultationTrend && metrics.consultationTrend.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Consultation Volume (Last 30 Days)</h3>
            <div className="h-32 flex items-end space-x-1">
              {metrics.consultationTrend.map((day, idx) => {
                const maxCount = Math.max(...metrics.consultationTrend.map(d => d.count));
                const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                    style={{ height: `${height}%`, minHeight: day.count > 0 ? '4px' : '0' }}
                    title={`${day.date}: ${day.count} consultations`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {!metrics.agentStatsAvailable && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            ⚠️ Agent statistics unavailable. aequos-agents backend may be offline.
          </div>
        )}
      </div>
    </div>
  );
}
