import React, { useState, useEffect } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import { Waypoint } from '@waypoint/domain';

export const DriverShell: React.FC = () => {
  const { t } = useI18n();
  const { waypoints, enqueueWaypointMutation } = useSync();
  const { currentUser } = useAuth();

  const driverTasks = waypoints.filter(
    (w) => w.assignedRole === 'driver' || w.status === 'assigned' || w.status === 'in_progress'
  );

  const activeTask = driverTasks.find((w) => w.status === 'in_progress') || driverTasks[0];

  const [etaInfo, setEtaInfo] = useState<{ duration: number; distance: number } | null>(null);

  useEffect(() => {
    if (activeTask) {
      // Predict ETA using ML inference
      fetch('/ml/api/v1/predict/eta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_lat: 6.9271, // Colombo Hub
          origin_lng: 79.8612,
          destination_lat: activeTask.latitude,
          destination_lng: activeTask.longitude,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setEtaInfo({ duration: data.duration_minutes, distance: data.distance_km });
          } else {
            setEtaInfo({ duration: 45, distance: 32.5 });
          }
        })
        .catch(() => {
          setEtaInfo({ duration: 45, distance: 32.5 });
        });
    }
  }, [activeTask?.id]);

  const handleStatusChange = async (task: Waypoint, status: any) => {
    await enqueueWaypointMutation('UPDATE', {
      id: task.id,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="driver-shell">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--wp-role-driver-accent)' }}>
          🚚 {t('shells.driver.title', 'Driver Cockpit')}
        </h1>
        <p style={{ color: 'var(--wp-text-secondary)', fontSize: '0.9rem' }}>
          Driver: <strong>{currentUser.name}</strong> • Active Navigation & Delivery Mode
        </p>
      </div>

      {activeTask ? (
        <div className="card" style={{ border: '2px solid var(--wp-role-driver-accent)', background: 'var(--wp-role-driver-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wp-role-driver-text)', textTransform: 'uppercase' }}>
              {t('shells.driver.current_stop', 'Current Active Waypoint')}
            </span>
            <span className={`status-chip ${activeTask.status}`}>{activeTask.status}</span>
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
            {activeTask.title}
          </h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--wp-text-secondary)', marginBottom: '16px' }}>
            {activeTask.description || 'Deliver assigned cargo and collect recipient confirmation.'}
          </p>

          {/* ML ETA Infobox */}
          {etaInfo && (
            <div style={{ display: 'flex', gap: '20px', background: 'white', padding: '16px', borderRadius: '8px', marginBottom: '20px', boxShadow: 'var(--wp-shadow-sm)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--wp-text-secondary)' }}>ML Predicted Duration</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--wp-role-driver-accent)' }}>
                  ~{etaInfo.duration} mins
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--wp-border-subtle)', paddingLeft: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--wp-text-secondary)' }}>Remaining Distance</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {etaInfo.distance} km
                </div>
              </div>
            </div>
          )}

          {/* Driver Actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${activeTask.latitude},${activeTask.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            >
              🧭 Open GPS Navigation
            </a>

            {activeTask.status !== 'in_progress' ? (
              <button
                className="btn-primary"
                style={{ background: 'var(--wp-role-driver-accent)' }}
                onClick={() => handleStatusChange(activeTask, 'in_progress')}
              >
                ▶ Start Route to Waypoint
              </button>
            ) : (
              <button
                className="btn-primary"
                style={{ background: '#10b981' }}
                onClick={() => handleStatusChange(activeTask, 'completed')}
              >
                ✓ {t('shells.driver.complete_stop', 'Complete Stop (Drop-off)')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          No driver waypoints currently assigned.
        </div>
      )}

      {/* Driver Upcoming Stops */}
      <div className="card">
        <div className="card-title">
          <span>Upcoming Route Stops ({driverTasks.length})</span>
        </div>

        <div>
          {driverTasks.map((task, idx) => (
            <div key={task.id} className="waypoint-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--wp-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                  {idx + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{task.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--wp-text-secondary)' }}>
                    Coords: {task.latitude.toFixed(4)}, {task.longitude.toFixed(4)}
                  </div>
                </div>
              </div>
              <span className={`status-chip ${task.status}`}>{task.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
