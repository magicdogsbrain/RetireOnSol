import './Monitor.css';

export function Monitor() {
  return (
    <div className="monitor card">
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h2>No Active Plan</h2>
        <p>Execute a plan from the Plan tab to start tracking your progress.</p>
        <button className="btn-primary" onClick={() => window.location.hash = '#plan'}>
          Create Plan
        </button>
      </div>
    </div>
  );
}
