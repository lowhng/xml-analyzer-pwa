import React, { useState, useMemo } from 'react';
import { fieldsToCSV } from '../utils/xmlParser';

// Tooltip component
const Tooltip = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && <span className="tooltip">{text}</span>}
    </span>
  );
};

// Header with tooltip helper
const HeaderWithTooltip = ({ title, tooltip }) => {
  return (
    <th>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {title}
        <Tooltip text={tooltip}>
          <span className="tooltip-icon" title={tooltip}>?</span>
        </Tooltip>
      </span>
    </th>
  );
};

function FieldsViewer({ file }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNested, setFilterNested] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState(new Set());

  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Get all visible fields for counting
  const allVisibleFields = useMemo(() => {
    const visible = [];
    
    function collectVisible(fields, depth = 0) {
      fields.forEach(field => {
        const matchesSearch = field.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = !filterNested || field.isNested;
        
        if (matchesSearch && matchesFilter) {
          visible.push(field);
        }
        
        // If field is expanded or has no children, check descendants
        const isExpanded = expandedPaths.has(field.path);
        if (isExpanded || !field.hasChildren) {
          const children = file.fields.filter(child => 
            child.path.startsWith(field.path + ' > ') && 
            child.depth === depth + 1
          );
          collectVisible(children, depth + 1);
        }
      });
    }
    
    const rootFields = file.fields.filter(f => f.depth === 0);
    collectVisible(rootFields);
    
    return visible;
  }, [file.fields, searchTerm, filterNested, expandedPaths]);

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

  // Render fields recursively
  const renderFieldRows = (fields, depth = 0) => {
    return fields.map(field => {
      const isExpanded = expandedPaths.has(field.path);
      const hasChildren = field.hasChildren;
      
      // Get direct children
      const children = file.fields.filter(f => 
        f.path.startsWith(field.path + ' > ') && 
        f.depth === depth + 1
      );

      const matchesSearch = field.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = !filterNested || field.isNested;
      
      // Check if this field or any of its descendants match
      const hasMatchingDescendants = children.some(child => {
        const childMatchesSearch = child.name.toLowerCase().includes(searchTerm.toLowerCase());
        const childMatchesFilter = !filterNested || child.isNested;
        return childMatchesSearch && childMatchesFilter;
      }) || (hasChildren && file.fields.some(f => 
        f.path.startsWith(field.path + ' > ') && 
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (!filterNested || f.isNested)
      ));

      if (!matchesSearch && !hasMatchingDescendants) {
        return null;
      }

      const indent = depth * 24;

      return (
        <React.Fragment key={field.path}>
          {matchesSearch && (
            <tr className="field-row" style={{ backgroundColor: depth % 2 === 0 ? 'var(--surface-color)' : 'rgba(0,0,0,0.02)' }}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: `${indent}px` }}>
                  {hasChildren && children.length > 0 && (
                    <button
                      className="expand-toggle"
                      onClick={() => toggleExpand(field.path)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        marginRight: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text-secondary)',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.color = 'var(--primary-color)'}
                      onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <span style={{ fontSize: '0.75rem', userSelect: 'none', width: '12px', display: 'inline-block' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </button>
                  )}
                  {!hasChildren && <span style={{ width: '1.75rem', display: 'inline-block' }} />}
                  <code style={{ backgroundColor: 'var(--bg-color)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                    {field.name}
                  </code>
                </div>
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
          )}
          {hasChildren && isExpanded && children.length > 0 && renderFieldRows(children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  const rootFields = file.fields.filter(f => f.depth === 0);
  const renderedRows = renderFieldRows(rootFields, 0);

  return (
    <div className="fields-viewer">
      <div className="fields-header">
        <h2>Fields ({allVisibleFields.length})</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="export-btn"
            onClick={() => {
              // Expand all when showing all
              const allPaths = new Set(file.fields.filter(f => f.hasChildren).map(f => f.path));
              setExpandedPaths(allPaths);
            }}
            style={{ 
              backgroundColor: 'var(--primary-color)',
              fontSize: '0.75rem',
              padding: '0.5rem 0.75rem',
            }}
          >
            Expand All
          </button>
          <button
            className="export-btn"
            onClick={() => setExpandedPaths(new Set())}
            style={{ 
              backgroundColor: 'var(--text-secondary)',
              fontSize: '0.75rem',
              padding: '0.5rem 0.75rem',
            }}
          >
            Collapse All
          </button>
          <button className="export-btn" onClick={handleExportCSV}>
            📥 Export to CSV
          </button>
        </div>
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

      <div style={{ overflowX: 'auto' }}>
        <table className="fields-table">
          <thead>
            <tr>
              <th>Field Name</th>
              <HeaderWithTooltip
                title="Depth"
                tooltip="The nesting level of this field in the XML hierarchy. Root elements have depth 0, their children have depth 1, and so on."
              />
              <HeaderWithTooltip
                title="Nesting"
                tooltip="Indicates whether this field contains nested child elements within it."
              />
              <HeaderWithTooltip
                title="Children"
                tooltip="Shows the number of direct child elements this field contains."
              />
              <HeaderWithTooltip
                title="Has Text"
                tooltip="Indicates whether this field contains text content (not just child elements)."
              />
              <HeaderWithTooltip
                title="Attributes"
                tooltip="Lists any XML attributes defined on this field (e.g., id, class, type)."
              />
              <HeaderWithTooltip
                title="Occurrences"
                tooltip="The total number of times this field appears in the XML document."
              />
            </tr>
          </thead>
          <tbody>
            {renderedRows}
          </tbody>
        </table>
      </div>

      {allVisibleFields.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No fields match your search criteria
        </div>
      )}
    </div>
  );
}

export default FieldsViewer;
