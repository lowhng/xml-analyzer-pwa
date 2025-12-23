import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { mergeFieldsFromFiles, removePrefixFromFieldName, removePrefixFromPath, getFieldValuesFromFiles, compareFields } from '../utils/xmlParser';

// Component for field value input with custom dropdown
const FieldValueInput = ({ field, availableValues, allValuesCount, valuesCount, onFieldChange, openDropdownFieldId, setOpenDropdownFieldId }) => {
    const isDropdownOpen = openDropdownFieldId === field.uiId;
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    
    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isDropdownOpen) return;
        
        const handleClickOutside = (event) => {
            if (dropdownRef.current && 
                buttonRef.current &&
                !dropdownRef.current.contains(event.target) &&
                !buttonRef.current.contains(event.target)) {
                setOpenDropdownFieldId(null);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDropdownOpen, setOpenDropdownFieldId]);
    
    const handleValueButtonClick = (e) => {
        e.stopPropagation();
        if (valuesCount > 0 && field.enabled) {
            setOpenDropdownFieldId(isDropdownOpen ? null : field.uiId);
        }
    };
    
    const handleValueSelect = (value) => {
        onFieldChange(field.uiId, { customValue: value });
        setOpenDropdownFieldId(null);
    };
    
    return (
        <>
            <input
                type="text"
                className="field-value-input"
                value={field.customValue || ''}
                onChange={(e) => onFieldChange(field.uiId, { customValue: e.target.value })}
                placeholder="Value"
                disabled={!field.enabled}
                onClick={(e) => e.stopPropagation()} // Prevent selecting row when clicking input
                style={{
                    padding: '0.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.25rem',
                    backgroundColor: field.enabled ? 'var(--bg-color)' : 'var(--surface-color)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    gridColumn: '5',
                    justifySelf: 'end'
                }}
            />
            <div style={{ gridColumn: '6', position: 'relative', width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
                {allValuesCount > 0 && (
                    <>
                        <button
                            ref={buttonRef}
                            type="button"
                            className="field-value-count"
                            onClick={handleValueButtonClick}
                            disabled={!field.enabled || valuesCount === 0}
                            style={{
                                cursor: (field.enabled && valuesCount > 0) ? 'pointer' : 'default',
                                background: (field.enabled && valuesCount > 0) ? '#10b981' : '#9ca3af', // Green pill background
                                border: 'none',
                                padding: '0.25rem 0.75rem',
                                margin: 0,
                                fontSize: '0.875rem',
                                color: '#ffffff', // White text on green background
                                whiteSpace: 'nowrap',
                                textDecoration: 'none',
                                borderRadius: '9999px', // Pill shape (fully rounded)
                                fontWeight: '500'
                            }}
                        >
                            {valuesCount} value{valuesCount === 1 ? '' : 's'}
                        </button>
                        {isDropdownOpen && valuesCount > 0 && (
                            <div
                                ref={dropdownRef}
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.25rem',
                                    backgroundColor: 'var(--bg-color)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                    zIndex: 1000,
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    minWidth: '200px',
                                    maxWidth: '400px'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {availableValues.map((value, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => handleValueSelect(value)}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            cursor: 'pointer',
                                            borderBottom: idx < availableValues.length - 1 ? '1px solid var(--border-color)' : 'none',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.875rem',
                                            transition: 'background-color 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.target.style.backgroundColor = 'var(--surface-color)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.target.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        {value}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
};

function GeneratorView({ files, comparison, prefixToRemove = '', filters = [] }) {
    const [sourceType, setSourceType] = useState('merged'); // 'merged', 'common', or 'field-based'
    const [fields, setFields] = useState([]);
    const [generatedXML, setGeneratedXML] = useState('');
    
    // Field-based selection state
    const [sourceFieldName, setSourceFieldName] = useState('');
    const [sourceFieldValue, setSourceFieldValue] = useState('');
    const [sourceFieldCaseSensitive, setSourceFieldCaseSensitive] = useState(false);

    // Filtering logic (same as ComparisonView)
    const wildcardToRegex = useCallback((pattern) => {
        // Escape special regex characters except *
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        // Replace * with .* for regex
        const regexPattern = escaped.replace(/\*/g, '.*');
        // Anchor to start and end for full match
        return new RegExp(`^${regexPattern}$`);
    }, []);

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

    // Compute active filters from filter array
    const computeActiveFilters = useCallback((filterArray) => {
        return filterArray
            .map(filter => {
                const trimmedValue = filter.value.trim();
                if (!filter.field || trimmedValue === '') {
                    return null;
                }
                return {
                    field: filter.field,
                    value: trimmedValue,
                    trimmedValue: trimmedValue,
                    caseSensitive: filter.caseSensitive || false
                };
            })
            .filter(f => f !== null);
    }, []);

    // Filter files based on active filters
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

    // Compute filtered files based on filters
    const activeFilters = useMemo(() => computeActiveFilters(filters), [filters, computeActiveFilters]);
    const isFilterActive = activeFilters.length > 0;

    const filteredFiles = useMemo(() => {
        if (!isFilterActive) {
            return files;
        }
        return filterFilesByActiveFilters(files, activeFilters);
    }, [files, isFilterActive, activeFilters, filterFilesByActiveFilters]);

    // Compute available fields from filtered files (same logic as ComparisonView)
    const availableFields = useMemo(() => {
        const fieldNames = new Set();
        filteredFiles.forEach(file => {
            file.fields.forEach(field => {
                const textValue = field.textContent ? field.textContent.trim() : '';
                if (textValue.length > 0) {
                    const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
                    fieldNames.add(normalizedName);
                }
            });
        });
        return Array.from(fieldNames).sort((a, b) => a.localeCompare(b));
    }, [filteredFiles, prefixToRemove]);

    // Filter files based on field-based selection (applied on top of comparison filters)
    const filteredSourceFiles = useMemo(() => {
        if (sourceType !== 'field-based' || !sourceFieldName || !sourceFieldValue.trim()) {
            return [];
        }
        
        const trimmedValue = sourceFieldValue.trim();
        const normalizedFilterValue = sourceFieldCaseSensitive
            ? trimmedValue
            : trimmedValue.toLowerCase();

        return filteredFiles.filter(file =>
            file.fields.some(field => {
                const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
                if (normalizedFieldName !== sourceFieldName) {
                    return false;
                }

                // Check valueCounts first (contains all values from all occurrences)
                if (field.valueCounts && typeof field.valueCounts === 'object') {
                    const valueCountsKeys = Object.keys(field.valueCounts);
                    // Check if any value in valueCounts matches the filter value
                    for (const valueKey of valueCountsKeys) {
                        const trimmedValueKey = valueKey ? valueKey.trim() : '';
                        if (trimmedValueKey.length > 0) {
                            const candidateValue = sourceFieldCaseSensitive ? trimmedValueKey : trimmedValueKey.toLowerCase();
                            if (candidateValue === normalizedFilterValue) {
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

                const candidateValue = sourceFieldCaseSensitive ? textValue : textValue.toLowerCase();
                return candidateValue === normalizedFilterValue;
            })
        );
    }, [filteredFiles, sourceType, sourceFieldName, sourceFieldValue, sourceFieldCaseSensitive, prefixToRemove]);

    // Initialize fields based on selection (using filtered files)
    useEffect(() => {
        let initialFields = [];
        if (sourceType === 'merged') {
            initialFields = mergeFieldsFromFiles(filteredFiles, prefixToRemove) || [];
        } else if (sourceType === 'common') {
            // For common fields, we need to map them to a structure similar to merged fields
            // but only including those in comparison.commonFields
            if (comparison && comparison.commonFields && Array.isArray(comparison.commonFields)) {
                initialFields = comparison.commonFields.map(f => ({
                    ...f,
                    // Ensure we have necessary properties for editing
                    enabled: true,
                    customValue: f.textContent || '',
                    // If it's a string (legacy support), convert to object
                    ...(typeof f === 'string' ? { name: f, path: f, depth: 0 } : {})
                }));
            }
        } else if (sourceType === 'field-based') {
            // Filter files based on field selection and merge matching files
            if (filteredSourceFiles.length > 0) {
                initialFields = mergeFieldsFromFiles(filteredSourceFiles, prefixToRemove) || [];
            }
        }

        // For common fields, recompute comparison with filtered files if filters are active
        // Always recompute when filters are active, even if filteredFiles is empty (to show empty result, not unfiltered fields)
        if (sourceType === 'common' && isFilterActive) {
            const filteredComparison = compareFields(filteredFiles, prefixToRemove);
            if (filteredComparison && filteredComparison.commonFields && Array.isArray(filteredComparison.commonFields)) {
                initialFields = filteredComparison.commonFields.map(f => ({
                    ...f,
                    enabled: true,
                    customValue: f.textContent || '',
                    ...(typeof f === 'string' ? { name: f, path: f, depth: 0 } : {})
                }));
            } else {
                // If no common fields found (e.g., when filteredFiles is empty), set to empty array
                initialFields = [];
            }
        }

        // Add UI state properties and ensure depth matches path structure
        const fieldsWithState = initialFields.map(f => {
            // Calculate depth from path structure to ensure consistency
            const pathDepth = f.path ? f.path.split(' > ').length - 1 : 0;
            
            // For leaf nodes (fields without children), always provide customValue
            // so they can be edited even if they don't currently have text content
            const isLeafNode = !f.hasChildren;
            const customValue = f.customValue !== undefined 
                ? f.customValue 
                : (isLeafNode ? (f.textContent || '') : (f.textContent || ''));
            
            return {
                ...f,
                enabled: f.enabled !== undefined ? f.enabled : true,
                customValue: customValue,
                // Ensure unique ID for React keys if not present
                uiId: f.path || Math.random().toString(36).substr(2, 9),
                // Ensure depth matches path structure
                depth: pathDepth
            };
        });

        setFields(fieldsWithState);
    }, [sourceType, filteredFiles, comparison, prefixToRemove, filteredSourceFiles, isFilterActive]);

    // Ensure fields are always displayed with correct depth calculated from path
    // and sorted hierarchically (parents before children, maintaining XML order)
    const displayFields = useMemo(() => {
        // First, recalculate depth from path structure
        const fieldsWithCorrectDepth = fields.map(field => {
            const calculatedDepth = field.path ? field.path.split(' > ').length - 1 : 0;
            return {
                ...field,
                depth: calculatedDepth
            };
        });

        // Build a tree structure and flatten it to ensure correct order
        // Use uiId as key to handle duplicate paths correctly
        const fieldMap = new Map();
        const rootFields = [];

        // First pass: create all nodes
        fieldsWithCorrectDepth.forEach(field => {
            const node = {
                ...field,
                children: []
            };
            fieldMap.set(field.uiId, node);
            
            if (!field.parentPath || field.parentPath === '') {
                rootFields.push(node);
            }
        });

        // Second pass: build parent-child relationships
        // For each field, find its parent by matching parentPath
        // Since paths can be duplicated, we need to find the most recent parent with matching path
        fieldsWithCorrectDepth.forEach(field => {
            const node = fieldMap.get(field.uiId);
            if (field.parentPath && field.parentPath !== '') {
                // Find the most recent parent with matching path that appears before this field
                // The parent should have depth = field.depth - 1
                let parentNode = null;
                const currentIndex = fieldsWithCorrectDepth.findIndex(f => f.uiId === field.uiId);
                const expectedParentDepth = field.depth - 1;
                
                for (let i = currentIndex - 1; i >= 0; i--) {
                    const candidate = fieldsWithCorrectDepth[i];
                    // Check if this candidate is the parent: same path and correct depth
                    if (candidate.path === field.parentPath && candidate.depth === expectedParentDepth) {
                        parentNode = fieldMap.get(candidate.uiId);
                        break;
                    }
                    // Stop if we hit a field with same or lesser depth (we've gone past potential parents)
                    if (candidate.depth < expectedParentDepth) {
                        break;
                    }
                }
                
                if (parentNode) {
                    parentNode.children.push(node);
                } else {
                    // Parent not found, treat as root
                    rootFields.push(node);
                }
            }
        });

        // Sort root fields by their position in the original fields array (maintain insertion order)
        // Use a map to track original positions
        const positionMap = new Map();
        fieldsWithCorrectDepth.forEach((field, index) => {
            positionMap.set(field.uiId, index);
        });
        
        rootFields.sort((a, b) => {
            const posA = positionMap.get(a.uiId) ?? 999999;
            const posB = positionMap.get(b.uiId) ?? 999999;
            return posA - posB;
        });

        // Recursive function to sort children and flatten tree
        const sortAndFlatten = (nodes) => {
            const result = [];
            nodes.forEach(node => {
                // Sort children by their position in the original array
                node.children.sort((a, b) => {
                    const posA = positionMap.get(a.uiId) ?? 999999;
                    const posB = positionMap.get(b.uiId) ?? 999999;
                    return posA - posB;
                });
                
                // Add current node
                const { children, ...fieldData } = node;
                result.push(fieldData);
                
                // Recursively add children
                result.push(...sortAndFlatten(node.children));
            });
            return result;
        };

        return sortAndFlatten(rootFields);
    }, [fields]);

    // Determine source files based on sourceType (using filtered files)
    const sourceFiles = useMemo(() => {
        if (sourceType === 'merged') {
            return filteredFiles;
        } else if (sourceType === 'common') {
            return filteredFiles; // Common fields exist in filtered files
        } else if (sourceType === 'field-based') {
            return filteredSourceFiles;
        }
        return [];
    }, [sourceType, filteredFiles, filteredSourceFiles]);

    // Compute available values for each field
    const fieldValuesMap = useMemo(() => {
        const valuesMap = new Map();
        
        if (sourceFiles.length === 0) {
            return valuesMap;
        }
        
        displayFields.forEach(field => {
            // Only compute values for leaf nodes (fields without children)
            if (!field.hasChildren) {
                const values = getFieldValuesFromFiles(
                    sourceFiles,
                    field.name,
                    field.parentPath || '',
                    prefixToRemove
                );
                valuesMap.set(field.uiId, values);
            }
        });
        
        return valuesMap;
    }, [displayFields, sourceFiles, prefixToRemove]);

    // Build name-value mapping from source files
    // Maps each Name value to the set of Value values that appear with it in sample files
    // Uses actual XML structure to ensure Name-Value pairs are from the same Characteristic block
    const nameValueMapping = useMemo(() => {
        const mapping = new Map();
        
        if (sourceFiles.length === 0) {
            return mapping;
        }
        
        // Scan all source files for Name-Value pairs under Characteristics > Characteristic
        sourceFiles.forEach(file => {
            if (!file.xmlDoc) return;
            
            // Traverse XML to find Characteristic elements
            const traverse = (node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const nodeName = node.nodeName;
                    const normalizedName = removePrefixFromFieldName(nodeName, prefixToRemove);
                    
                    // Check if this is a Characteristic element
                    if (normalizedName === 'Characteristic' || nodeName.includes('Characteristic')) {
                        // Find Name and Value children
                        let nameValue = null;
                        let valueValue = null;
                        
                        for (let child of node.children) {
                            if (child.nodeType === Node.ELEMENT_NODE) {
                                const childName = removePrefixFromFieldName(child.nodeName, prefixToRemove);
                                if (childName === 'Name' && child.textContent) {
                                    nameValue = child.textContent.trim();
                                } else if (childName === 'Value' && child.textContent) {
                                    valueValue = child.textContent.trim();
                                }
                            }
                        }
                        
                        // If we found both Name and Value, add to mapping
                        // Store the name as-is (trimmed) so it matches what users select
                        if (nameValue && valueValue && nameValue.length > 0 && valueValue.length > 0) {
                            if (!mapping.has(nameValue)) {
                                mapping.set(nameValue, new Set());
                            }
                            mapping.get(nameValue).add(valueValue);
                        }
                    }
                    
                    // Continue traversing
                    for (let child of node.children) {
                        traverse(child);
                    }
                }
            };
            
            traverse(file.xmlDoc.documentElement);
        });
        
        return mapping;
    }, [sourceFiles, prefixToRemove]);

    // Get paired values for Value field based on selected Name field
    const getPairedValues = (valueField) => {
        const valueFieldParentPath = valueField.parentPath || '';
        const normalizedValueFieldParentPath = removePrefixFromPath(valueFieldParentPath, prefixToRemove);
        
        // Find the Name field in the SAME characteristic block as this Value field
        // We need to find the Name that's in the same block, not just any Name with the same parentPath
        // Since Name and Value are siblings, they share the same parentPath, but we need to find
        // the specific Name in the same Characteristic block
        
        // First, find the index of the Value field in the fields array
        const valueFieldIndex = fields.findIndex(f => f.uiId === valueField.uiId);
        if (valueFieldIndex === -1) {
            return [];
        }
        
        // Get the block that contains this Value field
        // But also search backwards from the Value field to find the Name field in the same Characteristic block
        // The Name field should be a sibling of the Value field (same parentPath)
        let nameField = null;
        
        // First try: search backwards from the Value field (Name usually comes before Value)
        for (let i = valueFieldIndex; i >= 0; i--) {
            const f = fields[i];
            if (f.hasChildren || !f.enabled) continue;
            
            const normalizedFieldName = removePrefixFromFieldName(f.name, prefixToRemove);
            const normalizedParentPath = removePrefixFromPath(f.parentPath || '', prefixToRemove);
            
            // If we've gone past the parent block, stop searching
            if (normalizedParentPath !== normalizedValueFieldParentPath) {
                break;
            }
            
            // Found the Name field in the same block
            if (normalizedFieldName === 'Name') {
                nameField = f;
                break;
            }
        }
        
        // If not found backwards, try forwards (shouldn't happen, but just in case)
        if (!nameField) {
            for (let i = valueFieldIndex + 1; i < fields.length; i++) {
                const f = fields[i];
                if (f.hasChildren || !f.enabled) continue;
                
                const normalizedFieldName = removePrefixFromFieldName(f.name, prefixToRemove);
                const normalizedParentPath = removePrefixFromPath(f.parentPath || '', prefixToRemove);
                
                // If we've gone past the parent block, stop searching
                if (normalizedParentPath !== normalizedValueFieldParentPath) {
                    break;
                }
                
                // Found the Name field in the same block
                if (normalizedFieldName === 'Name') {
                    nameField = f;
                    break;
                }
            }
        }
        
        // If Name is selected, use the name-value mapping to get paired values
        if (nameField && nameField.customValue && nameField.customValue.trim()) {
            const selectedName = nameField.customValue.trim();
            
            // Use the pre-built mapping for efficient lookup
            if (nameValueMapping.has(selectedName)) {
                const pairedValues = Array.from(nameValueMapping.get(selectedName));
                return pairedValues.sort((a, b) => a.localeCompare(b));
            }
            
            // Fallback: return empty array if name not found in mapping
            return [];
        }
        
        // If Name is not selected, return empty array
        return [];
    };

    // Get filtered available values for a field (excluding values already used in sibling fields within the SAME block)
    const getFilteredAvailableValues = (field) => {
        let allValues;
        
        // Check if this is a Value field using normalized name
        const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
        
        // If this is a Value field, get paired values based on Name selection
        if (normalizedFieldName === 'Value') {
            allValues = getPairedValues(field);
            // If getPairedValues returns empty (Name not found or not in mapping),
            // don't fall back to all values - that would show wrong values
            // Just return empty array so dropdown doesn't show
        } else {
            allValues = fieldValuesMap.get(field.uiId) || [];
        }
        
        // Only filter within the SAME Characteristic block (same parentPath)
        // Values should be independent across different Characteristic blocks
        const siblingFields = fields.filter(f => {
            if (f.hasChildren || !f.enabled || f.uiId === field.uiId) return false;
            if (!f.customValue || !f.customValue.trim().length) return false;
            
            // Use normalized names and paths for comparison
            const normalizedFName = removePrefixFromFieldName(f.name, prefixToRemove);
            const normalizedFieldNameForComparison = removePrefixFromFieldName(field.name, prefixToRemove);
            const normalizedFParentPath = removePrefixFromPath(f.parentPath || '', prefixToRemove);
            const normalizedFieldParentPath = removePrefixFromPath(field.parentPath || '', prefixToRemove);
            
            return normalizedFName === normalizedFieldNameForComparison &&
                   normalizedFParentPath === normalizedFieldParentPath;
        });
        
        // Get all values already used by siblings in the SAME block
        const usedValues = new Set(
            siblingFields.map(f => f.customValue.trim())
        );
        
        // Filter out used values (only within the same block)
        const filteredValues = allValues.filter(value => !usedValues.has(value));
        
        return filteredValues;
    };

    const handleFieldChange = (uiId, updates) => {
        setFields(prev => {
            const updatedFields = prev.map(f =>
                f.uiId === uiId ? { ...f, ...updates } : f
            );
            
            // If Name field changed, clear the Value field in the same characteristic block
            const changedField = updatedFields.find(f => f.uiId === uiId);
            if (changedField && changedField.name === 'Name' && updates.customValue !== undefined) {
                // Find the Value field in the same parent block
                const valueField = updatedFields.find(f => 
                    f.name === 'Value' && 
                    f.parentPath === changedField.parentPath &&
                    f.uiId !== uiId
                );
                
                if (valueField) {
                    // Clear the Value field when Name changes
                    const valueFieldIndex = updatedFields.findIndex(f => f.uiId === valueField.uiId);
                    if (valueFieldIndex !== -1) {
                        updatedFields[valueFieldIndex] = {
                            ...updatedFields[valueFieldIndex],
                            customValue: ''
                        };
                    }
                }
            }
            
            return updatedFields;
        });
    };

    const updateFieldPath = (field, newParentPath, newDepth) => {
        const newPath = newParentPath ? `${newParentPath} > ${field.name}` : field.name;
        
        // Calculate depth from path structure to ensure consistency
        // Depth = number of " > " separators in the path
        const calculatedDepth = newPath.split(' > ').length - 1;

        return {
            ...field,
            path: newPath,
            parentPath: newParentPath,
            depth: calculatedDepth // Use calculated depth instead of passed newDepth
        };
    };

    const handleIndent = (index) => {
        if (index === 0) return; // Can't indent first item

        const field = fields[index];
        const prevField = fields[index - 1];

        // Logic: Make 'field' a child of 'prevField'
        // New parent path is prevField.path
        // New depth is prevField.depth + 1

        const newParentPath = prevField.path;
        const newDepth = prevField.depth + 1;

        // We need to update this field AND all its children
        const oldPathPrefix = field.path;

        setFields(prev => {
            const newFields = [...prev];

            // Update the indented field
            newFields[index] = updateFieldPath(field, newParentPath, newDepth);

            // Update all children (fields that start with the old path)
            for (let i = 0; i < newFields.length; i++) {
                if (i === index) continue;

                if (newFields[i].path.startsWith(oldPathPrefix + ' > ')) {
                    const suffix = newFields[i].path.substring(oldPathPrefix.length);
                    const childNewPath = newFields[index].path + suffix;
                    const childNewParentPath = childNewPath.substring(0, childNewPath.lastIndexOf(' > '));
                    
                    // Calculate depth from path structure
                    const childNewDepth = childNewPath.split(' > ').length - 1;

                    newFields[i] = {
                        ...newFields[i],
                        path: childNewPath,
                        parentPath: childNewParentPath,
                        depth: childNewDepth // Calculate from path structure
                    };
                }
            }

            return newFields;
        });
    };

    const getFieldBlock = (startIndex, allFields) => {
        const field = allFields[startIndex];
        let endIndex = startIndex;
        // Find the end of this block (all subsequent fields with greater depth)
        for (let i = startIndex + 1; i < allFields.length; i++) {
            if (allFields[i].depth <= field.depth) {
                break;
            }
            endIndex = i;
        }
        return { start: startIndex, end: endIndex };
    };

    const handleDuplicateBlock = (uiId) => {
        // Find the field in displayFields to get the correct block
        const displayIndex = displayFields.findIndex(f => f.uiId === uiId);
        if (displayIndex === -1) return;
        
        const block = getFieldBlock(displayIndex, displayFields);
        const blockDisplayFields = displayFields.slice(block.start, block.end + 1);
        
        // Get all uiIds in the block
        const blockUiIds = new Set(blockDisplayFields.map(f => f.uiId));
        
        // Create a map of uiId to actual field data for quick lookup
        const fieldMap = new Map();
        fields.forEach(f => fieldMap.set(f.uiId, f));
        
        // Get fields in displayFields order (preserving hierarchy)
        const blockFields = blockDisplayFields
            .map(displayField => fieldMap.get(displayField.uiId))
            .filter(f => f !== undefined);
        
        if (blockFields.length === 0) return;
        
        // Check if this is a Characteristic block (has Name and Value fields under Characteristic parent)
        const isCharacteristicBlock = blockFields.some(f => {
            const normalizedName = removePrefixFromFieldName(f.name, prefixToRemove);
            const normalizedParentPath = removePrefixFromPath(f.parentPath || '', prefixToRemove);
            return normalizedName === 'Name' && 
                   normalizedParentPath.includes('Characteristic') &&
                   !normalizedParentPath.endsWith('Characteristics');
        });
        
        // Find the maximum index of any field in this block within the fields array
        // This ensures we insert after the entire block
        let maxBlockIndex = -1;
        fields.forEach((field, index) => {
            if (blockUiIds.has(field.uiId) && index > maxBlockIndex) {
                maxBlockIndex = index;
            }
        });
        
        if (maxBlockIndex === -1) return;
        
        // Create duplicates with new unique IDs, preserving the order
        const duplicatedFields = blockFields.map(field => ({
            ...field,
            uiId: Math.random().toString(36).substr(2, 9) + '-' + Date.now()
        }));
        
        // If this is a Characteristic block, auto-select next unused name and clear value
        if (isCharacteristicBlock && sourceFiles.length > 0) {
            // Find the Name field in the duplicated block
            const nameFieldIndex = duplicatedFields.findIndex(f => {
                const normalizedName = removePrefixFromFieldName(f.name, prefixToRemove);
                return normalizedName === 'Name';
            });
            
            if (nameFieldIndex !== -1) {
                const nameField = duplicatedFields[nameFieldIndex];
                const nameFieldParentPath = nameField.parentPath || '';
                
                // Get all available Name values from sample files
                const allAvailableNames = getFieldValuesFromFiles(
                    sourceFiles,
                    'Name',
                    nameFieldParentPath,
                    prefixToRemove
                );
                
                // Get all currently used Name values from existing fields
                const usedNames = new Set();
                fields.forEach(f => {
                    const normalizedName = removePrefixFromFieldName(f.name, prefixToRemove);
                    const normalizedParentPath = removePrefixFromPath(f.parentPath || '', prefixToRemove);
                    if (normalizedName === 'Name' && 
                        normalizedParentPath === removePrefixFromPath(nameFieldParentPath, prefixToRemove) &&
                        f.customValue && f.customValue.trim()) {
                        usedNames.add(f.customValue.trim());
                    }
                });
                
                // Find the first unused name (or next in sequence)
                let nextName = '';
                for (const availableName of allAvailableNames) {
                    if (!usedNames.has(availableName)) {
                        nextName = availableName;
                        break;
                    }
                }
                
                // If all names are used, use the first available name anyway
                if (!nextName && allAvailableNames.length > 0) {
                    nextName = allAvailableNames[0];
                }
                
                // Update the Name field with the next unused name
                duplicatedFields[nameFieldIndex] = {
                    ...duplicatedFields[nameFieldIndex],
                    customValue: nextName
                };
                
                // Find and prefill the Value field in the duplicated block
                const valueFieldIndex = duplicatedFields.findIndex(f => {
                    const normalizedName = removePrefixFromFieldName(f.name, prefixToRemove);
                    return normalizedName === 'Value';
                });
                
                if (valueFieldIndex !== -1 && nextName) {
                    // Get the first available value for this name from the mapping
                    let prefilledValue = '';
                    if (nameValueMapping.has(nextName)) {
                        const availableValues = Array.from(nameValueMapping.get(nextName));
                        if (availableValues.length > 0) {
                            prefilledValue = availableValues[0]; // Use first available value
                        }
                    }
                    
                    duplicatedFields[valueFieldIndex] = {
                        ...duplicatedFields[valueFieldIndex],
                        customValue: prefilledValue
                    };
                }
            }
        }

        // Insert the duplicated block right after the original block
        setFields(prev => {
            const newFields = [...prev];
            return [
                ...newFields.slice(0, maxBlockIndex + 1),
                ...duplicatedFields,
                ...newFields.slice(maxBlockIndex + 1)
            ];
        });
    };

    const handleDeleteBlock = (uiId) => {
        // Find the field in displayFields to get the correct block
        const displayIndex = displayFields.findIndex(f => f.uiId === uiId);
        if (displayIndex === -1) return;
        
        const block = getFieldBlock(displayIndex, displayFields);
        const blockDisplayFields = displayFields.slice(block.start, block.end + 1);
        
        // Get all uiIds to remove
        const uiIdsToRemove = new Set(blockDisplayFields.map(f => f.uiId));
        
        // Remove the block from fields array
        setFields(prev => prev.filter(f => !uiIdsToRemove.has(f.uiId)));
    };

    const handleMoveUp = (index) => {
        if (index === 0) return;
        const field = fields[index];

        // Find previous sibling
        let prevSiblingIndex = -1;
        for (let i = index - 1; i >= 0; i--) {
            if (fields[i].depth === field.depth) {
                prevSiblingIndex = i;
                break;
            }
            if (fields[i].depth < field.depth) {
                break; // Hit parent
            }
        }

        if (prevSiblingIndex === -1) return; // No previous sibling

        // Get blocks
        const currentBlock = getFieldBlock(index, fields);
        const prevBlock = getFieldBlock(prevSiblingIndex, fields);

        setFields(prev => {
            const newFields = [...prev];
            const block1 = newFields.slice(prevBlock.start, prevBlock.end + 1);
            const block2 = newFields.slice(currentBlock.start, currentBlock.end + 1);

            const partBefore = newFields.slice(0, prevBlock.start);
            const partAfter = newFields.slice(currentBlock.end + 1);

            return [...partBefore, ...block2, ...block1, ...partAfter];
        });
    };

    const handleMoveDown = (index) => {
        const field = fields[index];
        const currentBlock = getFieldBlock(index, fields);

        if (currentBlock.end >= fields.length - 1) return;

        let nextSiblingIndex = -1;
        const candidateIndex = currentBlock.end + 1;
        if (candidateIndex < fields.length && fields[candidateIndex].depth === field.depth) {
            nextSiblingIndex = candidateIndex;
        }

        if (nextSiblingIndex === -1) return;

        const nextBlock = getFieldBlock(nextSiblingIndex, fields);

        setFields(prev => {
            const newFields = [...prev];
            const block1 = newFields.slice(currentBlock.start, currentBlock.end + 1);
            const block2 = newFields.slice(nextBlock.start, nextBlock.end + 1);

            const partBefore = newFields.slice(0, currentBlock.start);
            const partAfter = newFields.slice(nextBlock.end + 1);

            return [...partBefore, ...block2, ...block1, ...partAfter];
        });
    };

    const handleOutdent = (index) => {
        const field = fields[index];
        if (field.depth === 0) return; // Can't outdent root

        // Logic: Make 'field' a sibling of its current parent
        // New parent path is the parent of the current parent

        const currentParentPath = field.parentPath || '';
        const lastSep = currentParentPath.lastIndexOf(' > ');
        const newParentPath = lastSep !== -1 ? currentParentPath.substring(0, lastSep) : '';
        const newDepth = field.depth - 1;

        const oldPathPrefix = field.path;

        setFields(prev => {
            const newFields = [...prev];

            // Update the outdented field
            newFields[index] = updateFieldPath(field, newParentPath, newDepth);

            // Update all children
            for (let i = 0; i < newFields.length; i++) {
                if (i === index) continue;

                if (newFields[i].path.startsWith(oldPathPrefix + ' > ')) {
                    const suffix = newFields[i].path.substring(oldPathPrefix.length);
                    const childNewPath = newFields[index].path + suffix;
                    const childNewParentPath = childNewPath.substring(0, childNewPath.lastIndexOf(' > '));
                    
                    // Calculate depth from path structure
                    const childNewDepth = childNewPath.split(' > ').length - 1;

                    newFields[i] = {
                        ...newFields[i],
                        path: childNewPath,
                        parentPath: childNewParentPath,
                        depth: childNewDepth // Calculate from path structure
                    };
                }
            }

            return newFields;
        });
    };
    const generateXML = () => {
        // Filter enabled fields
        const enabledFields = fields.filter(f => f.enabled);

        if (enabledFields.length === 0) {
            setGeneratedXML('<!-- No fields enabled -->');
            return;
        }

        // Build tree structure from flat fields
        // We need to reconstruct the hierarchy based on paths
        const root = { children: [] };
        const pathMap = new Map();
        pathMap.set('', root);

        // Use displayFields order (which maintains hierarchy) but get actual field data from enabledFields
        // This ensures we process fields in the correct hierarchical order with correct values
        const enabledDisplayFields = displayFields
            .filter(f => enabledFields.some(ef => ef.uiId === f.uiId))
            .map(displayField => {
                // Get the actual field data with updated customValue
                const actualField = enabledFields.find(ef => ef.uiId === displayField.uiId);
                return actualField || displayField;
            });
        
        // Track the last node created for each path to handle duplicates
        // When we have duplicate paths, children should attach to the most recent parent with that path
        const lastNodeForPath = new Map();
        lastNodeForPath.set('', root);
        
        enabledDisplayFields.forEach((field, fieldIndex) => {
            const parentPath = field.parentPath || '';
            let parentNode = lastNodeForPath.get(parentPath);

            // If parent doesn't exist, try to find the nearest enabled ancestor
            if (!parentNode) {
                let currentPath = parentPath;
                while (currentPath && !lastNodeForPath.has(currentPath)) {
                    const lastSep = currentPath.lastIndexOf(' > ');
                    if (lastSep === -1) currentPath = '';
                    else currentPath = currentPath.substring(0, lastSep);
                }
                parentNode = lastNodeForPath.get(currentPath) || root;
            }

            const node = {
                name: removePrefixFromFieldName(field.name, prefixToRemove),
                text: field.hasChildren ? undefined : field.customValue,
                children: [],
                attributes: field.attributes || []
            };

            parentNode.children.push(node);
            // Update the last node for this path (handles duplicates - last one wins for children lookup)
            lastNodeForPath.set(field.path, node);
            // Also store by uiId for direct lookup if needed
            pathMap.set(field.uiId, node);
        });

        // Helper function to escape XML text content
        const escapeXML = (text) => {
            if (!text) return '';
            return String(text)
                .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        };

        // Recursive function to build XML string
        const buildXMLString = (node, indentLevel = 0) => {
            const indent = '  '.repeat(indentLevel);
            let xml = '';

            node.children.forEach(child => {
                xml += `${indent}<${child.name}`;

                // Add attributes if any (placeholder for now as we don't have attribute editing yet)
                // if (child.attributes && child.attributes.length > 0) { ... }

                xml += '>';

                if (child.children.length > 0) {
                    xml += '\n';
                    xml += buildXMLString(child, indentLevel + 1);
                    xml += `${indent}</${child.name}>\n`;
                } else {
                    if (child.text) {
                        xml += escapeXML(child.text);
                    }
                    xml += `</${child.name}>\n`;
                }
            });

            return xml;
        };

        const xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + buildXMLString(root);
        setGeneratedXML(xmlContent);
    };

    const handleDownload = () => {
        const blob = new Blob([generatedXML], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getGeneratedFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'preview'
    const [openDropdownFieldId, setOpenDropdownFieldId] = useState(null); // Track which field's dropdown is open
    
    // Format Helper state
    const [isFormatHelperExpanded, setIsFormatHelperExpanded] = useState(true);
    const [generatedDateTime, setGeneratedDateTime] = useState(null);
    const [copyFeedback, setCopyFeedback] = useState(null);
    const [enableFilenameGeneration, setEnableFilenameGeneration] = useState(false);

    const handleKeyDown = (e) => {
        if (!selectedFieldId) return;

        const index = fields.findIndex(f => f.uiId === selectedFieldId);
        if (index === -1) return;

        // Prevent default scrolling for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }

        const isCmdOrCtrl = e.metaKey || e.ctrlKey;

        if (isCmdOrCtrl) {
            // Actions
            if (e.key === 'ArrowUp') handleMoveUp(index);
            if (e.key === 'ArrowDown') handleMoveDown(index);
            if (e.key === 'ArrowRight') handleIndent(index);
            if (e.key === 'ArrowLeft') handleOutdent(index);
        } else {
            // Navigation
            if (e.key === 'ArrowUp') {
                const prevIndex = index > 0 ? index - 1 : index;
                setSelectedFieldId(fields[prevIndex].uiId);
            }
            if (e.key === 'ArrowDown') {
                const nextIndex = index < fields.length - 1 ? index + 1 : index;
                setSelectedFieldId(fields[nextIndex].uiId);
            }
        }
    };

    // Drag and Drop Handlers
    const onDragStart = (e, index) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Set transparent drag image or custom one if needed
        // e.dataTransfer.setDragImage(e.target, 0, 0);
    };

    const onDragOver = (e, index) => {
        e.preventDefault();
        // Optional: Add visual feedback for drop target here if not using CSS :hover
    };

    const onDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;

        // Reorder fields
        // We need to move the dragged BLOCK (field + children) to the new position
        // For simplicity, let's just move the single field for now, OR handle blocks if we want to be robust.
        // Let's reuse the block logic for robustness.

        const draggedBlock = getFieldBlock(draggedItemIndex, fields);

        // If dropping INSIDE the dragged block, ignore
        if (dropIndex >= draggedBlock.start && dropIndex <= draggedBlock.end) return;

        setFields(prev => {
            const newFields = [...prev];
            const block = newFields.slice(draggedBlock.start, draggedBlock.end + 1);

            // Remove block from old position
            const fieldsWithoutBlock = [
                ...newFields.slice(0, draggedBlock.start),
                ...newFields.slice(draggedBlock.end + 1)
            ];

            // Calculate new insertion index
            // We need to adjust dropIndex because removing the block might shift indices
            let insertionIndex = dropIndex;
            if (dropIndex > draggedBlock.start) {
                insertionIndex -= block.length;
            }

            // Insert block at new position
            // If dropping on an item, insert AFTER it (or before? let's say after for now)
            // Actually, standard DnD usually inserts BEFORE the target if dragging up, AFTER if dragging down.
            // Let's stick to "Insert Before" logic for simplicity or "Insert After" based on direction.

            // Simplified: Insert AT the drop index (pushing current item down)

            return [
                ...fieldsWithoutBlock.slice(0, insertionIndex),
                ...block,
                ...fieldsWithoutBlock.slice(insertionIndex)
            ];
        });

        setDraggedItemIndex(null);
    };

    // Format Helper Functions
    const getWorkOrderNumber = () => {
        const workOrderField = fields.find(field => 
            removePrefixFromFieldName(field.name, prefixToRemove)
                .toLowerCase() === 'workordernumber'
        );
        return workOrderField?.customValue || '';
    };

    // Remove leading zeros from WorkOrderNumber
    const getWorkOrderNumberWithoutLeadingZeros = () => {
        const workOrderNumber = getWorkOrderNumber();
        if (!workOrderNumber) return '';
        // Remove all leading zeros, but keep at least one digit if the entire value is zeros
        const cleaned = workOrderNumber.replace(/^0+/, '');
        return cleaned || '0';
    };

    const handleWorkOrderNumberChange = (newValue) => {
        const workOrderField = fields.find(field => 
            removePrefixFromFieldName(field.name, prefixToRemove)
                .toLowerCase() === 'workordernumber'
        );
        if (workOrderField) {
            handleFieldChange(workOrderField.uiId, { customValue: newValue });
        }
    };

    const handleDateTimeChange = (newIsoValue) => {
        // Allow typing freely, but validate format when complete
        // Parse the ISO format: YYYY-MM-DDTHH:MM:SS
        const match = newIsoValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
        
        if (match) {
            // Valid format - update stored DateTime with parsed values
            const [, year, month, day, hours, minutes, seconds] = match;
            const date = `${year}${month}${day}`;
            const time = `${hours}${minutes}${seconds}`;
            
            setGeneratedDateTime({ iso: newIsoValue, date, time });
        } else {
            // Invalid format - still update the ISO value for display, but keep old date/time if available
            // This allows users to type freely without errors
            setGeneratedDateTime(prev => {
                if (prev) {
                    return { ...prev, iso: newIsoValue };
                } else {
                    // If no previous value, create a placeholder (will be validated on blur)
                    return { iso: newIsoValue, date: '', time: '' };
                }
            });
        }
    };

    const handleDateTimeBlur = () => {
        // Validate format on blur
        if (generatedDateTime && generatedDateTime.iso) {
            const match = generatedDateTime.iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
            if (!match) {
                alert('Invalid DateTime format. Please use YYYY-MM-DDTHH:MM:SS format (e.g., 2024-10-07T11:52:43)');
                // If we have valid date/time from before, restore the ISO to match them
                if (generatedDateTime.date && generatedDateTime.time) {
                    const date = generatedDateTime.date;
                    const time = generatedDateTime.time;
                    const iso = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}T${time.substring(0,2)}:${time.substring(2,4)}:${time.substring(4,6)}`;
                    setGeneratedDateTime({ iso, date, time });
                } else {
                    // No valid previous value, regenerate
                    handleGenerateDateTime();
                }
            }
        }
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text)
            .then(() => {
                setCopyFeedback({ label, value: text });
                setTimeout(() => setCopyFeedback(null), 2000);
            })
            .catch(err => {
                alert('Failed to copy to clipboard: ' + err.message);
            });
    };

    const handleGenerateDateTime = () => {
        const now = new Date();
        
        // Format: YYYY-MM-DDTHH:MM:SS
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const iso = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        const date = `${year}${month}${day}`;
        const time = `${hours}${minutes}${seconds}`;
        
        const dateTimeObj = { iso, date, time };
        setGeneratedDateTime(dateTimeObj);
        copyToClipboard(iso, 'DateTime');
    };

    const isDateTimeValid = () => {
        return generatedDateTime && 
               generatedDateTime.date && 
               generatedDateTime.time && 
               generatedDateTime.date.length === 8 && 
               generatedDateTime.time.length === 6;
    };

    const handleGenerateEventID = () => {
        if (!isDateTimeValid()) {
            alert('Please generate a valid DateTime first by clicking the DateTime button, or ensure the DateTime format is correct (YYYY-MM-DDTHH:MM:SS).');
            return;
        }
        
        const workOrderNumber = getWorkOrderNumberWithoutLeadingZeros();
        if (!workOrderNumber) {
            alert('WorkOrderNumber field not found or is empty. Please add and fill the WorkOrderNumber field in your configuration.');
            return;
        }
        
        // Format: 0000{WorkOrderNumber}-YYYYMMDD-HHMMSS
        // WorkOrderNumber has leading zeros removed before adding 0000 prefix
        const eventID = `0000${workOrderNumber}-${generatedDateTime.date}-${generatedDateTime.time}`;
        copyToClipboard(eventID, 'EventID');
    };

    // Extract last 3 digits from filtered filenames
    const getLastThreeDigitsFromFiles = () => {
        if (!filteredFiles || filteredFiles.length === 0) return '';
        
        // Extract all digits from filtered filenames
        const allDigits = filteredFiles
            .map(file => file.filename || '')
            .join('')
            .match(/\d/g);
        
        if (!allDigits || allDigits.length === 0) return '';
        
        // Take the last 3 digits
        return allDigits.slice(-3).join('');
    };

    // Generate filename: SAP_E_OME_WO_{EventID}_{last3digits}
    const generateFilename = () => {
        if (!isDateTimeValid()) {
            alert('Please generate a valid DateTime first by clicking the DateTime button, or ensure the DateTime format is correct (YYYY-MM-DDTHH:MM:SS).');
            return;
        }
        
        const workOrderNumber = getWorkOrderNumberWithoutLeadingZeros();
        if (!workOrderNumber) {
            alert('WorkOrderNumber field not found or is empty. Please add and fill the WorkOrderNumber field in your configuration.');
            return;
        }
        
        // WorkOrderNumber has leading zeros removed before adding 0000 prefix
        const eventID = `0000${workOrderNumber}-${generatedDateTime.date}-${generatedDateTime.time}`;
        const lastThreeDigits = getLastThreeDigitsFromFiles();
        
        if (!lastThreeDigits) {
            alert('Could not extract digits from filenames. Please ensure your files have numeric characters in their names.');
            return;
        }
        
        const filename = `SAP_E_OME_WO_${eventID}_${lastThreeDigits}`;
        copyToClipboard(filename, 'Filename');
    };

    // Find field by name (case-insensitive, handles variations)
    const findFieldByName = (fieldName) => {
        const normalizedName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return fields.find(field => {
            const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '');
            return normalizedFieldName === normalizedName;
        });
    };

    // Generate all: DateTime, EventID, and auto-populate fields
    const handleGenerateAll = () => {
        // Check WorkOrderNumber first
        const workOrderNumber = getWorkOrderNumberWithoutLeadingZeros();
        if (!workOrderNumber) {
            alert('WorkOrderNumber field not found or is empty. Please add and fill the WorkOrderNumber field in your configuration.');
            return;
        }

        // Generate DateTime
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const iso = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        const date = `${year}${month}${day}`;
        const time = `${hours}${minutes}${seconds}`;
        
        const dateTimeObj = { iso, date, time };
        setGeneratedDateTime(dateTimeObj);

        // Generate EventID
        const eventID = `0000${workOrderNumber}-${date}-${time}`;

        // Auto-populate EventDateandTime field
        const eventDateField = findFieldByName('EventDateandTime') || 
                              findFieldByName('EventDateAndTime') ||
                              findFieldByName('EventDateandtime');
        if (eventDateField) {
            handleFieldChange(eventDateField.uiId, { customValue: iso });
        }

        // Auto-populate EventID field
        const eventIDField = findFieldByName('EventID') || findFieldByName('EventId');
        if (eventIDField) {
            handleFieldChange(eventIDField.uiId, { customValue: eventID });
        }

        // Show feedback message
        const filledFields = [];
        if (eventDateField) filledFields.push('EventDateandTime');
        if (eventIDField) filledFields.push('EventID');
        
        let feedbackMessage = 'Generated';
        if (filledFields.length > 0) {
            feedbackMessage = `Auto-filled: ${filledFields.join(', ')}`;
        }

        // Enable SAP filename generation by default when Generate All is clicked
        setEnableFilenameGeneration(true);
        
        // Generate and copy SAP filename
        const lastThreeDigits = getLastThreeDigitsFromFiles();
        if (lastThreeDigits) {
            const filename = `SAP_E_OME_WO_${eventID}_${lastThreeDigits}`;
            copyToClipboard(filename, feedbackMessage);
        } else {
            copyToClipboard(eventID, feedbackMessage);
        }
    };

    const getGeneratedFilename = () => {
        if (!enableFilenameGeneration) return 'generated.xml';
        
        if (!isDateTimeValid()) return 'generated.xml';
        
        const workOrderNumber = getWorkOrderNumberWithoutLeadingZeros();
        if (!workOrderNumber) return 'generated.xml';
        
        const lastThreeDigits = getLastThreeDigitsFromFiles();
        if (!lastThreeDigits) return 'generated.xml';
        
        // WorkOrderNumber has leading zeros removed before adding 0000 prefix
        const eventID = `0000${workOrderNumber}-${generatedDateTime.date}-${generatedDateTime.time}`;
        return `SAP_E_OME_WO_${eventID}_${lastThreeDigits}.xml`;
    };

    return (
        <div className="generator-view" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="generator-header">
                <div className="generator-header-row">
                    <h2>XML Generator</h2>
                    <div className="generator-controls">
                        <div className="source-selector">
                            <label>Source:</label>
                            <select
                                value={sourceType}
                                onChange={(e) => {
                                    setSourceType(e.target.value);
                                    // Clear field-based selection when switching away
                                    if (e.target.value !== 'field-based') {
                                        setSourceFieldName('');
                                        setSourceFieldValue('');
                                        setSourceFieldCaseSensitive(false);
                                    }
                                }}
                                style={{ minWidth: '150px' }}
                            >
                                <option value="merged">Merged (All Files)</option>
                                <option value="common">Common Fields</option>
                                <option value="field-based">Field-based</option>
                            </select>
                        </div>
                        <div className="view-tabs">
                            <button
                                className={`view-tab ${activeTab === 'config' ? 'active' : ''}`}
                                onClick={() => setActiveTab('config')}
                            >
                                Configuration
                            </button>
                            <button
                                className={`view-tab ${activeTab === 'preview' ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveTab('preview');
                                    generateXML(); // Auto-generate when switching to preview
                                }}
                            >
                                Preview
                            </button>
                        </div>
                    </div>
                </div>
                {sourceType === 'field-based' && (
                    <div className="generator-filter-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <select
                                value={sourceFieldName}
                                onChange={(e) => setSourceFieldName(e.target.value)}
                                style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.875rem', minWidth: '150px' }}
                            >
                                <option value="">Select field...</option>
                                {availableFields.map(fieldName => (
                                    <option key={fieldName} value={fieldName}>
                                        {fieldName}
                                    </option>
                                ))}
                            </select>
                            
                            <input
                                type="text"
                                placeholder="Enter value"
                                value={sourceFieldValue}
                                onChange={(e) => setSourceFieldValue(e.target.value)}
                                disabled={!sourceFieldName}
                                style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.875rem', width: '150px' }}
                            />
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={sourceFieldCaseSensitive}
                                    onChange={(e) => setSourceFieldCaseSensitive(e.target.checked)}
                                    disabled={!sourceFieldName}
                                />
                                Case sensitive
                            </label>
                            
                            {filteredSourceFiles.length > 0 && (
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    ({filteredSourceFiles.length} file{filteredSourceFiles.length === 1 ? '' : 's'} matched)
                                </span>
                            )}
                            {sourceFieldName && sourceFieldValue.trim() && filteredSourceFiles.length === 0 && (
                                <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>
                                    (No files matched)
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="generator-content">
                {activeTab === 'config' && (
                    <>
                        {/* Format Helper Section */}
                        <div className="format-helper-section">
                            <div 
                                className="format-helper-header"
                                onClick={() => setIsFormatHelperExpanded(!isFormatHelperExpanded)}
                            >
                                <span className="format-helper-chevron">{isFormatHelperExpanded ? '▼' : '▶'}</span>
                                <h3>Format Helpers</h3>
                            </div>
                            
                            {isFormatHelperExpanded && (
                                <div className="format-helper-content">
                                    <div className="format-helper-info">
                                        <div className="format-info-row">
                                            <span className="format-label">WorkOrderNumber:</span>
                                            <input
                                                type="text"
                                                className="format-value-input"
                                                value={getWorkOrderNumber()}
                                                onChange={(e) => handleWorkOrderNumberChange(e.target.value)}
                                                placeholder="(not set)"
                                            />
                                        </div>
                                        {generatedDateTime && (
                                            <div className="format-info-row">
                                                <span className="format-label">Stored DateTime:</span>
                                                <input
                                                    type="text"
                                                    className="format-value-input"
                                                    value={generatedDateTime.iso}
                                                    onChange={(e) => handleDateTimeChange(e.target.value)}
                                                    onBlur={handleDateTimeBlur}
                                                    placeholder="YYYY-MM-DDTHH:MM:SS"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="format-helper-buttons">
                                        <button 
                                            className="format-btn generate-all-btn"
                                            onClick={handleGenerateAll}
                                            disabled={!getWorkOrderNumber()}
                                            title={getWorkOrderNumber() ? "Generate DateTime, EventID, and auto-populate fields" : "Set WorkOrderNumber first"}
                                            style={{
                                                backgroundColor: getWorkOrderNumber() ? 'var(--primary-color)' : 'var(--text-light)',
                                                color: '#ffffff',
                                                borderColor: getWorkOrderNumber() ? 'var(--primary-color)' : 'var(--text-light)',
                                                fontWeight: '600',
                                                fontSize: '0.875rem',
                                                padding: '0.625rem 1rem'
                                            }}
                                        >
                                            <span className="format-btn-icon" style={{ fontSize: '1.25rem', color: '#ffffff' }}>⚡</span>
                                            <div className="format-btn-content">
                                                <span className="format-btn-label" style={{ color: '#ffffff', fontWeight: '700' }}>Generate All & Auto-Fill</span>
                                                <span className="format-btn-example" style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.75rem' }}>Auto-populates EventDateandTime and EventID fields</span>
                                            </div>
                                        </button>
                                        
                                        <button 
                                            className="format-btn datetime-btn"
                                            onClick={handleGenerateDateTime}
                                            title="Generate current timestamp and copy to clipboard"
                                        >
                                            <span className="format-btn-icon">📅</span>
                                            <div className="format-btn-content">
                                                <span className="format-btn-label">DateTime</span>
                                                <span className="format-btn-example">e.g., 2024-10-07T11:52:43</span>
                                            </div>
                                        </button>
                                        
                                        <button 
                                            className="format-btn eventid-btn"
                                            onClick={handleGenerateEventID}
                                            disabled={!isDateTimeValid()}
                                            title={isDateTimeValid() ? "Generate EventID using stored DateTime and copy to clipboard" : "Generate valid DateTime first"}
                                        >
                                            <span className="format-btn-icon">🔖</span>
                                            <div className="format-btn-content">
                                                <span className="format-btn-label">EventID</span>
                                                <span className="format-btn-example">e.g., 000086307211-20241007-115243</span>
                                            </div>
                                        </button>
                                    </div>
                                    
                                    {/* Filename Generation Toggle */}
                                    <div className="filename-generation-section">
                                        <label className="filename-toggle-label">
                                            <input
                                                type="checkbox"
                                                checked={enableFilenameGeneration}
                                                onChange={(e) => setEnableFilenameGeneration(e.target.checked)}
                                            />
                                            <span>Generate SAP filename</span>
                                        </label>
                                        
                                        {enableFilenameGeneration && (
                                            <div className="filename-display">
                                                {isDateTimeValid() && getWorkOrderNumber() && getLastThreeDigitsFromFiles() ? (
                                                    <>
                                                        <div className="filename-preview">
                                                            <span className="filename-label">Filename:</span>
                                                            <code className="filename-value">
                                                                SAP_E_OME_WO_{`0000${getWorkOrderNumberWithoutLeadingZeros()}-${generatedDateTime.date}-${generatedDateTime.time}`}_{getLastThreeDigitsFromFiles()}
                                                            </code>
                                                        </div>
                                                        <button
                                                            className="format-btn filename-btn"
                                                            onClick={generateFilename}
                                                            title="Copy filename to clipboard"
                                                            style={{ alignSelf: 'flex-start' }}
                                                        >
                                                            <span className="format-btn-icon">📄</span>
                                                            <div className="format-btn-content">
                                                                <span className="format-btn-label">Copy Filename</span>
                                                                <span className="format-btn-example">SAP_E_OME_WO_*EventID*_*last3digits*</span>
                                                            </div>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="filename-warning">
                                                        {!isDateTimeValid() && 'Generate valid DateTime first. '}
                                                        {!getWorkOrderNumber() && 'Set WorkOrderNumber field. '}
                                                        {!getLastThreeDigitsFromFiles() && 'Load files with digits in filenames.'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {copyFeedback && (
                                        <div className="copy-feedback">
                                            ✓ Copied {copyFeedback.label}: <code>{copyFeedback.value}</code>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="fields-editor full-width">
                            <h3>Field Configuration <span style={{ fontSize: '0.8em', fontWeight: 'normal', color: '#666' }}>(Drag to reorder, Cmd+Arrows to move/indent)</span></h3>
                            <div className="fields-list-container">
                            {sourceType === 'field-based' && (!sourceFieldName || !sourceFieldValue.trim()) && (
                                <div style={{ padding: '1rem', backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '0.5rem', marginBottom: '1rem', color: '#92400e' }}>
                                    Please select a field and enter a value above to filter source files.
                                </div>
                            )}
                            {sourceType === 'field-based' && sourceFieldName && sourceFieldValue.trim() && filteredSourceFiles.length === 0 && (
                                <div style={{ padding: '1rem', backgroundColor: '#fee2e2', border: '1px solid #f87171', borderRadius: '0.5rem', marginBottom: '1rem', color: '#991b1b' }}>
                                    No files match the selected field value. Please adjust your selection.
                                </div>
                            )}
                            {sourceType === 'field-based' && filteredSourceFiles.length > 0 && (
                                <div style={{ padding: '0.5rem 1rem', backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#166534' }}>
                                    Using {filteredSourceFiles.length} matching file{filteredSourceFiles.length === 1 ? '' : 's'} as source.
                                </div>
                            )}
                            <ul className="field-list">
                                {displayFields.map((field, index) => {
                                    // Find the original index in the fields array for drag/drop operations
                                    const originalIndex = fields.findIndex(f => f.uiId === field.uiId);
                                    return (
                                    <li
                                        key={field.uiId}
                                        style={{ paddingLeft: `${field.depth * 20}px` }}
                                        className={`field-item ${selectedFieldId === field.uiId ? 'selected' : ''} ${draggedItemIndex === originalIndex ? 'dragging' : ''}`}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, originalIndex)}
                                        onDragOver={(e) => onDragOver(e, originalIndex)}
                                        onDrop={(e) => onDrop(e, originalIndex)}
                                        onClick={() => setSelectedFieldId(field.uiId)}
                                    >
                                        <div className="field-row">
                                            <div className="drag-handle" style={{ cursor: 'grab', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', gridColumn: '1' }}>
                                                ☰
                                            </div>
                                            <button
                                                className="duplicate-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDuplicateBlock(field.uiId);
                                                }}
                                                title="Duplicate this field and its children"
                                                style={{
                                                    background: 'none',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '0.25rem',
                                                    width: '1.25rem',
                                                    height: '1.25rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '0.75rem',
                                                    padding: 0,
                                                    transition: 'all 0.2s',
                                                    gridColumn: '2',
                                                    justifySelf: 'start'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.target.style.backgroundColor = 'var(--bg-color)';
                                                    e.target.style.color = 'var(--primary-color)';
                                                    e.target.style.borderColor = 'var(--primary-color)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.target.style.backgroundColor = 'transparent';
                                                    e.target.style.color = 'var(--text-secondary)';
                                                    e.target.style.borderColor = 'var(--border-color)';
                                                }}
                                            >
                                                +
                                            </button>
                                            <button
                                                className="delete-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('Delete this field and all its children?')) {
                                                        handleDeleteBlock(field.uiId);
                                                    }
                                                }}
                                                title="Delete this field and its children"
                                                style={{
                                                    background: 'none',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '0.25rem',
                                                    width: '1.25rem',
                                                    height: '1.25rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    fontSize: '0.75rem',
                                                    padding: 0,
                                                    transition: 'all 0.2s',
                                                    gridColumn: '3',
                                                    justifySelf: 'start'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.target.style.backgroundColor = '#fee2e2';
                                                    e.target.style.color = '#dc2626';
                                                    e.target.style.borderColor = '#dc2626';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.target.style.backgroundColor = 'transparent';
                                                    e.target.style.color = 'var(--text-secondary)';
                                                    e.target.style.borderColor = 'var(--border-color)';
                                                }}
                                            >
                                                ×
                                            </button>
                                            <label className="field-label" style={{ gridColumn: '4', minWidth: 0, maxWidth: '100%' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={field.enabled}
                                                    onChange={(e) => handleFieldChange(field.uiId, { enabled: e.target.checked })}
                                                    style={{ flexShrink: 0 }}
                                                />
                                                <span className="field-name">{removePrefixFromFieldName(field.name, prefixToRemove)}</span>
                                            </label>
                                            {!field.hasChildren && (() => {
                                                const availableValues = getFilteredAvailableValues(field);
                                                const allValues = fieldValuesMap.get(field.uiId) || [];
                                                const valuesCount = availableValues.length;
                                                const allValuesCount = allValues.length;
                                                
                                                return (
                                                    <FieldValueInput
                                                        field={field}
                                                        availableValues={availableValues}
                                                        allValuesCount={allValuesCount}
                                                        valuesCount={valuesCount}
                                                        onFieldChange={handleFieldChange}
                                                        openDropdownFieldId={openDropdownFieldId}
                                                        setOpenDropdownFieldId={setOpenDropdownFieldId}
                                                    />
                                                );
                                            })()}
                                        </div>
                                    </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                    </>
                )}

                {activeTab === 'preview' && (
                    <div className="preview-panel full-width">
                        <div className="preview-header">
                            <h3>XML Preview</h3>
                            <div className="preview-actions">
                                <button className="primary-btn" onClick={generateXML}>Refresh</button>
                                {generatedXML && (
                                    <button className="secondary-btn" onClick={handleDownload}>Download</button>
                                )}
                            </div>
                        </div>
                        <pre className="xml-preview">
                            <code>{generatedXML || "Click 'Refresh' to generate XML"}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

export default GeneratorView;
