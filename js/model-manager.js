/**
 * MongoDB Index Modeler - Model Manager
 * 
 * This file contains functions for managing the data model, schemas,
 * and collections. It handles creating, loading, and modifying data models.
 */

// ===================================================================
// Model Creation and Management
// ===================================================================

/**
 * Creates a new model with basic metadata
 * 
 * @param {string} modelName - Name for the new model
 * @param {string} author - Author of the model
 * @param {string} description - Description of the model
 * @return {Object} The newly created model
 */
function createNewModel(modelName, author, description) {
    // Initialize the model object
    model = {};
    var date = new Date();
    
    // Set model metadata
    model.ModelName = modelName;
    model.ModelMetadata = {
        "Author": author,
        "DateCreated": date,
        "DateLastModified": date,
        "Description": description
    };
    
    // Initialize empty DataModel array
    model.DataModel = [];
    
    // Reset table changes tracking
    tableChanges = {};
    
    return model;
}

/**
 * Creates a new collection within the current model
 * 
 * @param {string} collectionName - Name for the new collection
 * @return {Object} The newly created collection
 */
function createNewCollection(collectionName) {
    // Create a new collection definition
    var collection = {
        "CollectionName": collectionName,
        "SecondaryIndexes": [],
        "CollectionData": []
    };
    
    // Add collection to the model
    if (!model.DataModel) {
        model.DataModel = [];
    }
    
    model.DataModel.push(collection);
    modelIndex = model.DataModel.length - 1;
    
    // Set up table reference and pointers
    datamodel = collection;
    json_data = collection.CollectionData;
    
    table = {
        name: collectionName,
        primary_key: "_id"
    };
    
    // Initialize change history for this collection
    tableChanges[collectionName] = [];
    
    return collection;
}

/**
 * Adds an entity type to the schema
 * Creates a template for all attributes of this type
 * 
 * @param {Object} obj - Document object with type to add
 */
function addEntityToSchema(obj) {
    var type = obj.type;
    
    // Only add non-empty types that don't already exist
    if (type !== '~new~' && !schema.models[type]) {
        // Add the type template object with required type field
        schema.models[type] = {
            type: { 
                type: 'String', 
                required: true, 
                value: type 
            }
        };

        // Add all attributes from this object to the template
        Object.keys(obj).forEach(function(key) {
            if (!schema.models[type][key]) {
                schema.models[type][key] = { type: 'String' };
            }
        });
    }
}

/**
 * Loads a specific data model from the current model
 * Sets up references and displays the collection
 */
function loadDataModel() {
    // Get the collection at the current index
    datamodel = model.DataModel[modelIndex];
    
    // Set up the current table reference
    table = {
        name: datamodel.CollectionName,
        primary_key: "_id"
    };

    // Initialize change history if needed
    if (!tableChanges.hasOwnProperty(datamodel.CollectionName)) {
        tableChanges[datamodel.CollectionName] = [];
    }

    // Set the json_data pointer to the collection data
    json_data = datamodel.CollectionData;

    // Use query match results if available
    if (match_data.length > 0) {
        json_data = match_data;
    }

    // Render the table
    showTable();
}

/**
 * Makes a snapshot of the current model state and stores it in history
 * Allows for undo functionality
 */
function makeChange() {
    // Push a deep copy of the current collection to history
    tableChanges[model.DataModel[modelIndex]["CollectionName"]].push(
        JSON.parse(JSON.stringify(datamodel))
    );

    // If the buffer is too long then trim the oldest change
    if (tableChanges[model.DataModel[modelIndex]["CollectionName"]].length > 50) {
        tableChanges[model.DataModel[modelIndex]["CollectionName"]].shift();
    }
}

/**
 * Restores the previous state from history (undo functionality)
 */
function undoChange() {
    var collectionName = model.DataModel[modelIndex]["CollectionName"];
    
    // If there are changes then undo the last one
    if (tableChanges[collectionName].length > 0) {
        // Pop the last change into the current datamodel and reset the config
        model.DataModel[modelIndex] = tableChanges[collectionName].pop();
    }

    // Reset selection to first cell and reload
    selectId = boundary.first;
    loadDataModel();
}

/**
 * Saves the current model to a JSON file
 */
function saveModel() {
    // Ensure model has required metadata
    if (!model.hasOwnProperty("ModelName")) {
        var date = new Date();

        model.ModelName = "export";
        model.ModelMetadata = {
            "Author": "unknown",
            "DateCreated": date.toDateString(),
            "DateLastModified": date.toDateString(),
            "Description": ""
        };
    }

    // Convert model to JSON and save
    saveToFile(JSON.stringify(model), model.ModelName + ".json", "json");
}

// ===================================================================
// Schema Management
// ===================================================================

/**
 * Creates a schema from the data in a model
 * Extracts indexes, entity models, and attribute definitions
 */
function createSchema() {
    schema = Object.assign({}, DEFAULT_SCHEMA);
    let {data, indexes, models, queries} = schema;
    let keys = datamodel.KeyAttributes;

    // Extract indexes
    indexes.primary = {
        hash: "_id"
    };
    
    // Process all GSIs
    if (datamodel.GlobalSecondaryIndexes) {
        for (let gsi of datamodel.GlobalSecondaryIndexes) {
            indexes[gsi.IndexName] = {
                hash: gsi.KeyAttributes.PartitionKey.AttributeName,
                sort: gsi.KeyAttributes.SortKey.AttributeName,
                projection: gsi.Projection.ProjectionType,
            };
        }
    }

    // Extract schema entity models
    for (let row of datamodel.TableData) {
        let entity;
        if (row.type) {
            let type = Object.values(row.type)[0];
            entity = schema.models[type] = schema.models[type] || {};
        }
        
        // Extract attributes and map types
        let drow = {};
        for (let [fieldName, col] of Object.entries(row)) {
            if (entity) {
                let field = entity[fieldName] = entity[fieldName] || {};
                field.type = dynamoToType(Object.keys(col)[0]);
            }
            drow[fieldName] = Object.values(col)[0];
        }
        data.push(drow);
    }
    
    // Apply value templates
    if (keys && keys.PartitionKey && keys.PartitionKey.MapFunction) {
        for (let [type, fn] of Object.entries(keys.PartitionKey.MapFunction || {})) {
            schema.models[type][keys.ParitionKey.AttributeName].value = fn;
        }
    }
    
    if (keys && keys.SortKey && keys.SortKey.MapFunction) {
        for (let [type, fn] of Object.entries(keys.SortKey.MapFunction || {})) {
            schema.models[type][keys.SortKey.AttributeName].value = fn;
        }
    }
    
    if (datamodel.NonKeyAttributes) {
        for (let att of datamodel.NonKeyAttributes) {
            if (att.MapFunction) {
                for (let [type, fn] of Object.entries(att.MapFunction)) {
                    schema.models[type][att.AttributeName].value = fn;
                }
            }
        }
    }

    // Store schema in the data model
    datamodel.ModelSchema = schema;
}

/**
 * Creates a mapping function for an entity attribute
 * Used for value templates
 * 
 * @param {string} type - The entity type
 * @param {string} name - The attribute name
 * @param {string} value - The template/mapping function
 */
function createMapping(type, name, value) {
    // Add the value template to the schema
    schema.models[type][name].value = value;
}

// ===================================================================
// Item/Document Management
// ===================================================================

/**
 * Tests if a document ID would be a duplicate
 * 
 * @param {string} id - The ID to test for uniqueness
 * @return {boolean} True if ID is a duplicate, false otherwise
 */
function testForDuplicateId(id) {
    let isDuplicate = false;
    
    json_data.forEach(function(obj) {
        if (obj["_id"] === id) {
            alert("Duplicate _id value detected.");
            isDuplicate = true;
            return false;  // Break from forEach
        }
    });

    return isDuplicate;
}

/**
 * Adds a new item/document to the collection
 * 
 * @param {string} id - ID reference (unused, kept for API compatibility)
 */
function addItem(id) {
    // Build the new item, either from clipboard or empty
    var newItem = Object.keys(pasteItem).length > 0 ? 
        JSON.parse(JSON.stringify(pasteItem)) : {};

    // Set defaults for new item
    newItem["_id"] = "~new~";
    newItem["type"] = "~new~";

    // Check for duplicate ID
    if (testForDuplicateId(newItem["_id"])) {
        return;
    }

    // Snapshot model state
    makeChange();

    // Add "type" as a non-key attribute
    addModelAttribute(null, 'type');
    json_data.push(newItem);

    // Refresh the table view with values visible
    showValues = true;
    loadDataModel();
}

/**
 * Adds a non-key attribute to the schema model if it doesn't exist
 * 
 * @param {string} type - Entity type
 * @param {string} attribute - Attribute name to add
 */
function addModelAttribute(type, attribute) {
    // Add attribute to the schema if specified type exists
    if (type && !schema.models[type][attribute]) {
        schema.models[type][attribute] = { type: 'String' };
    }
}

/**
 * Adds an attribute to a document
 * 
 * @param {string} id - The cell ID reference
 * @param {string} name - The attribute name to add
 */
function addAttribute(id, name) {
    // Find the document object for this cell
    let obj = cellId[id].obj;
    
    // Require type to be set before adding attributes
    if (obj.hasOwnProperty("type") && obj.type === "~new~") {
        alert("You need to assign this object a type before adding new attributes.");
        // Set focus on the type field when table rerenders
        selectId.attr = "type";
    } else {
        // Snapshot model state and add attribute
        makeChange();
        obj[name] = "~new~";
    }

    // Refresh the table view
    showValues = true;
    loadDataModel();
}

/**
 * Expands documents with array fields for display
 * Creates separate rows for array elements
 * 
 * @param {Array} sortKeys - Array of sort key fields
 * @return {Array} Expanded documents for display
 */
function expandDocuments(sortKeys) {
    let sortData = [];

    json_data.forEach(function(document) {
        expand(document, sortKeys, sortData);
    });

    // Sort data based on the number of sort keys
    if (sortKeys.length > 0) {
        sortData.sort(function(a, b) {
            // Compare each sort key in order
            for (let i = 0; i < sortKeys.length; i++) {
                const key = sortKeys[i];
                const aVal = a.dispVals[key];
                const bVal = b.dispVals[key];
                
                if (aVal < bVal) return -1;
                if (aVal > bVal) return 1;
            }
            return 0;
        });
    }

    return sortData;
}

/**
 * Helper function to expand a document with nested/array fields
 * 
 * @param {Object} document - Document to expand
 * @param {Array} sortKeys - Sort key fields
 * @param {Array} exDocs - Output array for expanded documents
 */
function expand(document, sortKeys, exDocs) {
    let insertDoc = true;

    // Initialize display values if needed
    if (!document.hasOwnProperty("dispVals") || 
        "~new~" === document.dispVals) {
        document.dispVals = {};
    }

    // Process each sort key
    sortKeys.forEach(function(key, keyIdx) {
        let path = key.split(".");
        let value = document[path[0]];

        // Navigate the path to the actual value
        for (let i = 0; i < path.length; i++) {
            if (i > 0 && path.length > 1) {
                value = value[path[i]];
            }
            
            // Handle array expansion - create copy of document for each array item
            if (Array.isArray(value)) {
                if (!insertDoc) break;
                insertDoc = false;
                
                value.forEach(function(val) {
                    let newDoc = JSON.parse(JSON.stringify(document));
                    
                    // Set the array item in the appropriate position
                    switch (i) {
                        case 0: newDoc[path[0]] = val; break;
                        case 1: newDoc[path[0]][path[1]] = val; break;
                        case 2: newDoc[path[0]][path[1]][path[2]] = val; break;
                        case 3: newDoc[path[0]][path[1]][path[2]][path[3]] = val; break;
                        case 4: newDoc[path[0]][path[1]][path[2]][path[3]][path[4]] = val; break;
                    }
                    
                    expand(newDoc, sortKeys, exDocs);
                });
            } else {
                // Handle non-array values
                if (typeof value === 'undefined' || !insertDoc) {
                    insertDoc = false;
                    return;
                }

                if (path.length > i + 1 && typeof value != 'object') {
                    insertDoc = false;
                    return;
                }

                // If at the end of the path, store display value
                if (i + 1 === path.length) {
                    document.dispVals[key] = getDisplayValue(value);

                    // If this is the last key, add document to results
                    if (sortKeys.length === keyIdx + 1) {
                        exDocs.push(document);
                        insertDoc = false;
                    }
                }
            }
        }
    });
}

/**
 * Builds a B-Tree view model for hierarchical display
 * 
 * @param {Array} rowData - Document data rows
 * @param {Array} sortKeys - Sort key fields
 * @return {Object} B-Tree structure for display
 */
function buildBtreeView(rowData, sortKeys) {
    let btreeMap = {};
    
    rowData.forEach(function(row) {
        let mapVal = btreeMap;
        
        sortKeys.forEach(function(key, index) {
            if (index > 0) {
                // Get row value by traversing the path
                let rowVal = row;
                key.split(".").forEach(function(subKey) {
                    rowVal = rowVal[subKey];
                });
                
                rowVal = getDisplayValue(rowVal);

                // Create node if doesn't exist
                if (!mapVal.hasOwnProperty(rowVal)) {
                    mapVal[rowVal] = { "span": 0 };
                }

                // Update references and span
                mapVal = mapVal[rowVal];
                mapVal.span += 2;
            }
        });
    });

    return btreeMap;
}

/**
 * Group objects by partition key, sorted by sort key
 * 
 * @param {boolean} isCollection - Whether this is the main collection view
 * @param {string} key - Primary key to group by
 * @param {Array} jsonData - Document data
 * @return {Array} Grouped and sorted data
 */
function sortObjectList(isCollection, key, jsonData) {
    var sortedItems = [];
    var newArr = [];
    var lastValue = "";

    jsonData.forEach(function(document) {
        // Start a new group when key value changes
        if (document.dispVals[key] !== lastValue && newArr.length > 0) {
            sortedItems.push(newArr);
            newArr = [];
        }
        
        lastValue = document.dispVals[key];
        newArr.push(document);
    });

    // Add the last group
    if (newArr.length > 0) {
        sortedItems.push(newArr);
    }
    
    return sortedItems;
}

/**
 * Process value templates and generate values
 * Applies templates to all applicable documents
 */
function expandValueTemplates() {
    for (let item of datamodel.TableData) {
        // Skip if no type or new item
        if (!item.type) continue;
        let type = Object.values(item.type)[0];
        if (type === '~new~') continue;

        // Get entity schema
        let entity = schema.models[type];
        if (!entity) continue;

        // Process each field
        for (let [name, value] of Object.entries(item)) {
            let field = entity[name];
            if (!field || !field.value) continue;

            // Replace template variables 
            let text = field.value.replace(/\${(.*?)}/g, (pattern, varName) => {
                return item[varName] ? Object.values(item[varName])[0] : pattern;
            });
            
            // Update if value changed
            if (text != value) {
                item[name] = { 'S': text };
            }
        }
    }
}

/**
 * Sets attribute data type for a document field
 * 
 * @param {string} type - Data type name
 * @param {Object} item - Document to update
 * @param {string} attr - Attribute name to set
 */
function setAttributeType(type, item, attr) {
    switch (type) {
        case "Number":
            // Convert to number type
            if (isNaN(item[attr])) {
                item[attr] = { "N": "0" };
            } else {
                item[attr] = { "N": item[attr] };
            }
            break;
            
        case "Boolean":
            // Convert to boolean type
            item[attr] = {
                "BOOL": item[attr].toLowerCase() === "false" || 
                        item[attr] === "0" ? 
                        false : Boolean(item[attr])
            };
            break;
            
        default:
            // Set other types
            let newAttr = {};
            newAttr[DATA_TYPES[type]] = item[attr];
            item[attr] = newAttr;
            break;
    }
}