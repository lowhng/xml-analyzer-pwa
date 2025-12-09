import React, { useState, useMemo, useEffect } from 'react';
import { mergeFieldsFromFiles, removePrefixFromFieldName, removePrefixFromPath, getFieldValuesFromFiles } from '../utils/xmlParser';

function GeneratorView({ files, comparison, prefixToRemove = '' }) {
    const [sourceType, setSourceType] = useState('merged'); // 'merged', 'common', or 'field-based'
    const [fields, setFields] = useState([]);
    const [generatedXML, setGeneratedXML] = useState('');
    
    // Field-based selection state
    const [sourceFieldName, setSourceFieldName] = useState('');
    const [sourceFieldValue, setSourceFieldValue] = useState('');
    const [sourceFieldCaseSensitive, setSourceFieldCaseSensitive] = useState(false);

    // Compute available fields from all files (same logic as ComparisonView)
    const availableFields = useMemo(() => {
        const fieldNames = new Set();
        files.forEach(file => {
            file.fields.forEach(field => {
                const textValue = field.textContent ? field.textContent.trim() : '';
                if (textValue.length > 0) {
                    const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
                    fieldNames.add(normalizedName);
                }
            });
        });
        return Array.from(fieldNames).sort((a, b) => a.localeCompare(b));
    }, [files, prefixToRemove]);

    // Filter files based on field-based selection
    const filteredSourceFiles = useMemo(() => {
        if (sourceType !== 'field-based' || !sourceFieldName || !sourceFieldValue.trim()) {
            return [];
        }
        
        const trimmedValue = sourceFieldValue.trim();
        const normalizedFilterValue = sourceFieldCaseSensitive
            ? trimmedValue
            : trimmedValue.toLowerCase();

        return files.filter(file =>
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
    }, [files, sourceType, sourceFieldName, sourceFieldValue, sourceFieldCaseSensitive, prefixToRemove]);

    // Initialize fields based on selection
    useEffect(() => {
        let initialFields = [];
        if (sourceType === 'merged') {
            initialFields = mergeFieldsFromFiles(files, prefixToRemove) || [];
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
    }, [sourceType, files, comparison, prefixToRemove, filteredSourceFiles]);

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

    // Determine source files based on sourceType
    const sourceFiles = useMemo(() => {
        if (sourceType === 'merged') {
            return files;
        } else if (sourceType === 'common') {
            return files; // Common fields exist in all files
        } else if (sourceType === 'field-based') {
            return filteredSourceFiles;
        }
        return [];
    }, [sourceType, files, filteredSourceFiles]);

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

    const handleFieldChange = (uiId, updates) => {
        setFields(prev => prev.map(f =>
            f.uiId === uiId ? { ...f, ...updates } : f
        ));
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
                        xml += `${child.text}`;
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
        a.download = 'generated.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const [selectedFieldId, setSelectedFieldId] = useState(null);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);
    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'preview'

    // ... (existing code) ...

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
                                            <div className="drag-handle" style={{ cursor: 'grab', marginRight: '10px', color: '#ccc' }}>
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
                                                    marginRight: '0.25rem',
                                                    transition: 'all 0.2s',
                                                    flexShrink: 0
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
                                                    marginRight: '0.5rem',
                                                    transition: 'all 0.2s',
                                                    flexShrink: 0
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
                                            <label className="field-label">
                                                <input
                                                    type="checkbox"
                                                    checked={field.enabled}
                                                    onChange={(e) => handleFieldChange(field.uiId, { enabled: e.target.checked })}
                                                />
                                                <span className="field-name">{removePrefixFromFieldName(field.name, prefixToRemove)}</span>
                                            </label>
                                            {!field.hasChildren && (() => {
                                                const availableValues = fieldValuesMap.get(field.uiId) || [];
                                                const valuesCount = availableValues.length;
                                                const datalistId = `datalist-${field.uiId}`;
                                                
                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input
                                                            type="text"
                                                            className="field-value-input"
                                                            value={field.customValue || ''}
                                                            onChange={(e) => handleFieldChange(field.uiId, { customValue: e.target.value })}
                                                            placeholder="Value"
                                                            disabled={!field.enabled}
                                                            onClick={(e) => e.stopPropagation()} // Prevent selecting row when clicking input
                                                            list={valuesCount > 0 ? datalistId : undefined}
                                                        />
                                                        {valuesCount > 0 && (
                                                            <span className="field-value-count" title={`${valuesCount} value${valuesCount === 1 ? '' : 's'} available`}>
                                                                {valuesCount} value{valuesCount === 1 ? '' : 's'}
                                                            </span>
                                                        )}
                                                        {valuesCount > 0 && (
                                                            <datalist id={datalistId}>
                                                                {availableValues.map((value, idx) => (
                                                                    <option key={idx} value={value} />
                                                                ))}
                                                            </datalist>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
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
