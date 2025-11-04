import React from 'react';

function Statistics({ file }) {
  const stats = file.stats;

  return (
    <div className="statistics">
      <div className="stat-card">
        <div className="stat-label">Total Fields</div>
        <div className="stat-value">{stats.totalFields}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Unique Field Names</div>
        <div className="stat-value">{stats.uniqueFieldNames}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Max Nesting Depth</div>
        <div className="stat-value">{stats.maxDepth}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Nested Fields</div>
        <div className="stat-value">{stats.nestedFields}</div>
      </div>
    </div>
  );
}

export default Statistics;
