/**
 * XML Parser and Analysis Utility
 * Handles parsing, field detection, nesting analysis, and comparison
 */

import * as XLSX from 'xlsx';

/**
 * Remove prefix from field name if it matches exactly
 * @param {string} fieldName - The field name to process
 * @param {string} prefix - The prefix to remove (e.g., "ns0:")
 * @returns {string} Field name with prefix removed if it matched, otherwise original name
 */
export function removePrefixFromFieldName(fieldName, prefix) {
  if (!prefix || !fieldName || typeof fieldName !== 'string' || typeof prefix !== 'string') {
    return fieldName;
  }
  
  if (fieldName.startsWith(prefix)) {
    return fieldName.substring(prefix.length);
  }
  
  return fieldName;
}

/**
 * Remove prefix from all segments in a path
 * @param {string} path - The path to process (e.g., "ns0:Parent > ns0:Child")
 * @param {string} prefix - The prefix to remove (e.g., "ns0:")
 * @returns {string} Path with prefix removed from matching segments
 */
export function removePrefixFromPath(path, prefix) {
  if (!prefix || !path || typeof path !== 'string' || typeof prefix !== 'string') {
    return path;
  }
  
  const segments = path.split(' > ');
  const cleanedSegments = segments.map(segment => removePrefixFromFieldName(segment, prefix));
  return cleanedSegments.join(' > ');
}

/**
 * Check if content contains XML elements
 * @param {string} content - The content to check
 * @returns {boolean} True if XML content is detected
 */
export function hasXMLContent(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check for XML declaration
  if (content.indexOf('<?xml') !== -1) {
    return true;
  }

  // Check for valid XML tag start (< followed by letter, underscore, or colon)
  const tagStartRegex = /<[a-zA-Z_:]/;
  return tagStartRegex.test(content);
}

/**
 * Extract XML content from a string that may contain leading non-XML text
 * Looks for XML declaration (<?xml) or first valid XML tag start (<)
 * @param {string} content - The raw content that may contain leading text
 * @returns {string} Clean XML content starting from the XML declaration or first tag
 */
export function extractXMLContent(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // First, try to find the XML declaration (<?xml)
  const xmlDeclarationIndex = content.indexOf('<?xml');
  if (xmlDeclarationIndex !== -1) {
    return content.substring(xmlDeclarationIndex);
  }

  // If no XML declaration, look for the first '<' character that starts a valid tag
  // A valid XML tag starts with '<' followed by a letter, underscore, or colon
  const tagStartRegex = /<[a-zA-Z_:]/;
  const match = content.match(tagStartRegex);
  if (match && match.index !== undefined) {
    return content.substring(match.index);
  }

  // If we can't find a valid XML start, return the original content
  // (let the parser handle the error)
  return content;
}

/**
 * Parse XML string and extract field information
 * @param {string} xmlString - The XML content as a string (may contain leading non-XML text)
 * @returns {Object} Parsed XML data with field information
 */
export function parseXML(xmlString) {
  try {
    // Extract clean XML content, ignoring any leading non-XML text
    const cleanXMLString = extractXMLContent(xmlString);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXMLString, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid XML format');
    }

    return xmlDoc;
  } catch (error) {
    throw new Error(`XML Parse Error: ${error.message}`);
  }
}

/**
 * Extract all fields from an XML document with nesting information
 * @param {XMLDocument} xmlDoc - Parsed XML document
 * @returns {Array} Array of field objects with nesting info
 */
export function extractFields(xmlDoc) {
  const fields = [];
  const fieldMap = new Map();
  const parentOrderCounters = new Map(); // Track order counter per parent path

  function traverseNode(node, depth = 0, parentPath = '') {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const nodeName = node.nodeName;
      const path = parentPath ? `${parentPath} > ${nodeName}` : nodeName;

      // Create field key for deduplication
      const fieldKey = `${nodeName}|${depth}`;
      const isLeafNode = node.children.length === 0;
      const trimmedTextContent = node.textContent ? node.textContent.trim() : '';
      const leafTextContent = isLeafNode ? trimmedTextContent : null;

      if (!fieldMap.has(fieldKey)) {
        // Get or create order counter for this parent
        if (!parentOrderCounters.has(parentPath)) {
          parentOrderCounters.set(parentPath, 0);
        }
        const orderIndex = parentOrderCounters.get(parentPath);
        parentOrderCounters.set(parentPath, orderIndex + 1);

        const initialValueCounts = {};
        if (isLeafNode) {
          const valueKey = leafTextContent !== null && leafTextContent !== undefined ? leafTextContent : '';
          initialValueCounts[valueKey] = 1;
        }
        
        const field = {
          name: nodeName,
          depth: depth,
          path: path,
          isNested: depth > 0,
          hasChildren: node.children.length > 0,
          childCount: node.children.length,
          hasText: node.textContent && node.textContent.trim().length > 0,
          textContent: node.textContent ? node.textContent.trim() : '',
          attributes: Array.from(node.attributes || []).map(attr => attr.name),
          occurrences: 1,
          orderIndex: orderIndex, // Track order of first appearance under this parent
          parentPath: parentPath, // Store parent path for ordering children
          valueCounts: initialValueCounts,
          uniqueValues: Object.keys(initialValueCounts).length,
        };

        fieldMap.set(fieldKey, field);
        fields.push(field);
      } else {
        // Increment occurrence count for duplicate fields
        const existingField = fieldMap.get(fieldKey);
        existingField.occurrences += 1;
        if (isLeafNode) {
          const valueKey = leafTextContent !== null && leafTextContent !== undefined ? leafTextContent : '';
          existingField.valueCounts = existingField.valueCounts || {};
          existingField.valueCounts[valueKey] = (existingField.valueCounts[valueKey] || 0) + 1;
          existingField.uniqueValues = Object.keys(existingField.valueCounts).length;
        }
      }

      // Traverse children in order
      for (let child of node.children) {
        traverseNode(child, depth + 1, path);
      }
    }
  }

  traverseNode(xmlDoc.documentElement);

  // Sort fields by depth, then by order index (maintaining XML order)
  return fields.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    // If same depth and same parent, sort by order index
    if (a.parentPath === b.parentPath) {
      return (a.orderIndex || 0) - (b.orderIndex || 0);
    }
    // Otherwise maintain alphabetical for different parents at same depth
    return a.name.localeCompare(b.name);
  });
}

/**
 * Create a hierarchical tree structure of XML fields
 * @param {XMLDocument} xmlDoc - Parsed XML document
 * @returns {Object} Tree structure of fields
 */
export function createFieldTree(xmlDoc) {
  const tree = {
    name: xmlDoc.documentElement.nodeName,
    children: [],
    isRoot: true,
  };

  function buildTree(node, parentNode) {
    for (let child of node.children) {
      const childNode = {
        name: child.nodeName,
        children: [],
        hasText: child.textContent && child.textContent.trim().length > 0,
        textContent: child.textContent ? child.textContent.trim().substring(0, 50) : '',
        attributes: Array.from(child.attributes || []).map(attr => ({
          name: attr.name,
          value: attr.value,
        })),
      };

      parentNode.children.push(childNode);
      buildTree(child, childNode);
    }
  }

  buildTree(xmlDoc.documentElement, tree);
  return tree;
}

/**
 * Compare fields from multiple XML files
 * @param {Array} fileDataArray - Array of {filename, fields} objects
 * @param {string} prefixToRemove - Optional prefix to remove from field names for comparison
 * @returns {Object} Comparison results
 */
export function compareFields(fileDataArray, prefixToRemove = '') {
  if (fileDataArray.length === 0) {
    return {
      commonFields: [],
      uniqueFields: {},
      fieldDifferences: {},
      aggregation: {
        filesCount: 0,
        totalFieldInstances: 0,
        averageFieldsPerFile: 0,
        uniqueFieldNames: 0,
        uniqueFieldPaths: 0,
        fieldNameSummary: [],
        fieldPathSummary: [],
      },
    };
  }

  // Get all unique field names (normalized for comparison)
  const allFieldNames = new Set();
  fileDataArray.forEach(fileData => {
    fileData.fields.forEach(field => {
      const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
      allFieldNames.add(normalizedName);
    });
  });

  // Find common fields (present in all files) - using paths to ensure exact hierarchy match
  // First, get all unique field paths across all files
  const allFieldPaths = new Set();
  fileDataArray.forEach(fileData => {
    fileData.fields.forEach(field => {
      allFieldPaths.add(field.path);
    });
  });

  // Aggregated counts for summary view
  const totalFiles = fileDataArray.length;
  let totalFieldInstances = 0;
  const fieldNameStats = new Map();
  const fieldPathStats = new Map();

  // Pre-create stats entries when seeing fields
  const ensureFieldNameEntry = (field) => {
    const normalizedName = removePrefixFromFieldName(field.name, prefixToRemove);
    if (!fieldNameStats.has(normalizedName)) {
      fieldNameStats.set(normalizedName, {
        fieldName: normalizedName, // Store normalized name for comparison
        filesWithField: new Set(),
        totalOccurrences: 0,
        occurrencesPerFile: {},
        paths: new Set(),
        depths: new Set(),
        valueCounts: new Map(),
      });
    }
    const entry = fieldNameStats.get(normalizedName);
    const normalizedPath = removePrefixFromPath(field.path, prefixToRemove);
    entry.paths.add(normalizedPath);
    entry.depths.add(field.depth);
    return entry;
  };

  const ensureFieldPathEntry = (field) => {
    const normalizedPath = removePrefixFromPath(field.path, prefixToRemove);
    const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
    const normalizedParentPath = removePrefixFromPath(field.parentPath || '', prefixToRemove);
    
    if (!fieldPathStats.has(normalizedPath)) {
      fieldPathStats.set(normalizedPath, {
        path: normalizedPath,
        fieldName: normalizedFieldName,
        depth: field.depth,
        parentPath: normalizedParentPath,
        filesWithPath: new Set(),
        totalOccurrences: 0,
        occurrencesPerFile: {},
        hasChildren: field.hasChildren,
        childCount: field.childCount,
        orderIndex: field.orderIndex !== undefined ? field.orderIndex : 999999,
        valueCounts: new Map(),
      });
    } else {
      const existingEntry = fieldPathStats.get(normalizedPath);
      existingEntry.hasChildren = existingEntry.hasChildren || field.hasChildren;
      if (typeof field.childCount === 'number') {
        const existingCount = typeof existingEntry.childCount === 'number' ? existingEntry.childCount : 0;
        existingEntry.childCount = Math.max(existingCount, field.childCount);
      }
      if (field.orderIndex !== undefined) {
        const currentOrder = existingEntry.orderIndex !== undefined ? existingEntry.orderIndex : field.orderIndex;
        existingEntry.orderIndex = Math.min(currentOrder, field.orderIndex);
      }
    }
    return fieldPathStats.get(normalizedPath);
  };

  fileDataArray.forEach(fileData => {
    const perFileNameCounts = new Map();
    const perFilePathCounts = new Map();

    fileData.fields.forEach(field => {
      const occurrences = field.occurrences || 1;
      totalFieldInstances += occurrences;

      const nameEntry = ensureFieldNameEntry(field);
      nameEntry.totalOccurrences += occurrences;
      if (field.valueCounts) {
        Object.entries(field.valueCounts).forEach(([value, count]) => {
          if (value === undefined) {
            return;
          }
          const normalizedValue = typeof value === 'string' ? value : String(value);
          const incrementBy = typeof count === 'number' && !Number.isNaN(count) ? count : 0;
          if (incrementBy > 0) {
            const current = nameEntry.valueCounts.get(normalizedValue) || 0;
            nameEntry.valueCounts.set(normalizedValue, current + incrementBy);
          }
        });
      }

      const pathEntry = ensureFieldPathEntry(field);
      pathEntry.totalOccurrences += occurrences;
      if (field.valueCounts) {
        Object.entries(field.valueCounts).forEach(([value, count]) => {
          if (value === undefined) {
            return;
          }
          const normalizedValue = typeof value === 'string' ? value : String(value);
          const incrementBy = typeof count === 'number' && !Number.isNaN(count) ? count : 0;
          if (incrementBy > 0) {
            const current = pathEntry.valueCounts.get(normalizedValue) || 0;
            pathEntry.valueCounts.set(normalizedValue, current + incrementBy);
          }
        });
      }

      const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
      const normalizedFieldPath = removePrefixFromPath(field.path, prefixToRemove);
      
      perFileNameCounts.set(
        normalizedFieldName,
        (perFileNameCounts.get(normalizedFieldName) || 0) + occurrences
      );

      perFilePathCounts.set(
        normalizedFieldPath,
        (perFilePathCounts.get(normalizedFieldPath) || 0) + occurrences
      );
    });

    perFileNameCounts.forEach((occurrences, fieldName) => {
      const entry = fieldNameStats.get(fieldName);
      if (entry) {
        entry.filesWithField.add(fileData.filename);
        entry.occurrencesPerFile[fileData.filename] = occurrences;
      }
    });

    perFilePathCounts.forEach((occurrences, fieldPath) => {
      const entry = fieldPathStats.get(fieldPath);
      if (entry) {
        entry.filesWithPath.add(fileData.filename);
        entry.occurrencesPerFile[fileData.filename] = occurrences;
      }
    });
  });

  // Track structural differences: fields with same name but different paths
  const structuralDifferences = new Map(); // fieldName -> { paths: Set, files: Map }
  
  // Build a map of field names to their paths in each file
  const fieldNameToPaths = new Map();
  allFieldNames.forEach(fieldName => {
    const pathsInFiles = new Map();
    fileDataArray.forEach(fileData => {
      const matchingFields = fileData.fields.filter(f => removePrefixFromFieldName(f.name, prefixToRemove) === fieldName);
      if (matchingFields.length > 0) {
        pathsInFiles.set(fileData.filename, matchingFields.map(f => removePrefixFromPath(f.path, prefixToRemove)));
      }
    });
    
    // Check if this field name appears in all files
    if (pathsInFiles.size === fileDataArray.length) {
      // Check if all files have the same path(s) for this field
      const allPaths = new Set();
      pathsInFiles.forEach(paths => {
        paths.forEach(path => allPaths.add(path));
      });
      
      // If field exists in all files but has different paths, it's a structural difference
      if (allPaths.size > 1) {
        structuralDifferences.set(fieldName, {
          paths: Array.from(allPaths),
          files: pathsInFiles
        });
      }
    }
    
    fieldNameToPaths.set(fieldName, pathsInFiles);
  });

  // Build common fields using reference file structure
  // Include fields that exist in all files (by name), using reference file structure for display
  const referenceFile = fileDataArray[0];
  
  let commonFields = [];
  
  if (referenceFile && referenceFile.fields && Array.isArray(referenceFile.fields)) {
    // First, get all field names that exist in ALL files (using normalized names)
    const commonFieldNames = Array.from(allFieldNames).filter(fieldName => {
      return fileDataArray.every(fileData =>
        fileData.fields && Array.isArray(fileData.fields) && fileData.fields.some(f => f && removePrefixFromFieldName(f.name, prefixToRemove) === fieldName)
      );
    });

    // Build common fields from reference file structure
    // Include all fields from reference file that have the same normalized name in all files
    commonFields = referenceFile.fields
      .filter(field => field && field.name && commonFieldNames.includes(removePrefixFromFieldName(field.name, prefixToRemove)))
      .map(field => {
      const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
      const normalizedFieldPath = removePrefixFromPath(field.path, prefixToRemove);
      
      // Check if this field has structural differences (same normalized name, different paths)
      const hasStructuralDiff = structuralDifferences.has(normalizedFieldName);
      const structuralInfo = hasStructuralDiff ? structuralDifferences.get(normalizedFieldName) : null;
      
      // Verify this exact normalized path exists in all files
      const pathExistsInAllFiles = fileDataArray.every(fileData =>
        fileData.fields && Array.isArray(fileData.fields) && fileData.fields.some(f => f && removePrefixFromPath(f.path, prefixToRemove) === normalizedFieldPath)
      );
      
      // Build alternative paths with file information
      let alternativePathsWithFiles = [];
      if (structuralInfo) {
        const currentPath = field.path;
        structuralInfo.paths.forEach(altPath => {
          if (altPath !== currentPath) {
            // Find which files have this alternative path
            const filesWithPath = [];
            structuralInfo.files.forEach((paths, filename) => {
              if (paths.includes(altPath)) {
                filesWithPath.push(filename);
              }
            });
            alternativePathsWithFiles.push({
              path: altPath,
              files: filesWithPath
            });
          }
        });
      }
      
      return {
        name: normalizedFieldName, // Use normalized name
        path: normalizedFieldPath, // Use normalized path
        depth: field.depth,
        hasChildren: field.hasChildren || false,
        childCount: field.childCount || 0,
        hasText: field.hasText !== undefined ? field.hasText : (field.textContent && typeof field.textContent === 'string' && field.textContent.trim().length > 0),
        textContent: field.textContent || '',
        structuralDifference: hasStructuralDiff,
        pathExistsInAllFiles: pathExistsInAllFiles,
        alternativePaths: structuralInfo ? structuralInfo.paths.filter(p => p !== normalizedFieldPath) : [],
        alternativePathsWithFiles: alternativePathsWithFiles.map(ap => ({
          ...ap,
          path: removePrefixFromPath(ap.path, prefixToRemove)
        })),
        orderIndex: field.orderIndex !== undefined ? field.orderIndex : 999999,
        parentPath: removePrefixFromPath(field.parentPath || '', prefixToRemove),
        attributes: field.attributes || []
      };
    });
  }
  // Don't sort here - preserve the original XML order from reference file

  // Find unique fields for each file (fields that exist ONLY in that file, not in any other file)
  const uniqueFields = {};
  fileDataArray.forEach(fileData => {
    // Find fields that are unique to this file (present in this file but not in any other file)
    const uniqueToThisFile = fileData.fields.filter(field => {
      const normalizedFieldPath = removePrefixFromPath(field.path, prefixToRemove);
      // Check if this normalized field path exists in any other file
      const existsInOtherFile = fileDataArray.some(otherFile => {
        if (otherFile.filename === fileData.filename) return false; // Skip self
        return otherFile.fields.some(f => removePrefixFromPath(f.path, prefixToRemove) === normalizedFieldPath);
      });
      return !existsInOtherFile;
    });
    
    uniqueFields[fileData.filename] = uniqueToThisFile.map(f => ({
      name: removePrefixFromFieldName(f.name, prefixToRemove),
      path: removePrefixFromPath(f.path, prefixToRemove),
      depth: f.depth
    }));
  });

  // Detailed field differences
  const fieldDifferences = {};
  allFieldNames.forEach(fieldName => {
    const differences = {
      fieldName: fieldName,
      presentIn: [],
      absentIn: [],
      depthVariations: {},
      nestingVariations: {},
    };

    fileDataArray.forEach(fileData => {
      const fieldData = fileData.fields.find(f => removePrefixFromFieldName(f.name, prefixToRemove) === fieldName);
      if (fieldData) {
        differences.presentIn.push(fileData.filename);
        if (!differences.depthVariations[fieldData.depth]) {
          differences.depthVariations[fieldData.depth] = [];
        }
        differences.depthVariations[fieldData.depth].push(fileData.filename);
      } else {
        differences.absentIn.push(fileData.filename);
      }
    });

    fieldDifferences[fieldName] = differences;
  });

  return {
    commonFields,
    uniqueFields,
    fieldDifferences,
    structuralDifferences: Object.fromEntries(structuralDifferences),
    totalUniqueFields: allFieldNames.size,
    aggregation: {
      filesCount: totalFiles,
      totalFieldInstances,
      averageFieldsPerFile: totalFiles > 0 ? totalFieldInstances / totalFiles : 0,
      uniqueFieldNames: fieldNameStats.size,
      uniqueFieldPaths: fieldPathStats.size,
      fieldNameSummary: Array.from(fieldNameStats.values()).map(entry => {
        const sortedValueCounts = Array.from(entry.valueCounts.entries())
          .map(([value, count]) => ({
            value,
            count,
            percentage: entry.totalOccurrences > 0 ? (count / entry.totalOccurrences) * 100 : 0,
          }))
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return a.value.localeCompare(b.value);
          });

        return {
          fieldName: entry.fieldName,
          filesWithField: entry.filesWithField.size,
          filesMissingField: totalFiles - entry.filesWithField.size,
          presencePercent: totalFiles > 0 ? (entry.filesWithField.size / totalFiles) * 100 : 0,
          totalOccurrences: entry.totalOccurrences,
          averageOccurrencesPerFile: entry.filesWithField.size > 0 ? entry.totalOccurrences / entry.filesWithField.size : 0,
          samplePaths: Array.from(entry.paths).slice(0, 3),
          depths: (() => {
            const depthValues = Array.from(entry.depths);
            if (depthValues.length === 0) {
              return { min: 0, max: 0 };
            }
            return {
              min: Math.min(...depthValues),
              max: Math.max(...depthValues),
            };
          })(),
          valueCounts: sortedValueCounts,
          uniqueValuesCount: sortedValueCounts.length,
        };
      }),
      fieldPathSummary: Array.from(fieldPathStats.values()).map(entry => {
        const sortedValueCounts = Array.from(entry.valueCounts.entries())
          .map(([value, count]) => ({
            value,
            count,
            percentage: entry.totalOccurrences > 0 ? (count / entry.totalOccurrences) * 100 : 0,
          }))
          .sort((a, b) => {
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return a.value.localeCompare(b.value);
          });

        return {
          path: entry.path,
          fieldName: entry.fieldName,
          depth: entry.depth,
          parentPath: entry.parentPath || '',
          hasChildren: entry.hasChildren,
          childCount: entry.childCount,
          orderIndex: entry.orderIndex,
          pathSegments: entry.path.split(' > '),
          filesWithPath: entry.filesWithPath.size,
          filesMissingPath: totalFiles - entry.filesWithPath.size,
          presencePercent: totalFiles > 0 ? (entry.filesWithPath.size / totalFiles) * 100 : 0,
          totalOccurrences: entry.totalOccurrences,
          averageOccurrencesPerFile: entry.filesWithPath.size > 0 ? entry.totalOccurrences / entry.filesWithPath.size : 0,
          valueCounts: sortedValueCounts,
          uniqueValuesCount: sortedValueCounts.length,
        };
      }),
    },
  };
}

/**
 * Export fields to CSV format
 * @param {Array} fields - Array of field objects
 * @param {string} filename - Output filename
 * @param {string} prefixToRemove - Optional prefix to remove from field names and paths
 * @returns {string} CSV content
 */
export function fieldsToCSV(fields, filename = 'fields.csv', prefixToRemove = '') {
  const headers = [
    'Field Name',
    'Depth',
    'Path',
    'Is Nested',
    'Has Children',
    'Child Count',
    'Has Text',
    'Text Content',
    'Attributes',
    'Occurrences',
  ];

  const rows = fields.map(field => [
    removePrefixFromFieldName(field.name, prefixToRemove),
    field.depth,
    removePrefixFromPath(field.path, prefixToRemove),
    field.isNested ? 'Yes' : 'No',
    field.hasChildren ? 'Yes' : 'No',
    field.childCount,
    field.hasText ? 'Yes' : 'No',
    `"${field.textContent.replace(/"/g, '""')}"`,
    field.attributes.join('; '),
    field.occurrences,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Export comparison results to CSV
 * @param {Object} comparison - Comparison results from compareFields
 * @param {Array} mergedFields - Optional merged fields array from all files
 * @param {string} prefixToRemove - Optional prefix to remove from field names and paths
 * @returns {string} CSV content
 */
export function comparisonToCSV(comparison, mergedFields = null, prefixToRemove = '') {
  let csvContent = 'Field Comparison Report\n\n';

  // Merged View section (if provided)
  if (mergedFields && mergedFields.length > 0) {
    csvContent += 'Merged View (All Fields from All Files)\n';
    csvContent += 'Field Name,Path,Depth,Present In Files,Files Count\n';
    mergedFields.forEach(field => {
      const fieldName = removePrefixFromFieldName(field.name || '', prefixToRemove);
      const fieldPath = removePrefixFromPath(field.path || '', prefixToRemove);
      const fieldDepth = field.depth !== undefined ? field.depth : 0;
      const presentInFiles = field.presentInFiles ? field.presentInFiles.join('; ') : '';
      const filesCount = field.presentInFiles ? `${field.presentInFiles.length}` : '0';
      csvContent += `"${fieldName}","${fieldPath}",${fieldDepth},"${presentInFiles}","${filesCount}"\n`;
    });
    csvContent += '\n\n';
  }

  // Common fields section
  csvContent += 'Common Fields (Present in All Files)\n';
  csvContent += 'Field Name,Path,Depth,Structural Difference,Alternative Paths\n';
  comparison.commonFields.forEach(field => {
    const fieldName = typeof field === 'string' ? field : field.name;
    const fieldPath = typeof field === 'string' ? field : field.path;
    const fieldDepth = typeof field === 'string' ? 0 : field.depth;
    const hasStructuralDiff = typeof field === 'object' && field.structuralDifference ? 'Yes' : 'No';
    const altPaths = typeof field === 'object' && field.alternativePaths ? field.alternativePaths.map(p => removePrefixFromPath(p, prefixToRemove)).join('; ') : '';
    csvContent += `"${removePrefixFromFieldName(fieldName, prefixToRemove)}","${removePrefixFromPath(fieldPath, prefixToRemove)}",${fieldDepth},"${hasStructuralDiff}","${altPaths}"\n`;
  });

  csvContent += '\n\nUnique Fields\n';
  csvContent += 'File Name,Field Name,Path,Depth\n';
  Object.entries(comparison.uniqueFields).forEach(([filename, fields]) => {
    fields.forEach(field => {
      const fieldName = typeof field === 'string' ? field : field.name;
      const fieldPath = typeof field === 'string' ? field : field.path;
      const fieldDepth = typeof field === 'string' ? 0 : field.depth;
      csvContent += `"${filename}","${removePrefixFromFieldName(fieldName, prefixToRemove)}","${removePrefixFromPath(fieldPath, prefixToRemove)}",${fieldDepth}\n`;
    });
  });

  csvContent += '\n\nField Differences\n';
  csvContent += 'Field Name,Present In,Absent In\n';

  Object.values(comparison.fieldDifferences).forEach(diff => {
    csvContent += `"${removePrefixFromFieldName(diff.fieldName, prefixToRemove)}","${diff.presentIn.join('; ')}","${diff.absentIn.join('; ')}"\n`;
  });

  return csvContent;
}

/**
 * Export comparison results to Excel with multiple sheets
 * @param {Object} comparison - Comparison results from compareFields
 * @param {Array} mergedFields - Optional merged fields array from all files
 * @param {Object} options - Additional export options
 * @returns {Blob} Excel file blob
 */
export function comparisonToExcel(comparison, mergedFields = null, options = {}) {
  const workbook = XLSX.utils.book_new();
  const MAX_EXCEL_TEXT_LENGTH = 32000;

  const aggregation = comparison?.aggregation || {
    filesCount: 0,
    totalFieldInstances: 0,
    averageFieldsPerFile: 0,
    uniqueFieldNames: 0,
    uniqueFieldPaths: 0,
    fieldNameSummary: [],
    fieldPathSummary: [],
  };

  const clampExcelText = (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    if (value.length <= MAX_EXCEL_TEXT_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_EXCEL_TEXT_LENGTH - 1)}…`;
  };

  // Summary sheet
  const summarySheetData = [];

  const { filtersSummary = null, filteredFilesCount = null, totalFilesCount = null, prefixToRemove = '' } = options;

  if (filtersSummary) {
    summarySheetData.push(['Filters Applied', clampExcelText(filtersSummary)]);
  } else if (filtersSummary === '') {
    summarySheetData.push(['Filters Applied', 'None (all files)']);
  } else if (filtersSummary === null) {
    // No filters row added when null (legacy behaviour)
  }

  if (totalFilesCount != null && filteredFilesCount != null) {
    summarySheetData.push(['Files Included in Export', `${filteredFilesCount} of ${totalFilesCount}`]);
  }

  if (summarySheetData.length > 0) {
    summarySheetData.push([]);
  }

  summarySheetData.push(
    ['Metric', 'Value'],
    ['Files Compared', aggregation.filesCount ?? 0],
    ['Total Field Instances', aggregation.totalFieldInstances ?? 0],
    ['Unique Field Names', aggregation.uniqueFieldNames ?? 0],
    ['Unique Field Paths', aggregation.uniqueFieldPaths ?? 0],
    [
      'Average Fields per File',
      aggregation.averageFieldsPerFile ? Number(aggregation.averageFieldsPerFile.toFixed(2)) : 0,
    ],
  );

  summarySheetData.push([]);
  if ((aggregation.fieldNameSummary || []).length > 0) {
    summarySheetData.push([
      'Field Name',
      'Files With Field',
      'Files Missing',
      'Presence %',
      'Total Occurrences',
      'Avg Occurrences per File',
    ]);
  }

  const fieldCoverageRows = (aggregation.fieldNameSummary || []).map(entry => ([
      clampExcelText(removePrefixFromFieldName(entry.fieldName || '', prefixToRemove)),
      entry.filesWithField ?? 0,
      entry.filesMissingField ?? 0,
      entry.presencePercent ? Number(entry.presencePercent.toFixed(1)) : 0,
      entry.totalOccurrences ?? 0,
      entry.averageOccurrencesPerFile ? Number(entry.averageOccurrencesPerFile.toFixed(2)) : 0,
    ]));

  if (fieldCoverageRows.length === 0) {
    summarySheetData.push(['(no data)', '', '', '', '', '']);
  } else {
    summarySheetData.push(...fieldCoverageRows);
  }

  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');

  // Helper function to create a worksheet from array of objects
  const createWorksheet = (data, sheetName) => {
    if (!data || data.length === 0) {
      // Create empty sheet with headers
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  };

  // Merged View sheet
  if (mergedFields && mergedFields.length > 0) {
    const mergedData = mergedFields.map(field => ({
      'Field Name': clampExcelText(removePrefixFromFieldName(field.name || '', prefixToRemove)),
      'Path': clampExcelText(removePrefixFromPath(field.path || '', prefixToRemove)),
      'Depth': field.depth !== undefined ? field.depth : 0,
      'Files Count': field.presentInFiles ? field.presentInFiles.length : 0,
    }));
    createWorksheet(mergedData, 'Merged View');
  }

  // Common Fields sheet
  const commonData = comparison.commonFields.map(field => {
    const fieldName = typeof field === 'string' ? field : field.name;
    const fieldPath = typeof field === 'string' ? field : field.path;
    const altPaths = typeof field === 'object' && field.alternativePaths 
      ? field.alternativePaths.map(p => removePrefixFromPath(p, prefixToRemove)).join('; ')
      : '';
    return {
      'Field Name': clampExcelText(removePrefixFromFieldName(fieldName, prefixToRemove)),
      'Path': clampExcelText(removePrefixFromPath(fieldPath, prefixToRemove)),
      'Depth': typeof field === 'string' ? 0 : field.depth,
      'Structural Difference': typeof field === 'object' && field.structuralDifference ? 'Yes' : 'No',
      'Alternative Paths': clampExcelText(altPaths),
    };
  });
  createWorksheet(commonData, 'Common Fields');

  // Unique Fields sheet
  const uniqueData = [];
  let uniqueGroupIndex = 1;
  Object.entries(comparison.uniqueFields).forEach(([, fields]) => {
    if (fields.length === 0) {
      return;
    }
    fields.forEach(field => {
      const fieldName = typeof field === 'string' ? field : field.name;
      const fieldPath = typeof field === 'string' ? field : field.path;
      uniqueData.push({
        'File Group #': uniqueGroupIndex,
        'Field Name': clampExcelText(removePrefixFromFieldName(fieldName, prefixToRemove)),
        'Path': clampExcelText(removePrefixFromPath(fieldPath, prefixToRemove)),
        'Depth': typeof field === 'string' ? 0 : field.depth,
      });
    });
    uniqueGroupIndex += 1;
  });
  createWorksheet(uniqueData, 'Unique Fields');

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Get statistics about XML structure
 * @param {Array} fields - Array of field objects
 * @returns {Object} Statistics
 */
export function getXMLStatistics(fields) {
  const stats = {
    totalFields: fields.length,
    uniqueFieldNames: new Set(fields.map(f => f.name)).size,
    maxDepth: Math.max(...fields.map(f => f.depth), 0),
    nestedFields: fields.filter(f => f.isNested).length,
    fieldsWithChildren: fields.filter(f => f.hasChildren).length,
    fieldsWithText: fields.filter(f => f.hasText).length,
    fieldsWithAttributes: fields.filter(f => f.attributes.length > 0).length,
  };

  return stats;
}

/**
 * Merge fields from multiple files, grouping by similar structure
 * @param {Array} files - Array of file objects with fields
 * @returns {Array} Merged fields array
 */
export function mergeFieldsFromFiles(files, prefixToRemove = '') {
  if (!files || files.length === 0) return [];

  // Track all unique field names under each parent path
  // parentPath -> Map of fieldName -> { field info, presentInFiles }
  const parentFieldMap = new Map();
  
  // First pass: collect all fields grouped by parent path and field name
  files.forEach(file => {
    file.fields.forEach(field => {
      const normalizedParentPath = removePrefixFromPath(field.parentPath || '', prefixToRemove);
      const normalizedFieldName = removePrefixFromFieldName(field.name, prefixToRemove);
      const normalizedPath = removePrefixFromPath(field.path, prefixToRemove);
      
      if (!parentFieldMap.has(normalizedParentPath)) {
        parentFieldMap.set(normalizedParentPath, new Map());
      }
      
      const fieldsAtParent = parentFieldMap.get(normalizedParentPath);
      if (!fieldsAtParent.has(normalizedFieldName)) {
        // First time seeing this normalized field name under this normalized parent
        fieldsAtParent.set(normalizedFieldName, {
          name: normalizedFieldName,
          path: normalizedPath,
          depth: field.depth,
          parentPath: normalizedParentPath,
          hasChildren: field.hasChildren,
          childCount: field.childCount,
          orderIndex: field.orderIndex !== undefined ? field.orderIndex : 999999,
          presentInFiles: [file.filename],
          isNested: field.isNested,
          hasText: field.hasText,
          textContent: field.textContent,
          attributes: field.attributes,
          occurrences: field.occurrences,
        });
      } else {
        // Normalized field name already exists under this normalized parent, just add to presentInFiles
        const existing = fieldsAtParent.get(normalizedFieldName);
        if (!existing.presentInFiles.includes(file.filename)) {
          existing.presentInFiles.push(file.filename);
        }
        // Update hasChildren if this file has children (field has children if any file has children)
        if (field.hasChildren) {
          existing.hasChildren = true;
        }
      }
    });
  });

  // Second pass: build the merged field list maintaining structure
  // Use reference file (first file) to determine the order and structure
  const merged = [];
  const processedFieldKeys = new Set(); // Track parentPath + fieldName combinations
  
  // Build a function to recursively process fields
  const processFieldsAtDepth = (depth, parentPath) => {
    const fieldsAtParent = parentFieldMap.get(parentPath) || new Map();
    const fieldEntries = Array.from(fieldsAtParent.entries());
    
    // Sort by order index from reference file if available
    fieldEntries.sort(([nameA, fieldA], [nameB, fieldB]) => {
      // Try to get order from reference file (using normalized names/paths for comparison)
      const refFile = files[0];
      const refFieldA = refFile.fields.find(f => 
        removePrefixFromFieldName(f.name, prefixToRemove) === nameA && removePrefixFromPath(f.parentPath || '', prefixToRemove) === parentPath
      );
      const refFieldB = refFile.fields.find(f => 
        removePrefixFromFieldName(f.name, prefixToRemove) === nameB && removePrefixFromPath(f.parentPath || '', prefixToRemove) === parentPath
      );
      
      const orderA = refFieldA?.orderIndex ?? fieldA.orderIndex;
      const orderB = refFieldB?.orderIndex ?? fieldB.orderIndex;
      
      if (orderA !== orderB) return orderA - orderB;
      return nameA.localeCompare(nameB);
    });
    
    fieldEntries.forEach(([fieldName, fieldInfo]) => {
      const key = `${parentPath}|${fieldName}`;
      if (!processedFieldKeys.has(key)) {
        processedFieldKeys.add(key);
        merged.push(fieldInfo);
        
        // Recursively process children if this field has children
        if (fieldInfo.hasChildren) {
          processFieldsAtDepth(depth + 1, fieldInfo.path);
        }
      }
    });
  };
  
  // Start processing from root (empty parent path)
  processFieldsAtDepth(0, '');
  
  return merged;
}

/**
 * Get all unique values for a field from source files
 * Matches fields by normalized field name and normalized parent path
 * @param {Array} files - Array of file objects with fields
 * @param {string} fieldName - The field name to match
 * @param {string} parentPath - The parent path to match
 * @param {string} prefixToRemove - Optional prefix to remove from field names and paths
 * @returns {Array} Array of unique values (trimmed, non-empty, sorted alphabetically)
 */
export function getFieldValuesFromFiles(files, fieldName, parentPath, prefixToRemove = '') {
  if (!files || files.length === 0) return [];
  
  const normalizedFieldName = removePrefixFromFieldName(fieldName, prefixToRemove);
  const normalizedParentPath = removePrefixFromPath(parentPath || '', prefixToRemove);
  
  const valueSet = new Set();
  
  files.forEach(file => {
    if (!file.fields || !Array.isArray(file.fields)) return;
    
    file.fields.forEach(field => {
      // Normalize field name and parent path for comparison
      const normalizedFieldNameFromFile = removePrefixFromFieldName(field.name, prefixToRemove);
      const normalizedParentPathFromFile = removePrefixFromPath(field.parentPath || '', prefixToRemove);
      
      // Match by field name and parent path
      if (normalizedFieldNameFromFile === normalizedFieldName && 
          normalizedParentPathFromFile === normalizedParentPath) {
        
        // First, check valueCounts (contains all values from all occurrences)
        if (field.valueCounts && typeof field.valueCounts === 'object') {
          const valueCountsKeys = Object.keys(field.valueCounts);
          valueCountsKeys.forEach(valueKey => {
            const trimmedValue = valueKey ? valueKey.trim() : '';
            if (trimmedValue.length > 0) {
              valueSet.add(trimmedValue);
            }
          });
        }
        
        // Also collect text content (trimmed, non-empty) as fallback
        // This ensures backward compatibility and handles cases where valueCounts might not exist
        const textValue = field.textContent ? field.textContent.trim() : '';
        if (textValue.length > 0) {
          valueSet.add(textValue);
        }
      }
    });
  });
  
  // Return sorted array of unique values
  return Array.from(valueSet).sort((a, b) => a.localeCompare(b));
}
