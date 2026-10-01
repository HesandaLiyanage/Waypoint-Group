import React, { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import { Waypoint } from '@waypoint/domain';

export const FieldAgentShell: React.FC = () => {
  const { t } = useI18n();
  const { waypoints, enqueueWaypointMutation, isOnline, pendingCount } = useSync();
  const { currentUser } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Waypoint | null>(null);
  const [findingText, setFindingText] = useState('');

  const myTasks = waypoints.filter(
    (w) => w.assignedRole === 'field_agent' || !w.assignedRole
  );

  const handleUpdateStatus = async (task: Waypoint, newStatus: any) => {
    await enqueueWaypointMutation('UPDATE', {
      id: task.id,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    await enqueueWaypointMutation('UPDATE', {
      id: selectedTask.id,
      notes: `${selectedTask.notes ? selectedTask.notes + ' | ' : ''}${findingText}`,
      updatedAt: new Date().toISOString(),
    });

    setFindingText('');
    alert('Observation saved to local offline store and queued for sync!');
  };

  return (
    <div className="field-agent-shell">
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--wp-role-field-accent)' }}>
          📋 {t('shells.field_agent.title', 'Field Inspection Shell')}
        </h1>
        <p style={{ color: 'var(--wp-text-secondary)', fontSize: '0.9rem' }}>
          Agent: <strong>{currentUser.name}</strong> • Offline-Ready Field Mode
        </p>
      </div>

      {!isOnline && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #a7f3d0' }}>
          <span>🛡️</span>
          <span><strong>{t('shells.field_agent.offline_ready', 'Data saved locally')}:</strong> All inspections and changes are stored in IndexedDB and will auto-sync when network returns ({pendingCount} pending).</span>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <span>{t('shells.field_agent.my_tasks', 'Assigned Field Tasks')} ({myTasks.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: selectedTask?.id === task.id ? '2px solid var(--wp-role-field-accent)' : '1px solid var(--wp-border-subtle)',
                  background: selectedTask?.id === task.id ? 'var(--wp-role-field-bg)' : 'white',
                  cursor: 'pointer',
                  transition: 'border 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{task.title}</h3>
                  <span className={`status-chip ${task.status}`}>{task.status}</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--wp-text-secondary)', margin: '6px 0' }}>
                  {task.description}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--wp-text-muted)' }}>
                  📍 {task.latitude.toFixed(4)}, {task.longitude.toFixed(4)}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  {task.status !== 'in_progress' && (
                    <button
                      className="btn-outline"
                      style={{ fontSize: '0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(task, 'in_progress');
                      }}
                    >
                      ▶ Start Inspection
                    </button>
                  )}
                  {task.status !== 'completed' && (
                    <button
                      className="btn-outline"
                      style={{ fontSize: '0.75rem', color: '#16a34a', borderColor: '#16a34a' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateStatus(task, 'completed');
                      }}
                    >
                      ✓ Mark Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Task Details & Observation Form */}
        <div className="card">
          <div className="card-title">
            <span>{selectedTask ? selectedTask.title : 'Task Inspection Details'}</span>
          </div>

          {selectedTask ? (
            <div>
              <div style={{ marginBottom: '16px', fontSize: '0.9rem' }}>
                <p><strong>Status:</strong> {selectedTask.status}</p>
                <p><strong>GPS Location:</strong> {selectedTask.latitude}, {selectedTask.longitude}</p>
                {selectedTask.notes && (
                  <p style={{ marginTop: '8px', padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                    <strong>Recorded Observations:</strong> {selectedTask.notes}
                  </p>
                )}
              </div>

              <form onSubmit={handleSaveObservation} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {t('shells.field_agent.record_finding', 'Record Observation / Audit Finding')}
                </label>
                <textarea
                  required
                  rows={4}
                  value={findingText}
                  onChange={(e) => setFindingText(e.target.value)}
                  placeholder="Enter condition notes, seal numbers, environmental factors..."
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--wp-border-strong)' }}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: 'var(--wp-role-field-accent)' }}
                >
                  Save Finding (Queues to Outbox)
                </button>
              </form>
            </div>
          ) : (
            <div style={{ color: 'var(--wp-text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              Select an inspection task from the list to record field notes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
