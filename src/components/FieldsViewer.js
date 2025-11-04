import React, { useState } from 'react';
import { fieldsToCSV } from '../utils/xmlParser';

function FieldsViewer({ file }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNested, setFilterNested] = useState(false);

  const filteredFields = file.fields.filter(field => {
    const matchesSearch = field.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterNested || field.isNested;
    return matchesSearch && matchesFilter;
  });

  const handleExportCSV = () => {
    const csv = fieldsToCSV(file.fields, file.filename);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${file.filename.replace('.xml', '')}_fields.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fields-viewer">
      <div className="fields-header">
        <h2>Fields ({filteredFields.length})</h2>
        <button className="export-btn" onClick={handleExportCSV}>
          📥 Export to CSV
        </button>
      </div>

      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)' }}>
        <input
          type="text"
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '0.5rem',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={filterNested}
            onChange={(e) => setFilterNested(e.target.checked)}
          />
          Show nested fields only
        </label>
      </div>

      <table className="fields-table">
        <thead>
          <tr>
            <th>Field Name</th>
            <th>Depth</th>
            <th>Nesting</th>
            <th>Children</th>
            <th>Has Text</th>
            <th>Attributes</th>
            <th>Occurrences</th>
          </tr>
        </thead>
        <tbody>
          {filteredFields.map((field, index) => (
            <tr key={`${field.name}-${index}`}>
              <td>
                <code style={{ backgroundColor: 'var(--bg-color)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                  {field.name}
                </code>
              </td>
              <td>
                <span className="nesting-indicator">{field.depth}</span>
              </td>
              <td>
                {field.isNested && <span className="field-badge badge-nested">Nested</span>}
              </td>
              <td>
                {field.hasChildren && (
                  <span className="field-badge badge-children">{field.childCount} child{field.childCount !== 1 ? 'ren' : ''}</span>
                )}
              </td>
              <td>
                {field.hasText && <span className="field-badge badge-text">Text</span>}
              </td>
              <td>
                {field.attributes.length > 0 ? field.attributes.join(', ') : '—'}
              </td>
              <td>{field.occurrences}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredFields.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No fields match your search criteria
        </div>
      )}
    </div>
  );
}

export default FieldsViewer;
