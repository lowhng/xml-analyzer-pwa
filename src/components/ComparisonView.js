import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { comparisonToExcel, compareFields, mergeFieldsFromFiles, removePrefixFromFieldName, removePrefixFromPath } from '../utils/xmlParser';

// Component to render hierarchical field list
function HierarchicalFieldList({ fields, expandedPaths, setExpandedPaths, type, totalFiles, prefixToRemove = '' }) {
  const toggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Build a tree structure from flat field list
  const fieldTree = useMemo(() => {
    const tree = [];
    const fieldMap = new Map();
    const rootNodes = new Set();

    // First pass: create all nodes and identify root nodes
    // Preserve original order from fields array
    fields.forEach(field => {
      const node = {
        ...field,
        children: []
      };
      fieldMap.set(field.path, node);
      rootNodes.add(field.path);
    });

    // Second pass: build parent-child relationships
    // Process fields in their original order to maintain XML structure
    fields.forEach(field => {
      const node = fieldMap.get(field.path);
      // Find parent path (everything before the last " > ")
      const lastSeparator = field.path.lastIndexOf(' > ');
      if (lastSeparator !== -1) {
        const parentPath = field.path.substring(0, lastSeparator);
        const parent = fieldMap.get(parentPath);
        if (parent) {
          // Parent exists in this list, add as child and remove from root
          parent.children.push(node);
          rootNodes.delete(field.path);
        }
        // If parent doesn't exist, keep as root node
      }
      // If no separator, it's already a root node
    });

    // Build tree from root nodes - maintain order using orderIndex
    const rootArray = Array.from(rootNodes).map(path => fieldMap.get(path));
    rootArray.sort((a, b) => {
      const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
      const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
      return orderA - orderB;
    });
    tree.push(...rootArray);

    // Sort function for nodes - maintain XML order using orderIndex
    // orderIndex is relative to parent, so we compare it for siblings (same parentPath)
    const sortNodes = (nodes) => {
      return nodes.sort((a, b) => {
        // If they have the same parent, sort by orderIndex (XML order)
        if (a.parentPath === b.parentPath) {
          const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
          const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
          if (orderA !== orderB) return orderA - orderB;
        }
        // If different parents or same orderIndex, sort by depth first
        if (a.depth !== b.depth) return a.depth - b.depth;
        // Final fallback: path comparison
        return a.path.localeCompare(b.path);
      }).map(node => {
        if (node.children.length > 0) {
          node.children = sortNodes(node.children);
        }
        return node;
      });
    };

    return sortNodes(tree);
  }, [fields]);

  const renderField = (field, depth = 0) => {
    const isExpanded = expandedPaths.has(field.path);
    const hasChildren = field.children && field.children.length > 0;
    const indent = depth * 24; // Code-like indentation (24px per level)

    return (
      <React.Fragment key={field.path}>
        <li className={`field-list-item ${type}`} style={{ paddingLeft: `${indent}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasChildren && (
              <button
                onClick={() => toggleExpand(field.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
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
            <code>{removePrefixFromFieldName(field.name, prefixToRemove)}</code>
            {field.presentInFiles && totalFiles && field.presentInFiles.length < totalFiles && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--primary-color)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  marginLeft: '0.5rem',
                  cursor: 'help',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  display: 'inline-block'
                }}
                title={`Present in: ${field.presentInFiles.join(', ')}`}
              >
                {field.presentInFiles.length}/{totalFiles} files
              </span>
            )}
            {field.structuralDifference && (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--warning-color)',
                  fontWeight: 'bold',
                  marginLeft: '0.25rem',
                  cursor: 'help'
                }}
                title={(() => {
                  const parts = [];
                  parts.push('Structural difference: This field exists in all files but at different paths.');
                  if (field.alternativePathsWithFiles && field.alternativePathsWithFiles.length > 0) {
                    parts.push('\n\nAlternative paths:');
                    field.alternativePathsWithFiles.forEach(({ path, files }) => {
                      parts.push(`\n  • ${removePrefixFromPath(path, prefixToRemove)} (in: ${files.join(', ')})`);
                    });
                  }
                  return parts.join('');
                })()}
              >
                ⚠️
              </span>
            )}
            {field.path !== field.name && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                ({removePrefixFromPath(field.path, prefixToRemove)})
              </span>
            )}
          </div>
        </li>
        {hasChildren && isExpanded && field.children.map(child => renderField(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <ul className="field-list">
      {fieldTree.map(field => renderField(field, 0))}
    </ul>
  );
}

// Reusable Summary Table Component for Split View
function SummaryTablePanel({
  title,
  summaryRows,
  aggregation,
  summaryMode,
  prefixToRemove,
  expandedRowKey,
  onRowClick,
  showAllValues,
  onToggleShowAll,
  visibleCount = 100,
  hideDepth = false, // For split view - remove depth column
}) {
  const visibleRows = summaryRows.slice(0, visibleCount);
  // Grid template: Field Name | Depth (if not hidden) | Files | Presence | Occurrences
  // Make Field Name column wider to prevent "snake" layout and keep columns aligned
  // Use fixed widths for numeric columns to ensure alignment
  const gridColumns = hideDepth 
    ? 'minmax(280px, 1fr) 90px 90px 110px' 
    : (summaryMode === 'hierarchical' ? 'minmax(140px, 2fr) 50px 60px 70px 100px' : 'minmax(140px, 2fr) 60px 70px 100px');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>
        {title}
      </h4>
      <div className="summary-cards" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="summary-card">
          <div className="card-label">Files</div>
          <div className="card-value" style={{ fontSize: '1.5rem' }}>{aggregation.filesCount}</div>
        </div>
        <div className="summary-card">
          <div className="card-label">Unique Fields</div>
          <div className="card-value" style={{ fontSize: '1.5rem' }}>{aggregation.uniqueFieldNames}</div>
        </div>
      </div>
      <div className="summary-table" style={{ flex: 1, overflow: 'auto', overflowX: 'auto' }}>
        <div className="summary-table-header" style={{ gridTemplateColumns: gridColumns, position: 'sticky', top: 0, backgroundColor: 'var(--bg-color)', zIndex: 10 }}>
          <div>Field Name</div>
          {summaryMode === 'hierarchical' && !hideDepth && <div>Depth</div>}
          <div>Files</div>
          <div>Presence</div>
          <div>Occurrences</div>
        </div>
        {visibleRows.map(item => {
          const rowKey = item.uniqueKey || item.fieldName;
          const isExpanded = expandedRowKey === rowKey;
          const valueCounts = item.valueCounts || [];
          const showAllValuesForRow = !!showAllValues[rowKey];
          const displayedValueCounts = showAllValuesForRow ? valueCounts : valueCounts.slice(0, 5);
          const hasAdditionalValues = valueCounts.length > 5;
          const hasValues = valueCounts.length > 0;
          const indentLevel = summaryMode === 'hierarchical' ? Math.max(item.depth || 0, 0) : 0;
          const depthDisplay = typeof item.depth === 'number' ? item.depth : (item.pathSegments ? item.pathSegments.length - 1 : 0);
          const rowClassNames = [
            'summary-table-row',
            'summary-table-row--interactive',
            isExpanded ? 'expanded' : '',
            summaryMode === 'hierarchical' && item.hasChildren ? 'summary-table-row--hierarchical' : '',
          ].filter(Boolean).join(' ');

          const handleToggleShowAll = (event) => {
            event.stopPropagation();
            if (onToggleShowAll) {
              onToggleShowAll(rowKey);
            }
          };

          return (
            <React.Fragment key={rowKey}>
              <div
                className={rowClassNames}
                role="button"
                tabIndex={0}
                onClick={() => onRowClick && onRowClick(rowKey)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick && onRowClick(rowKey);
                  }
                }}
                aria-expanded={isExpanded}
                style={{ gridTemplateColumns: gridColumns, display: 'grid' }}
              >
                <div className={`summary-field-name ${summaryMode === 'hierarchical' ? 'summary-field-name--hierarchy' : ''}`}>
                  {summaryMode === 'hierarchical' && indentLevel > 0 && (
                    <span
                      className="summary-hierarchy-offset"
                      style={{ width: `${indentLevel * 1.25}rem` }}
                      aria-hidden="true"
                    >
                      <span className="summary-hierarchy-marker" />
                    </span>
                  )}
                  <span className={`summary-row-caret ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <code>{removePrefixFromFieldName(item.fieldName, prefixToRemove)}</code>
                  {hasValues && (
                    <span className="summary-field-pill" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                      {item.uniqueValuesCount} value{item.uniqueValuesCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {summaryMode === 'hierarchical' && !hideDepth && (
                  <div className="summary-depth" style={{ fontSize: '0.8rem' }}>
                    {depthDisplay}
                  </div>
                )}
                <div className="summary-files-count" style={{ fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                  {item.filesWithField}/{aggregation.filesCount}
                </div>
                <div className="summary-presence" style={{ fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                  {item.presencePercent.toFixed(0)}%
                </div>
                <div className="summary-occurrences" style={{ fontSize: '0.85rem', textAlign: 'center', fontWeight: 600, display: 'block' }}>
                  {item.totalOccurrences}
                </div>
              </div>

              {isExpanded && (
                <div className="summary-row-details" style={{ gridColumn: '1 / -1', padding: '0.75rem 1rem' }}>
                  <div className="summary-values-header" style={{ fontSize: '0.8rem' }}>
                    <span>
                      <strong>Unique values:</strong> {item.uniqueValuesCount}
                    </span>
                    <span>
                      <strong>Total occurrences:</strong> {item.totalOccurrences}
                    </span>
                  </div>

                  {summaryMode === 'hierarchical' && item.path && (
                    <div className="summary-path-detail" style={{ fontSize: '0.75rem' }}>
                      <strong>Path:</strong> {removePrefixFromPath(item.path, prefixToRemove)}
                    </div>
                  )}

                  {hasValues ? (
                    <>
                      <ul className="summary-values-list" style={{ fontSize: '0.8rem' }}>
                        {displayedValueCounts.map((valueInfo, index) => {
                          const valueLabel = valueInfo.value === '' ? '(empty)' : valueInfo.value;
                          const percentageLabel = valueInfo.percentage != null
                            ? `${valueInfo.percentage.toFixed(1)}%`
                            : '—';
                          return (
                            <li className="summary-value-item" key={`${item.fieldName}-${index}-${valueInfo.value}`} style={{ padding: '0.5rem 0.75rem' }}>
                              <div className="summary-value-info">
                                <span className="summary-value-rank">{index + 1}.</span>
                                <span className="summary-value-text" title={valueLabel} style={{ maxWidth: '200px' }}>
                                  {valueLabel}
                                </span>
                              </div>
                              <div className="summary-value-stats" style={{ fontSize: '0.75rem' }}>
                                <span className="summary-value-count">
                                  {valueInfo.count} occurrence{valueInfo.count === 1 ? '' : 's'}
                                </span>
                                <span className="summary-value-percentage">
                                  {percentageLabel}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {hasAdditionalValues && (
                        <button
                          type="button"
                          className="summary-values-toggle"
                          onClick={handleToggleShowAll}
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                        >
                          {showAllValuesForRow
                            ? 'Show top 5'
                            : `Show all ${valueCounts.length} values`}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="summary-no-values" style={{ fontSize: '0.8rem' }}>
                      No text values were captured for this field.
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// Reusable Filter Panel Component
function FilterPanel({ 
  title, 
  filters, 
  setFilters, 
  availableFields, 
  prefixToRemove, 
  activeFilters, 
  matchingFilesCount, 
  totalFilesCount,
  createEmptyFilter,
  MAX_FILTERS 
}) {
  const hasAnyFilterInput = useMemo(
    () =>
      filters.some(
        filter =>
          filter.field ||
          filter.value.trim() !== '' ||
          filter.caseSensitive
      ),
    [filters]
  );

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h3>{title}</h3>
        {activeFilters.length > 0 && (
          <span className="filter-panel-count">
            {matchingFilesCount} of {totalFilesCount} files
          </span>
        )}
      </div>
      {filters.map((filter, index) => (
        <div className="filter-row" key={filter.id}>
          <div className="filter-group">
            <label htmlFor={`filter-field-${filter.id}`}>
              Field{filters.length > 1 ? ` ${index + 1}` : ''}
            </label>
            <select
              id={`filter-field-${filter.id}`}
              value={filter.field}
              onChange={(e) => {
                const value = e.target.value;
                setFilters(prev =>
                  prev.map(f => f.id === filter.id ? { ...f, field: value, value: value ? f.value : '', caseSensitive: f.caseSensitive } : f)
                );
              }}
            >
              <option value="">All fields</option>
              {availableFields.map(fieldName => (
                <option key={fieldName} value={fieldName}>
                  {fieldName}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group filter-value-group">
            <label htmlFor={`filter-value-${filter.id}`}>Value</label>
            <div className="filter-value-controls">
              <input
                id={`filter-value-${filter.id}`}
                type="text"
                placeholder="Enter field value (use * for wildcards: *ABC, ABC*, A*BC)"
                value={filter.value}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilters(prev =>
                    prev.map(f => f.id === filter.id ? { ...f, value } : f)
                  );
                }}
                disabled={!filter.field}
              />
              <label className="filter-case-sensitive">
                <input
                  type="checkbox"
                  checked={filter.caseSensitive}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setFilters(prev =>
                      prev.map(f => f.id === filter.id ? { ...f, caseSensitive: value } : f)
                    );
                  }}
                />
                Case sensitive
              </label>
            </div>
          </div>

          {filters.length > 1 && (
            <button
              className="filter-remove-btn"
              onClick={() => {
                setFilters(prev => {
                  if (prev.length === 1) {
                    return prev;
                  }
                  return prev.filter(f => f.id !== filter.id);
                });
              }}
              title="Remove this filter"
              type="button"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="filter-actions">
        <button
          className="filter-add-btn"
          onClick={() => {
            setFilters(prev => {
              if (prev.length >= MAX_FILTERS) {
                return prev;
              }
              return [...prev, createEmptyFilter()];
            });
          }}
          disabled={filters.length >= MAX_FILTERS}
          title={filters.length >= MAX_FILTERS ? `You can add up to ${MAX_FILTERS} filters.` : undefined}
          type="button"
        >
          + Add another filter
        </button>
        <button
          className="filter-clear-btn"
          onClick={() => setFilters([createEmptyFilter()])}
          disabled={!hasAnyFilterInput}
          type="button"
        >
          Clear Filters
        </button>
      </div>

      {activeFilters.length > 0 && (
        <div className="filter-summary">
          {matchingFilesCount === 0 ? (
            <span>
              No files match the selected filters:{' '}
              {activeFilters.map(filter => (
                <span key={filter.id}>
                  <code>{removePrefixFromFieldName(filter.field, prefixToRemove)}</code> = "<span>{filter.trimmedValue}</span>"{filter.caseSensitive ? ' (case sensitive)' : ''}
                </span>
              )).reduce((acc, element, idx) => (
                idx === 0 ? [element] : [...acc, ', ', element]
              ), [])}
            </span>
          ) : (
            <span>
              Showing {matchingFilesCount} of {totalFilesCount} files where{' '}
              {activeFilters.map(filter => (
                <span key={filter.id}>
                  <code>{removePrefixFromFieldName(filter.field, prefixToRemove)}</code> = "<span>{filter.trimmedValue}</span>"{filter.caseSensitive ? ' (case sensitive)' : ''}
                </span>
              )).reduce((acc, element, idx) => (
                idx === 0 ? [element] : [...acc, ' and ', element]
              ), [])}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonView({ comparison, files, filters: filtersProp, setFilters: setFiltersProp, prefixToRemove = '', setPrefixToRemove }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [summaryMode, setSummaryMode] = useState('hierarchical');
  const [summarySearch, setSummarySearch] = useState('');
  const [summaryVisibleCount, setSummaryVisibleCount] = useState(100);
  const [expandedSummaryRowKey, setExpandedSummaryRowKey] = useState(null);
  const [showAllSummaryValues, setShowAllSummaryValues] = useState({});
  
  const createEmptyFilter = () => ({
    id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: '',
    value: '',
    caseSensitive: false,
  });
  const MAX_FILTERS = 5;
  
  // Filter comparison state
  const [filterComparisonMode, setFilterComparisonMode] = useState(false);
  const [filtersA, setFiltersA] = useState(() => [createEmptyFilter()]);
  const [filtersB, setFiltersB] = useState(() => [createEmptyFilter()]);
  const [comparisonViewMode, setComparisonViewMode] = useState('split'); // 'split' or 'diff'
  const [expandedRowKeyA, setExpandedRowKeyA] = useState(null);
  const [expandedRowKeyB, setExpandedRowKeyB] = useState(null);
  const [showAllSummaryValuesA, setShowAllSummaryValuesA] = useState({});
  const [showAllSummaryValuesB, setShowAllSummaryValuesB] = useState({});
  // Use local state as fallback if props are not provided (for backward compatibility)
  const [localFilters, setLocalFilters] = useState(() => [createEmptyFilter()]);
  // Use filters from props if provided, otherwise fall back to local state
  const filters = filtersProp !== undefined ? filtersProp : localFilters;
  const setFilters = setFiltersProp !== undefined ? setFiltersProp : setLocalFilters;

  const activeFilters = useMemo(() => {
    return filters
      .map(filter => {
        const trimmedValue = filter.value.trim();
        if (!filter.field || trimmedValue === '') {
          return null;
        }
        return {
          ...filter,
          trimmedValue,
        };
      })
      .filter(Boolean);
  }, [filters]);

  const isFilterActive = activeFilters.length > 0;
  const hasAnyFilterInput = useMemo(
    () =>
      filters.some(
        filter =>
          filter.field ||
          filter.value.trim() !== '' ||
          filter.caseSensitive
      ),
    [filters]
  );

  const availableFields = useMemo(() => {
    const fieldNames = new Set();

    files.forEach(file => {
      file.fields.forEach(field => {
        const textValue = field.textContent ? field.textContent.trim() : '';
        if (textValue.length > 0) {
          // Normalize field name for comparison (remove prefix if specified)
          const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
          fieldNames.add(normalizedName);
        }
      });
    });

    return Array.from(fieldNames).sort((a, b) => a.localeCompare(b));
  }, [files, prefixToRemove]);

  // Helper function to convert wildcard pattern to regex
  // Supports patterns like: *ABC, ABC*, A*BC, etc.
  const wildcardToRegex = useCallback((pattern) => {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with .* for regex
    const regexPattern = escaped.replace(/\*/g, '.*');
    // Anchor to start and end for full match
    return new RegExp(`^${regexPattern}$`);
  }, []);

  // Helper function to check if a value matches a pattern (supports wildcards)
  const matchesPattern = useCallback((value, pattern, caseSensitive) => {
    const normalizedValue = caseSensitive ? value : value.toLowerCase();
    const normalizedPattern = caseSensitive ? pattern : pattern.toLowerCase();
    
    // Check if pattern contains wildcard
    if (normalizedPattern.includes('*')) {
      const regex = wildcardToRegex(normalizedPattern);
      return regex.test(normalizedValue);
    }
    // Exact match if no wildcard
    return normalizedValue === normalizedPattern;
  }, [wildcardToRegex]);

  // Helper function to compute active filters from filter array
  const computeActiveFilters = useCallback((filterArray) => {
    return filterArray
      .map(filter => {
        const trimmedValue = filter.value.trim();
        if (!filter.field || trimmedValue === '') {
          return null;
        }
        return {
          ...filter,
          trimmedValue,
        };
      })
      .filter(Boolean);
  }, []);

  // Helper function to filter files based on active filters
  const filterFilesByActiveFilters = useCallback((fileArray, activeFilterArray) => {
    if (activeFilterArray.length === 0) {
      return fileArray;
    }

    return fileArray.filter(file =>
      activeFilterArray.every(filterCondition => {
        return file.fields.some(field => {
          const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
          if (normalizedFieldName !== filterCondition.field) {
            return false;
          }

          // Check valueCounts first (contains all values from all occurrences)
          if (field.valueCounts && typeof field.valueCounts === 'object') {
            const valueCountsKeys = Object.keys(field.valueCounts);
            // Check if any value in valueCounts matches the filter pattern
            for (const valueKey of valueCountsKeys) {
              const trimmedValue = valueKey ? valueKey.trim() : '';
              if (trimmedValue.length > 0) {
                if (matchesPattern(trimmedValue, filterCondition.trimmedValue, filterCondition.caseSensitive)) {
                  return true;
                }
              }
            }
          }

          // Fallback to textContent for backward compatibility (first occurrence)
          const textValue = field.textContent ? field.textContent.trim() : '';
          if (textValue.length === 0) {
            return false;
          }

          return matchesPattern(textValue, filterCondition.trimmedValue, filterCondition.caseSensitive);
        });
      })
    );
  }, [prefixToRemove, matchesPattern]);

  const filteredFiles = useMemo(() => {
    if (!isFilterActive) {
      return files;
    }

    return files.filter(file =>
      activeFilters.every(filterCondition => {
        return file.fields.some(field => {
          // Normalize field name for comparison
          const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
          if (normalizedFieldName !== filterCondition.field) {
            return false;
          }

          // Check valueCounts first (contains all values from all occurrences)
          if (field.valueCounts && typeof field.valueCounts === 'object') {
            const valueCountsKeys = Object.keys(field.valueCounts);
            // Check if any value in valueCounts matches the filter pattern
            for (const valueKey of valueCountsKeys) {
              const trimmedValue = valueKey ? valueKey.trim() : '';
              if (trimmedValue.length > 0) {
                if (matchesPattern(trimmedValue, filterCondition.trimmedValue, filterCondition.caseSensitive)) {
                  return true;
                }
              }
            }
          }

          // Fallback to textContent for backward compatibility (first occurrence)
          const textValue = field.textContent ? field.textContent.trim() : '';
          if (textValue.length === 0) {
            return false;
          }

          return matchesPattern(textValue, filterCondition.trimmedValue, filterCondition.caseSensitive);
        });
      })
    );
  }, [files, isFilterActive, activeFilters, prefixToRemove, matchesPattern]);

  const comparisonFiles = filteredFiles;

  const activeComparison = useMemo(() => {
    if (!isFilterActive) {
      return comparison;
    }
    return compareFields(comparisonFiles, prefixToRemove);
  }, [comparison, comparisonFiles, isFilterActive, prefixToRemove]);

  // Filter comparison computations
  const activeFiltersA = useMemo(() => computeActiveFilters(filtersA), [filtersA, computeActiveFilters]);
  const activeFiltersB = useMemo(() => computeActiveFilters(filtersB), [filtersB, computeActiveFilters]);
  const isFilterActiveA = activeFiltersA.length > 0;
  const isFilterActiveB = activeFiltersB.length > 0;

  const filteredFilesA = useMemo(() => {
    if (!filterComparisonMode) return [];
    return filterFilesByActiveFilters(files, activeFiltersA);
  }, [filterComparisonMode, files, activeFiltersA, filterFilesByActiveFilters]);

  const filteredFilesB = useMemo(() => {
    if (!filterComparisonMode) return [];
    return filterFilesByActiveFilters(files, activeFiltersB);
  }, [filterComparisonMode, files, activeFiltersB, filterFilesByActiveFilters]);

  const comparisonA = useMemo(() => {
    if (!filterComparisonMode || filteredFilesA.length === 0) {
      return null;
    }
    return compareFields(filteredFilesA, prefixToRemove);
  }, [filterComparisonMode, filteredFilesA, prefixToRemove]);

  const comparisonB = useMemo(() => {
    if (!filterComparisonMode || filteredFilesB.length === 0) {
      return null;
    }
    return compareFields(filteredFilesB, prefixToRemove);
  }, [filterComparisonMode, filteredFilesB, prefixToRemove]);

  const aggregationA = useMemo(() => {
    if (!comparisonA || !comparisonA.aggregation) {
      return {
        filesCount: filteredFilesA.length,
        totalFieldInstances: 0,
        averageFieldsPerFile: 0,
        uniqueFieldNames: 0,
        uniqueFieldPaths: 0,
        fieldNameSummary: [],
        fieldPathSummary: [],
      };
    }
    return comparisonA.aggregation;
  }, [comparisonA, filteredFilesA.length]);

  const aggregationB = useMemo(() => {
    if (!comparisonB || !comparisonB.aggregation) {
      return {
        filesCount: filteredFilesB.length,
        totalFieldInstances: 0,
        averageFieldsPerFile: 0,
        uniqueFieldNames: 0,
        uniqueFieldPaths: 0,
        fieldNameSummary: [],
        fieldPathSummary: [],
      };
    }
    return comparisonB.aggregation;
  }, [comparisonB, filteredFilesB.length]);

  // Helper function to compute summary rows from aggregation (similar to existing logic)
  const computeSummaryRows = useCallback((agg, mode) => {
    if (mode === 'flat') {
      return (agg.fieldNameSummary || []).map(item => ({
        ...item,
        uniqueKey: item.fieldName,
        depth: item.depths && typeof item.depths.min === 'number' ? item.depths.min : 0,
        parentPath: null,
        path: item.samplePaths && item.samplePaths.length > 0 ? item.samplePaths[0] : item.fieldName,
        pathSegments: item.samplePaths && item.samplePaths.length > 0
          ? item.samplePaths[0].split(' > ')
          : [item.fieldName],
      }));
    } else {
      // hierarchical mode
      const pathSummary = agg.fieldPathSummary || [];
      if (!pathSummary || pathSummary.length === 0) {
        return [];
      }

      const totalFiles = agg.filesCount || 0;
      const nodeMap = new Map();
      const rootNodes = [];

      pathSummary.forEach(item => {
        const depthFromSegments = item.pathSegments && item.pathSegments.length > 0
          ? item.pathSegments.length - 1
          : (typeof item.depth === 'number' ? item.depth : 0);

        const node = {
          uniqueKey: item.path,
          fieldName: item.fieldName,
          depth: typeof item.depth === 'number' ? item.depth : depthFromSegments,
          parentPath: item.parentPath || '',
          filesWithField: item.filesWithPath,
          filesMissingField: typeof item.filesMissingPath === 'number'
            ? item.filesMissingPath
            : Math.max(totalFiles - (item.filesWithPath || 0), 0),
          presencePercent: item.presencePercent,
          totalOccurrences: item.totalOccurrences,
          averageOccurrencesPerFile: item.averageOccurrencesPerFile,
          samplePaths: [item.path],
          path: item.path,
          pathSegments: item.pathSegments || item.path.split(' > '),
          valueCounts: item.valueCounts || [],
          uniqueValuesCount: item.uniqueValuesCount ?? (item.valueCounts ? item.valueCounts.length : 0),
          hasChildren: !!item.hasChildren,
          orderIndex: item.orderIndex,
          children: [],
        };

        nodeMap.set(item.path, node);
      });

      nodeMap.forEach(node => {
        if (node.parentPath && nodeMap.has(node.parentPath)) {
          const parent = nodeMap.get(node.parentPath);
          parent.children.push(node);
          parent.hasChildren = true;
        } else {
          rootNodes.push(node);
        }
      });

      const sortNodes = nodes => {
        nodes.sort((a, b) => {
          const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
          const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.fieldName.localeCompare(b.fieldName);
        });
        nodes.forEach(node => {
          if (node.children.length > 0) {
            sortNodes(node.children);
          }
        });
      };

      sortNodes(rootNodes);

      const flattened = [];
      const traverse = nodes => {
        nodes.forEach(node => {
          const { children, ...rest } = node;
          const flattenedNode = {
            ...rest,
            hasChildren: rest.hasChildren || (children && children.length > 0),
          };
          flattened.push(flattenedNode);
          if (children.length > 0) {
            traverse(children);
          }
        });
      };

      traverse(rootNodes);
      return flattened;
    }
  }, []);

  // Compute summary rows for both aggregations
  const summaryRowsA = useMemo(() => {
    if (!filterComparisonMode) return [];
    return computeSummaryRows(aggregationA, summaryMode);
  }, [filterComparisonMode, aggregationA, summaryMode, computeSummaryRows]);

  const summaryRowsB = useMemo(() => {
    if (!filterComparisonMode) return [];
    return computeSummaryRows(aggregationB, summaryMode);
  }, [filterComparisonMode, aggregationB, summaryMode, computeSummaryRows]);

  // Compute differences between the two summary sets
  const summaryDiff = useMemo(() => {
    if (!filterComparisonMode || comparisonViewMode !== 'diff') {
      return null;
    }

    const diffMap = new Map();
    
    // Add all fields from A
    summaryRowsA.forEach(row => {
      const key = summaryMode === 'hierarchical' ? row.path : row.fieldName;
      diffMap.set(key, {
        ...row,
        source: 'A',
        diffType: 'onlyA',
      });
    });

    // Process fields from B
    summaryRowsB.forEach(row => {
      const key = summaryMode === 'hierarchical' ? row.path : row.fieldName;
      const existing = diffMap.get(key);
      
      if (existing) {
        // Field exists in both - check for differences
        const hasDifference = 
          existing.filesWithField !== row.filesWithField ||
          existing.totalOccurrences !== row.totalOccurrences ||
          existing.presencePercent !== row.presencePercent ||
          existing.uniqueValuesCount !== row.uniqueValuesCount;
        
        if (hasDifference) {
          diffMap.set(key, {
            ...row,
            source: 'both',
            diffType: 'different',
            valueA: existing,
            valueB: row,
          });
        } else {
          diffMap.set(key, {
            ...row,
            source: 'both',
            diffType: 'same',
          });
        }
      } else {
        // Field only in B
        diffMap.set(key, {
          ...row,
          source: 'B',
          diffType: 'onlyB',
        });
      }
    });

    return Array.from(diffMap.values()).filter(item => {
      // In diff view, only show fields that differ or are unique
      return item.diffType !== 'same';
    });
  }, [filterComparisonMode, comparisonViewMode, summaryMode, summaryRowsA, summaryRowsB]);

  const aggregation = useMemo(() => {
    if (!activeComparison || !activeComparison.aggregation) {
      return {
        filesCount: comparisonFiles.length,
        totalFieldInstances: 0,
        averageFieldsPerFile: 0,
        uniqueFieldNames: 0,
        uniqueFieldPaths: 0,
        fieldNameSummary: [],
        fieldPathSummary: [],
      };
    }
    return activeComparison.aggregation;
  }, [activeComparison, comparisonFiles.length]);

  const flatSummaryRows = useMemo(() => (
    (aggregation.fieldNameSummary || []).map(item => ({
      ...item,
      uniqueKey: item.fieldName,
      depth: item.depths && typeof item.depths.min === 'number' ? item.depths.min : 0,
      parentPath: null,
      path: item.samplePaths && item.samplePaths.length > 0 ? item.samplePaths[0] : item.fieldName,
      pathSegments: item.samplePaths && item.samplePaths.length > 0
        ? item.samplePaths[0].split(' > ')
        : [item.fieldName],
    }))
  ), [aggregation.fieldNameSummary]);

  const hierarchicalSummaryRows = useMemo(() => {
    const pathSummary = aggregation.fieldPathSummary || [];
    if (!pathSummary || pathSummary.length === 0) {
      return [];
    }

    const totalFiles = aggregation.filesCount || 0;
    const nodeMap = new Map();
    const rootNodes = [];

    pathSummary.forEach(item => {
      const depthFromSegments = item.pathSegments && item.pathSegments.length > 0
        ? item.pathSegments.length - 1
        : (typeof item.depth === 'number' ? item.depth : 0);

      const node = {
        uniqueKey: item.path,
        fieldName: item.fieldName,
        depth: typeof item.depth === 'number' ? item.depth : depthFromSegments,
        parentPath: item.parentPath || '',
        filesWithField: item.filesWithPath,
        filesMissingField: typeof item.filesMissingPath === 'number'
          ? item.filesMissingPath
          : Math.max(totalFiles - (item.filesWithPath || 0), 0),
        presencePercent: item.presencePercent,
        totalOccurrences: item.totalOccurrences,
        averageOccurrencesPerFile: item.averageOccurrencesPerFile,
        samplePaths: [item.path],
        path: item.path,
        pathSegments: item.pathSegments || item.path.split(' > '),
        valueCounts: item.valueCounts || [],
        uniqueValuesCount: item.uniqueValuesCount ?? (item.valueCounts ? item.valueCounts.length : 0),
        hasChildren: !!item.hasChildren,
        orderIndex: item.orderIndex,
        children: [],
      };

      nodeMap.set(item.path, node);
    });

    nodeMap.forEach(node => {
      if (node.parentPath && nodeMap.has(node.parentPath)) {
        const parent = nodeMap.get(node.parentPath);
        parent.children.push(node);
        parent.hasChildren = true;
      } else {
        rootNodes.push(node);
      }
    });

    const sortNodes = nodes => {
      nodes.sort((a, b) => {
        const orderA = a.orderIndex !== undefined ? a.orderIndex : 999999;
        const orderB = b.orderIndex !== undefined ? b.orderIndex : 999999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.fieldName.localeCompare(b.fieldName);
      });
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(rootNodes);

    const flattened = [];
    const traverse = nodes => {
      nodes.forEach(node => {
        const { children, ...rest } = node;
        const flattenedNode = {
          ...rest,
          hasChildren: rest.hasChildren || (children && children.length > 0),
        };
        flattened.push(flattenedNode);
        if (children.length > 0) {
          traverse(children);
        }
      });
    };

    traverse(rootNodes);

    return flattened;
  }, [aggregation.fieldPathSummary, aggregation.filesCount]);

  const summaryRows = useMemo(
    () => (summaryMode === 'hierarchical' ? hierarchicalSummaryRows : flatSummaryRows),
    [summaryMode, hierarchicalSummaryRows, flatSummaryRows],
  );

  const filteredSummary = useMemo(() => {
    const list = summaryRows || [];
    const term = summarySearch.trim().toLowerCase();
    if (!term) {
      return list;
    }
    return list.filter(item => {
      const fieldName = item.fieldName || '';
      const matchesName = fieldName.toLowerCase().includes(term);
      const matchesPath = item.samplePaths && item.samplePaths.some(path => path.toLowerCase().includes(term));
      const matchesSegments = item.pathSegments
        ? item.pathSegments.some(segment => segment.toLowerCase().includes(term))
        : false;
      return matchesName || matchesPath || matchesSegments;
    });
  }, [summaryRows, summarySearch]);

  const visibleSummary = useMemo(() => {
    if (!filteredSummary) return [];
    return filteredSummary.slice(0, summaryVisibleCount);
  }, [filteredSummary, summaryVisibleCount]);

  const filterSummaryForExport = useMemo(() => {
    if (!isFilterActive) {
      return null;
    }

    return activeFilters.map(filter => {
      const parts = [`${filter.field}`];
      if (filter.caseSensitive) {
        parts.push('(case-sensitive)');
      }
      parts.push(`= "${filter.trimmedValue}"`);
      return parts.join(' ');
    }).join(' AND ');
  }, [activeFilters, isFilterActive]);

  useEffect(() => {
    setSummaryVisibleCount(100);
  }, [summarySearch, summaryRows]);

  useEffect(() => {
    if (!expandedSummaryRowKey) {
      return;
    }
    const stillExists = filteredSummary.some(item => item.uniqueKey === expandedSummaryRowKey);
    if (!stillExists) {
      setExpandedSummaryRowKey(null);
    }
  }, [filteredSummary, expandedSummaryRowKey]);

  useEffect(() => {
    setShowAllSummaryValues(prev => {
      if (!prev || Object.keys(prev).length === 0) {
        return prev;
      }
      const retained = {};
      filteredSummary.forEach(item => {
        if (Object.prototype.hasOwnProperty.call(prev, item.uniqueKey)) {
          retained[item.uniqueKey] = prev[item.uniqueKey];
        }
      });
      if (Object.keys(retained).length === Object.keys(prev).length) {
        return prev;
      }
      return retained;
    });
  }, [filteredSummary]);

  useEffect(() => {
    setExpandedSummaryRowKey(null);
    setShowAllSummaryValues({});
  }, [summaryMode]);

  const handleSummaryRowClick = (rowKey) => {
    setExpandedSummaryRowKey(prev => (prev === rowKey ? null : rowKey));
  };

  const handleSummaryRowKeyDown = (event, rowKey) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSummaryRowClick(rowKey);
    }
  };

  const toggleShowAllSummaryValues = (rowKey) => {
    setShowAllSummaryValues(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  };

  const noMatchingFiles = isFilterActive && comparisonFiles.length === 0;
  const insufficientFilesForComparison = comparisonFiles.length > 0 && comparisonFiles.length < 2;
  const canExport = comparisonFiles.length > 0;

  const buildStructureFromFields = (fields) => {
    if (!fields || fields.length === 0) {
      return {};
    }

    const structure = {};

    fields.forEach(field => {
      const path = removePrefixFromPath(field.path, prefixToRemove);
      const segments = path.split(' > ');
      let currentLevel = structure;

      segments.forEach((segment, index) => {
        const isLastSegment = index === segments.length - 1;
        const existingValue = currentLevel[segment];

        if (!isLastSegment) {
          if (existingValue === undefined || typeof existingValue !== 'object') {
            currentLevel[segment] = {};
          }
          currentLevel = currentLevel[segment];
          return;
        }

        if (field.hasChildren) {
          currentLevel[segment] = existingValue && typeof existingValue === 'object' ? existingValue : {};
        } else {
          currentLevel[segment] = existingValue && typeof existingValue === 'object' ? existingValue : '';
        }
      });
    });

    return structure;
  };

  // Merge all fields from all files, grouping by similar structure
  // For each parent path, show all unique field names from all files
  // Merge all fields from all files, grouping by similar structure
  // For each parent path, show all unique field names from all files
  const mergedFields = useMemo(() => {
    return mergeFieldsFromFiles(comparisonFiles, prefixToRemove);
  }, [comparisonFiles, prefixToRemove]);

  const collectExpandablePaths = useCallback((fields) => {
    const paths = new Set();
    if (!fields || fields.length === 0) {
      return paths;
    }
    fields.forEach(field => {
      if (field && field.hasChildren && field.path) {
        paths.add(field.path);
      }
    });
    return paths;
  }, []);

  const handleExpandAllForFields = useCallback((fields) => {
    const paths = collectExpandablePaths(fields);
    if (paths.size === 0) {
      return;
    }
    setExpandedPaths(prev => {
      const next = new Set(prev);
      paths.forEach(path => next.add(path));
      return next;
    });
  }, [collectExpandablePaths]);

  const handleCollapseAllForFields = useCallback((fields) => {
    const paths = collectExpandablePaths(fields);
    if (paths.size === 0) {
      return;
    }
    setExpandedPaths(prev => {
      const next = new Set(prev);
      paths.forEach(path => next.delete(path));
      return next;
    });
  }, [collectExpandablePaths]);

  const handleExportComparison = () => {
    if (!canExport) {
      return;
    }

    const blob = comparisonToExcel(activeComparison, mergedFields, {
      filtersSummary: filterSummaryForExport,
      filteredFilesCount: comparisonFiles.length,
      totalFilesCount: files.length,
      prefixToRemove: prefixToRemove,
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'comparison_report.xlsx');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    if (!canExport) {
      return;
    }

    const payload = {};

    if (mergedFields.length > 0) {
      payload.merged = buildStructureFromFields(mergedFields);
    }

    if (activeComparison.commonFields.length > 0) {
      payload.common = buildStructureFromFields(activeComparison.commonFields);
    }

    const jsonContent = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'comparison_report.json');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filesWithUniqueFields = useMemo(() => {
    if (!activeComparison || !activeComparison.uniqueFields) {
      return [];
    }

    return comparisonFiles.filter(file => {
      const uniqueForFile = activeComparison.uniqueFields[file.filename] || [];
      return uniqueForFile.length > 0;
    });
  }, [activeComparison, comparisonFiles]);

  return (
    <div className="fields-viewer">
      <div className="fields-header">
        <h2>File Comparison</h2>
        <div className="fields-header-actions">
          <button
            className="export-btn"
            onClick={handleExportComparison}
            disabled={!canExport}
            title={canExport ? 'Export the current comparison to Excel' : 'No data available to export'}
          >
            📊 Export to Excel
          </button>
          <button
            className="export-btn"
            onClick={handleExportJson}
            disabled={!canExport}
            title={canExport ? 'Export merged/common fields to JSON' : 'No data available to export'}
          >
            📝 Export JSON
          </button>
        </div>
      </div>

      <div className="comparison-filter-bar">
        <div className="filter-comparison-toggle" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className={`export-btn ${filterComparisonMode ? '' : 'secondary'}`}
            onClick={() => {
              setFilterComparisonMode(!filterComparisonMode);
              if (!filterComparisonMode) {
                // Initialize filter sets when enabling comparison mode
                setFiltersA([createEmptyFilter()]);
                setFiltersB([createEmptyFilter()]);
              }
            }}
            style={{
              backgroundColor: filterComparisonMode ? 'var(--primary-color)' : 'var(--secondary-color)',
            }}
          >
            {filterComparisonMode ? 'Exit Compare Filters' : 'Compare Filters'}
          </button>
          {filterComparisonMode && (
            <div className="comparison-view-toggle" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>View:</span>
              <div className="summary-view-toggle" role="group" aria-label="Comparison view mode">
                <button
                  type="button"
                  className={`summary-view-toggle__btn ${comparisonViewMode === 'split' ? 'active' : ''}`}
                  onClick={() => setComparisonViewMode('split')}
                >
                  Split View
                </button>
                <button
                  type="button"
                  className={`summary-view-toggle__btn ${comparisonViewMode === 'diff' ? 'active' : ''}`}
                  onClick={() => setComparisonViewMode('diff')}
                >
                  Diff View
                </button>
              </div>
            </div>
          )}
        </div>

        {!filterComparisonMode ? (
          // Single filter panel (existing behavior)
          <>
            {filters.map((filter, index) => (
          <div className="filter-row" key={filter.id}>
            <div className="filter-group">
              <label htmlFor={`comparison-filter-field-${filter.id}`}>
                Field{filters.length > 1 ? ` ${index + 1}` : ''}
              </label>
              <select
                id={`comparison-filter-field-${filter.id}`}
                value={filter.field}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilters(prev =>
                    prev.map(f => f.id === filter.id ? { ...f, field: value, value: value ? f.value : '', caseSensitive: f.caseSensitive } : f)
                  );
                }}
              >
                <option value="">All fields</option>
                {availableFields.map(fieldName => (
                  <option key={fieldName} value={fieldName}>
                    {fieldName}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-value-group">
              <label htmlFor={`comparison-filter-value-${filter.id}`}>Value</label>
              <div className="filter-value-controls">
                <input
                  id={`comparison-filter-value-${filter.id}`}
                  type="text"
                  placeholder="Enter field value (use * for wildcards: *ABC, ABC*, A*BC)"
                  value={filter.value}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFilters(prev =>
                      prev.map(f => f.id === filter.id ? { ...f, value } : f)
                    );
                  }}
                  disabled={!filter.field}
                />
                <label className="filter-case-sensitive">
                  <input
                    type="checkbox"
                    checked={filter.caseSensitive}
                    onChange={(e) => {
                      const value = e.target.checked;
                      setFilters(prev =>
                        prev.map(f => f.id === filter.id ? { ...f, caseSensitive: value } : f)
                      );
                    }}
                  />
                  Case sensitive
                </label>
              </div>
            </div>

            {filters.length > 1 && (
              <button
                className="filter-remove-btn"
                onClick={() => {
                  setFilters(prev => {
                    if (prev.length === 1) {
                      return prev;
                    }
                    return prev.filter(f => f.id !== filter.id);
                  });
                }}
                title="Remove this filter"
                type="button"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <div className="filter-actions">
          <button
            className="filter-add-btn"
            onClick={() => {
              setFilters(prev => {
                if (prev.length >= MAX_FILTERS) {
                  return prev;
                }
                return [...prev, createEmptyFilter()];
              });
            }}
            disabled={filters.length >= MAX_FILTERS}
            title={filters.length >= MAX_FILTERS ? `You can add up to ${MAX_FILTERS} filters.` : undefined}
            type="button"
          >
            + Add another filter
          </button>
          <button
            className="filter-clear-btn"
            onClick={() => setFilters([createEmptyFilter()])}
            disabled={!hasAnyFilterInput}
            type="button"
          >
            Clear Filters
          </button>
        </div>

        {isFilterActive && (
          <div className="filter-summary">
            {noMatchingFiles ? (
              <span>
                No files match the selected filters:{' '}
                {activeFilters.map(filter => (
                  <span key={filter.id}>
                    <code>{removePrefixFromFieldName(filter.field, prefixToRemove)}</code> = "<span>{filter.trimmedValue}</span>"{filter.caseSensitive ? ' (case sensitive)' : ''}
                  </span>
                )).reduce((acc, element, idx) => (
                  idx === 0 ? [element] : [...acc, ', ', element]
                ), [])}
              </span>
            ) : (
              <span>
                Showing {comparisonFiles.length} of {files.length} files where{' '}
                {activeFilters.map(filter => (
                  <span key={filter.id}>
                    <code>{removePrefixFromFieldName(filter.field, prefixToRemove)}</code> = "<span>{filter.trimmedValue}</span>"{filter.caseSensitive ? ' (case sensitive)' : ''}
                  </span>
                )).reduce((acc, element, idx) => (
                  idx === 0 ? [element] : [...acc, ' and ', element]
                ), [])}
              </span>
            )}
          </div>
        )}

        {insufficientFilesForComparison && (
          <div className="filter-summary warning">
            Need at least two matching files for a full comparison. Displaying available data for the {comparisonFiles.length === 1 ? 'single matching file.' : 'selected files.'}
          </div>
        )}
          </>
        ) : (
          // Dual filter panels for comparison mode
          <div className="filter-comparison-panels" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <FilterPanel
              title="Filter Set A"
              filters={filtersA}
              setFilters={setFiltersA}
              availableFields={availableFields}
              prefixToRemove={prefixToRemove}
              activeFilters={activeFiltersA}
              matchingFilesCount={filteredFilesA.length}
              totalFilesCount={files.length}
              createEmptyFilter={createEmptyFilter}
              MAX_FILTERS={MAX_FILTERS}
            />
            <FilterPanel
              title="Filter Set B"
              filters={filtersB}
              setFilters={setFiltersB}
              availableFields={availableFields}
              prefixToRemove={prefixToRemove}
              activeFilters={activeFiltersB}
              matchingFilesCount={filteredFilesB.length}
              totalFilesCount={files.length}
              createEmptyFilter={createEmptyFilter}
              MAX_FILTERS={MAX_FILTERS}
            />
          </div>
        )}

        {/* Prefix input - shared for both modes */}
        <div className="filter-prefix-input" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="prefix-to-remove" style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            Remove Prefix:
          </label>
          <input
            id="prefix-to-remove"
            type="text"
            placeholder="e.g., ns0:"
            value={prefixToRemove}
            onChange={(e) => {
              if (setPrefixToRemove) {
                setPrefixToRemove(e.target.value);
              }
            }}
            style={{
              padding: '0.5rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              width: '120px',
            }}
          />
        </div>
      </div>

      <div className="tabs" style={{ borderBottom: '1px solid var(--border-color)', padding: '0 1rem', margin: 0 }}>
        <button
          className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
          style={{ borderBottom: activeTab === 'summary' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === 'merged' ? 'active' : ''}`}
          onClick={() => setActiveTab('merged')}
          style={{ borderBottom: activeTab === 'merged' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Merged View ({mergedFields.length})
        </button>
        <button
          className={`tab ${activeTab === 'common' ? 'active' : ''}`}
          onClick={() => setActiveTab('common')}
          style={{ borderBottom: activeTab === 'common' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Common Fields ({activeComparison.commonFields.length})
        </button>
        <button
          className={`tab ${activeTab === 'unique' ? 'active' : ''}`}
          onClick={() => setActiveTab('unique')}
          style={{ borderBottom: activeTab === 'unique' ? '3px solid var(--primary-color)' : 'none' }}
        >
          Unique Fields
        </button>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {activeTab === 'summary' && filterComparisonMode ? (
          // Filter Comparison Views (Split or Diff)
          <div className="summary-view">
            <div className="summary-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3>Filter Comparison Summary</h3>
                  <p style={{ margin: '0.25rem 0 0' }}>
                    {comparisonViewMode === 'split' 
                      ? 'Side-by-side comparison of Filter Set A and Filter Set B'
                      : 'Differences between Filter Set A and Filter Set B'}
                  </p>
                </div>
                <div className="summary-view-toggle" role="group" aria-label="Summary view mode">
                  <button
                    type="button"
                    className={`summary-view-toggle__btn ${summaryMode === 'hierarchical' ? 'active' : ''}`}
                    onClick={() => setSummaryMode('hierarchical')}
                  >
                    Hierarchy
                  </button>
                  <button
                    type="button"
                    className={`summary-view-toggle__btn ${summaryMode === 'flat' ? 'active' : ''}`}
                    onClick={() => setSummaryMode('flat')}
                  >
                    Flat
                  </button>
                </div>
              </div>
            </div>
            
            {comparisonViewMode === 'split' ? (
              // Split View - Two columns side by side with full hierarchical structure
              <div className="split-view-container" style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                <SummaryTablePanel
                  title="Filter Set A"
                  summaryRows={summaryRowsA}
                  aggregation={aggregationA}
                  summaryMode={summaryMode}
                  prefixToRemove={prefixToRemove}
                  expandedRowKey={expandedRowKeyA}
                  onRowClick={setExpandedRowKeyA}
                  showAllValues={showAllSummaryValuesA}
                  onToggleShowAll={(rowKey) => {
                    setShowAllSummaryValuesA(prev => ({
                      ...prev,
                      [rowKey]: !prev[rowKey],
                    }));
                  }}
                  hideDepth={true}
                />
                
                <SummaryTablePanel
                  title="Filter Set B"
                  summaryRows={summaryRowsB}
                  aggregation={aggregationB}
                  summaryMode={summaryMode}
                  prefixToRemove={prefixToRemove}
                  expandedRowKey={expandedRowKeyB}
                  onRowClick={setExpandedRowKeyB}
                  showAllValues={showAllSummaryValuesB}
                  onToggleShowAll={(rowKey) => {
                    setShowAllSummaryValuesB(prev => ({
                      ...prev,
                      [rowKey]: !prev[rowKey],
                    }));
                  }}
                  hideDepth={true}
                />
              </div>
            ) : (
              // Diff View - Single table with only unique fields highlighted
              <div>
                <div className="summary-cards" style={{ marginBottom: '1rem' }}>
                  <div className="summary-card">
                    <div className="card-label">Fields Only in Set A</div>
                    <div className="card-value">
                      {summaryDiff ? summaryDiff.filter(d => d.diffType === 'onlyA').length : 0}
                    </div>
                  </div>
                  <div className="summary-card">
                    <div className="card-label">Fields Only in Set B</div>
                    <div className="card-value">
                      {summaryDiff ? summaryDiff.filter(d => d.diffType === 'onlyB').length : 0}
                    </div>
                  </div>
                </div>
                <div className="summary-table">
                  <div className="summary-table-header">
                    <div>Field Name</div>
                    <div>Difference</div>
                    <div>Set A</div>
                    <div>Set B</div>
                  </div>
                  {summaryDiff && summaryDiff.slice(0, 100).map(item => {
                    const key = summaryMode === 'hierarchical' ? item.path : item.fieldName;
                    // Only highlight fields that are ONLY in A or ONLY in B
                    const bgColor = 
                      item.diffType === 'onlyA' ? 'rgba(16, 185, 129, 0.1)' :
                      item.diffType === 'onlyB' ? 'rgba(239, 68, 68, 0.1)' :
                      undefined; // Neutral/uncolored for fields that exist in both
                    return (
                      <div 
                        key={key} 
                        className="summary-table-row"
                        style={bgColor ? { backgroundColor: bgColor } : {}}
                      >
                        <div>{removePrefixFromFieldName(item.fieldName, prefixToRemove)}</div>
                        <div>
                          {item.diffType === 'onlyA' && <span style={{ color: 'var(--secondary-color)' }}>Only in A</span>}
                          {item.diffType === 'onlyB' && <span style={{ color: 'var(--danger-color)' }}>Only in B</span>}
                          {item.diffType === 'different' && <span>Different</span>}
                        </div>
                        <div>
                          {item.diffType === 'onlyB' ? '—' : `${item.valueA?.filesWithField || item.filesWithField}/${aggregationA.filesCount} files, ${item.valueA?.totalOccurrences || item.totalOccurrences} occ.`}
                        </div>
                        <div>
                          {item.diffType === 'onlyA' ? '—' : `${item.filesWithField}/${aggregationB.filesCount} files, ${item.totalOccurrences} occ.`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'summary' && (
          <div className="summary-view">
            <div className="summary-header">
              <h3>Comparison Summary</h3>
              <p>
                Aggregated view of field coverage across {aggregation.filesCount} {aggregation.filesCount === 1 ? 'file' : 'files'}.
              </p>
            </div>

            <div className="summary-cards">
              <div className="summary-card">
                <div className="card-label">Files Compared</div>
                <div className="card-value">{aggregation.filesCount}</div>
              </div>
              <div className="summary-card">
                <div className="card-label">Unique Field Names</div>
                <div className="card-value">{aggregation.uniqueFieldNames}</div>
              </div>
              <div className="summary-card">
                <div className="card-label">Unique Field Paths</div>
                <div className="card-value">{aggregation.uniqueFieldPaths}</div>
              </div>
              <div className="summary-card">
                <div className="card-label">Average Fields per File</div>
                <div className="card-value">
                  {aggregation.averageFieldsPerFile ? aggregation.averageFieldsPerFile.toFixed(1) : '0.0'}
                </div>
              </div>
            </div>

            <div className="summary-table-controls">
              <div className="summary-table-controls-left">
                <div className="summary-table-info">
                  Showing {visibleSummary.length} of {filteredSummary.length}{' '}
                  {filteredSummary.length === 1
                    ? (summaryMode === 'hierarchical' ? 'field path' : 'field name')
                    : (summaryMode === 'hierarchical' ? 'field paths' : 'field names')}
                </div>
                <div className="summary-view-toggle" role="group" aria-label="Summary view mode">
                  <button
                    type="button"
                    className={`summary-view-toggle__btn ${summaryMode === 'hierarchical' ? 'active' : ''}`}
                    onClick={() => setSummaryMode('hierarchical')}
                  >
                    Hierarchy
                  </button>
                  <button
                    type="button"
                    className={`summary-view-toggle__btn ${summaryMode === 'flat' ? 'active' : ''}`}
                    onClick={() => setSummaryMode('flat')}
                  >
                    Flat
                  </button>
                </div>
              </div>
              <input
                className="summary-search-input"
                type="search"
                placeholder="Search field names or sample paths"
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                aria-label="Search field names"
              />
            </div>

            {filteredSummary.length === 0 ? (
              <div className="summary-empty-state">
                No fields match the current filters.
              </div>
            ) : (
              <div className="summary-table">
                <div className="summary-table-header">
                  <div>Field Name</div>
                  <div>Depth</div>
                  <div>Files</div>
                  <div>Presence</div>
                  <div>Occurrences</div>
                  <div>Sample Paths</div>
                </div>
                {visibleSummary.map(item => {
                  const rowKey = item.uniqueKey || item.fieldName;
                  const isExpanded = expandedSummaryRowKey === rowKey;
                  const valueCounts = item.valueCounts || [];
                  const showAllValues = !!showAllSummaryValues[rowKey];
                  const displayedValueCounts = showAllValues ? valueCounts : valueCounts.slice(0, 10);
                  const hasAdditionalValues = valueCounts.length > 10;
                  const hasValues = valueCounts.length > 0;
                  const indentLevel = summaryMode === 'hierarchical' ? Math.max(item.depth || 0, 0) : 0;
                  const depthDisplay = typeof item.depth === 'number' ? item.depth : (item.pathSegments ? item.pathSegments.length - 1 : 0);
                  const accessibleLabel = summaryMode === 'hierarchical'
                    ? `View value distribution for ${item.fieldName} at ${item.path}`
                    : `View value distribution for ${item.fieldName}`;
                  const rowClassNames = [
                    'summary-table-row',
                    'summary-table-row--interactive',
                    isExpanded ? 'expanded' : '',
                    summaryMode === 'hierarchical' && item.hasChildren ? 'summary-table-row--hierarchical' : '',
                  ].filter(Boolean).join(' ');

                  const handleToggleShowAll = (event) => {
                    event.stopPropagation();
                    toggleShowAllSummaryValues(rowKey);
                  };

                  return (
                    <React.Fragment key={rowKey}>
                      <div
                        className={rowClassNames}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSummaryRowClick(rowKey)}
                        onKeyDown={(event) => handleSummaryRowKeyDown(event, rowKey)}
                        aria-expanded={isExpanded}
                        aria-label={accessibleLabel}
                      >
                        <div className={`summary-field-name ${summaryMode === 'hierarchical' ? 'summary-field-name--hierarchy' : ''}`}>
                          {summaryMode === 'hierarchical' && indentLevel > 0 && (
                            <span
                              className="summary-hierarchy-offset"
                              style={{ width: `${indentLevel * 1.25}rem` }}
                              aria-hidden="true"
                            >
                              <span className="summary-hierarchy-marker" />
                            </span>
                          )}
                          <span className={`summary-row-caret ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                          <code>{removePrefixFromFieldName(item.fieldName, prefixToRemove)}</code>
                          <span className="summary-field-pill">
                            {hasValues
                              ? `${item.uniqueValuesCount} value${item.uniqueValuesCount === 1 ? '' : 's'}`
                              : 'No values detected'}
                          </span>
                        </div>
                        <div className="summary-depth">
                          {depthDisplay}
                        </div>
                        <div className="summary-files-count">
                          {item.filesWithField}/{aggregation.filesCount}
                        </div>
                        <div className="summary-presence">
                          {item.presencePercent.toFixed(0)}%
                        </div>
                        <div className="summary-occurrences">
                          <span className="summary-occ-total">{item.totalOccurrences}</span>
                          <span className="summary-occ-avg">
                            avg {item.averageOccurrencesPerFile.toFixed(1)}
                          </span>
                        </div>
                        <div className="summary-sample-paths">
                          {item.samplePaths && item.samplePaths.length > 0 ? (
                            item.samplePaths.map(path => (
                              <span key={path} className="summary-path-chip">
                                {removePrefixFromPath(path, prefixToRemove)}
                              </span>
                            ))
                          ) : (
                            <span className="summary-no-path">—</span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="summary-row-details">
                          <div className="summary-values-header">
                            <span>
                              <strong>Unique values:</strong> {item.uniqueValuesCount}
                            </span>
                            <span>
                              <strong>Total occurrences:</strong> {item.totalOccurrences}
                            </span>
                          </div>

                          {summaryMode === 'hierarchical' && item.path && (
                            <div className="summary-path-detail">
                              <strong>Path:</strong> {removePrefixFromPath(item.path, prefixToRemove)}
                            </div>
                          )}

                          {hasValues ? (
                            <>
                              <ul className="summary-values-list">
                                {displayedValueCounts.map((valueInfo, index) => {
                                  const valueLabel = valueInfo.value === '' ? '(empty)' : valueInfo.value;
                                  const percentageLabel = valueInfo.percentage != null
                                    ? `${valueInfo.percentage.toFixed(1)}%`
                                    : '—';
                                  return (
                                    <li className="summary-value-item" key={`${item.fieldName}-${index}-${valueInfo.value}`}>
                                      <div className="summary-value-info">
                                        <span className="summary-value-rank">{index + 1}.</span>
                                        <span className="summary-value-text" title={valueLabel}>
                                          {valueLabel}
                                        </span>
                                      </div>
                                      <div className="summary-value-stats">
                                        <span className="summary-value-count">
                                          {valueInfo.count} occurrence{valueInfo.count === 1 ? '' : 's'}
                                        </span>
                                        <span className="summary-value-percentage">
                                          {percentageLabel}
                                        </span>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>

                              {hasAdditionalValues && (
                                <button
                                  type="button"
                                  className="summary-values-toggle"
                                  onClick={handleToggleShowAll}
                                >
                                  {showAllValues
                                    ? 'Show top 10'
                                    : `Show all ${valueCounts.length} values`}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="summary-no-values">
                              No text values were captured for this field. It may only contain nested elements or empty content.
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {filteredSummary.length > visibleSummary.length && (
              <div className="summary-show-more">
                <button
                  type="button"
                  className="summary-show-more-btn"
                  onClick={() => setSummaryVisibleCount(prev => prev + 100)}
                >
                  Show 100 more
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'merged' && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Merged View: All Fields from All Files
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Fields are grouped by similar structure. If fields share the same parent path, they are shown together.
              </span>
            </div>
            {mergedFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No fields to display</p>
            ) : (
              <>
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid var(--primary-color)',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  <strong style={{ color: 'var(--primary-color)' }}>ℹ️ Note:</strong> This view shows all unique fields from all files, grouped by their parent structure.
                  Fields marked with (X/Y files) appear in X out of Y files.
                  Hover over the file count to see which files contain each field.
                </div>
                <div className="tree-controls" style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => handleExpandAllForFields(mergedFields)}
                    className="export-btn tree-control-btn tree-control-btn--expand"
                    disabled={mergedFields.length === 0}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCollapseAllForFields(mergedFields)}
                    className="export-btn tree-control-btn tree-control-btn--collapse"
                    disabled={mergedFields.length === 0}
                  >
                    Collapse all
                  </button>
                </div>
                <HierarchicalFieldList
                  fields={mergedFields}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  type="merged"
                  totalFiles={comparisonFiles.length}
                  prefixToRemove={prefixToRemove}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'common' && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                Fields present in all {comparisonFiles.length} files
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                (Structure shown from: {comparisonFiles[0]?.filename})
              </span>
            </div>
            {activeComparison.commonFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No common fields found</p>
            ) : (
              <>
                {Object.keys(activeComparison.structuralDifferences || {}).length > 0 && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid var(--warning-color)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                  }}>
                    <strong style={{ color: 'var(--warning-color)' }}>⚠️ Note:</strong> Some fields have structural differences.
                    Fields marked with ⚠️ exist in all files but at different paths/positions.
                    Hover over the warning icon to see alternative paths.
                  </div>
                )}
                <div className="tree-controls" style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => handleExpandAllForFields(activeComparison.commonFields)}
                    className="export-btn tree-control-btn tree-control-btn--expand"
                    disabled={activeComparison.commonFields.length === 0}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCollapseAllForFields(activeComparison.commonFields)}
                    className="export-btn tree-control-btn tree-control-btn--collapse"
                    disabled={activeComparison.commonFields.length === 0}
                  >
                    Collapse all
                  </button>
                </div>
                <HierarchicalFieldList
                  fields={activeComparison.commonFields}
                  expandedPaths={expandedPaths}
                  setExpandedPaths={setExpandedPaths}
                  type="common"
                  prefixToRemove={prefixToRemove}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'unique' && (
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Fields unique to each file (not present in any other file)
            </h3>
            {filesWithUniqueFields.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No unique fields were found across the selected files.
              </p>
            ) : (
              <div className="comparison-container">
                {filesWithUniqueFields.map(file => (
                  <div key={file.id}>
                    <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                      {file.filename}
                    </h4>
                    <HierarchicalFieldList
                      fields={activeComparison.uniqueFields[file.filename]}
                      expandedPaths={expandedPaths}
                      setExpandedPaths={setExpandedPaths}
                      type="unique"
                      prefixToRemove={prefixToRemove}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ComparisonView;
