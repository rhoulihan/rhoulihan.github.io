/**
 * MongoDB Index Modeler - Document Operations
 * 
 * This file contains functions for managing documents,
 * including adding, deleting, and modifying documents and attributes.
 */

// ===================================================================
// Document Addition/Removal
// ===================================================================

/**
 * Entry point for adding an item via UI
 * 
 * @param {string} id - ID reference (unused)
 */
function addItemClick(id) {
    pasteItem = {};
    addItem(id);
}


// Global variable to store document setup state
var documentSetupData = {};

/**
 * Removes a document from the collection
 * 
 * @param {string} id - Cell ID reference for the document to delete
 */
function deletePartition(id) {
    // Don't allow deleting new documents
    if (cellId[id].obj[table.primary_key] === "~new~") {
        alert("New partitions cannot be deleted.");
        return;
    }

    // Set up confirmation dialog
    alertData = {
        caller: "deletePartition",
        data: cellId[id].obj[table.primary_key]
    };

    $("#alertTitle h1").text("Delete Document");
    $("#alertText").text(`The '${alertData.data}' document will be deleted, continue?`);

    $("#alertModal").show();
}

/**
 * Opens the document editor for a cell
 * 
 * @param {string} id - Cell ID
 */
function editDocument(id) {
    // Check if document has valid ID and type
    if (validateDocumentForEditing(id)) {
        // Document is valid, open editor directly
        openJsonEditor(id);
    } else {
        // Document needs setup, show dialog
        showDocumentSetupDialog(id);
    }
}

/**
 * Validates a document before opening the editor
 * Ensures _id and type are set to valid values
 * 
 * @param {string} id - Cell ID reference
 * @return {boolean} True if document is valid, false otherwise
 */
function validateDocumentForEditing(id) {
    var document = cellId[id].obj;
    
    // Check if document has valid _id (not null/undefined and not the default value)
    var validId = document._id && document._id !== "~new~";
    
    // Check if document has valid type (not null/undefined and not the default value)
    var validType = document.type && document.type !== "~new~";
    
    // If both are valid, document is ready for editing
    return validId && validType;
}

/**
 * Shows a dialog to collect required document values
 * 
 * @param {string} id - Cell ID reference
 */
function showDocumentSetupDialog(id) {
    var document = cellId[id].obj;
    
    // Set current values for the form (default or existing)
    $("#txtDocumentId").val(document._id === "~new~" ? "" : document._id);
    
    // Clear type dropdown and populate with available types
    $("#selectDocumentType").empty()
        .append('<option selected="true" disabled="disabled">--Choose a Type--</option>');
    
    // Add all entity types from schema to dropdown
    Object.keys(schema.models).forEach(function(type) {
        if (type !== "~new~") {
            $("#selectDocumentType").append(
                $('<option></option>').val(type).html(type)
            );
        }
    });
    
    // Add option for creating a new type
    $("#selectDocumentType").append('<option value="new">Create New Type...</option>');
    
    // Pre-select current type if set
    if (document.type && document.type !== "~new~") {
        $("#selectDocumentType").val(document.type);
    }
    
    // Hide new type input initially
    $("#newTypeDiv").hide();
    
    // Store cell ID for the callback
    documentSetupData = {
        cellId: id
    };
    
    // Show the dialog
    $("#documentSetupModal").show();
}

/**
 * Handles type selection change in the document setup dialog
 */
function handleTypeSelectionChange() {
    // Show/hide new type input based on selection
    if ($("#selectDocumentType").val() === "new") {
        $("#newTypeDiv").show();
        $("#txtNewType").focus();
    } else {
        $("#newTypeDiv").hide();
    }
}

/**
 * Processes document setup form data and continues to editor
 */
function processDocumentSetup() {
    // Get values from form
    var id = $("#txtDocumentId").val().trim();
    var type = $("#selectDocumentType").val();
    
    // Get actual type value (may be from the new type field)
    if (type === "new") {
        type = $("#txtNewType").val().trim();
    }
    
    // Validate inputs
    if (!id) {
        alert("Please enter a valid ID for the document.");
        return;
    }
    
    if (!type || type === "new" && !$("#txtNewType").val().trim()) {
        alert("Please select or enter a valid type for the document.");
        return;
    }
    
    // Check for duplicate ID
    if (cellId[documentSetupData.cellId].obj._id !== id && testForDuplicateId(id)) {
        return;
    }
    
    // Create a snapshot before making changes
    makeChange();
    
    // Update document with new values
    var document = cellId[documentSetupData.cellId].obj;
    var oldId = document._id;
    document._id = id;
    document.type = type;
    
    // Update the document in the collection data
    json_data.forEach(function(obj) {
        if (obj[table.primary_key] === oldId) {
            obj[table.primary_key] = id;
            obj.type = type;
            
            // If this is a new type, add appropriate attributes
            if (schema.models.hasOwnProperty(type)) {
                // Add standard attributes for this type
                Object.keys(schema.models[type]).forEach(function(attr) {
                    if (attr !== '_id' && attr !== 'type' && !obj.hasOwnProperty(attr)) {
                        obj[attr] = '~new~';
                    }
                });
            }
        }
    });
    
    // If this is a new type, add it to the schema
    if (!schema.models[type]) {
        addEntityToSchema(document);
    }
    
    // Hide the dialog
    $("#documentSetupModal").hide();
    
    // Now open the editor
    openJsonEditor(documentSetupData.cellId);
}

/**
 * Opens the JSON editor for a document after validation
 * 
 * @param {string} id - Cell ID reference
 */
function openJsonEditor(id) {
    // Clone object without display values
    delete cellId[id].obj.dispVals;
    
    // Initialize JSON editor with object
    jsonEditor = new JsonEditor("#documentJSON", cellId[id].obj);
    
    // Show the editor modal
    $("#editDocument").show();
    
    // Build context menu for the editor (if implemented)
    if (typeof buildEditorContextMenu === "function") {
        buildEditorContextMenu();
    }
    
    // Ensure proper binding when dialog is opened
    $("#btnSaveEditedDocument").off('click').on('click', function() {
        saveDocument();
    });
    
    // Ensure the cancel button updates the table view
    $("#editDocument .cancel").off('click').on('click', function() {
        $("#editDocument").hide();
        loadDataModel();
    });
}

/**
 * Builds the context menu for the JSON editor
 * Adds options to clone attributes from existing document types
 */
function buildEditorContextMenu() {
    // Clear any existing context menu for the editor
    $.contextMenu('destroy', '.pre_text');
    
    // Get all document types from the schema
    var types = Object.keys(schema.models);
    if (types.length === 0) {
        // No document types available
        return;
    }
    
    // Build menu items for each document type
    var typeItems = {};
    
    // For each document type, create a submenu of available instances
    types.forEach(function(type) {
        // Skip empty types
        if (type === '~new~') {
            return;
        }
        
        // Find instances of this type
        var instances = findInstancesOfType(type);
        
        // Skip if no instances found
        if (instances.length === 0) {
            return;
        }
        
        // Create submenu items for each instance
        var instanceItems = {};
        
        instances.forEach(function(instance) {
            var id = instance[table.primary_key];
            
            // Use ID as label and key
            instanceItems[id] = {
                name: id,
                callback: function() {
                    cloneAttributesFromDocument(instance);
                }
            };
        });
        
        // Add type with its instances as submenu
        typeItems[type] = {
            name: "Clone from " + type,
            items: instanceItems
        };
    });
    
    // Create the context menu
    $.contextMenu({
        selector: '.pre_text',
        callback: function(key, options) {
            // This is handled by the individual item callbacks
        },
        items: {
            "clone": {
                name: "Clone Attributes",
                icon: "fa-clone",
                items: typeItems
            }
        }
    });
}

/**
 * Finds all instances of a specified document type
 * 
 * @param {string} type - The document type to find
 * @return {Array} Array of document objects of the specified type
 */
function findInstancesOfType(type) {
    var instances = [];
    
    // Search all documents in the collection
    json_data.forEach(function(document) {
        // Check type match
        if (document.type === type) {
            instances.push(document);
        }
    });
    
    return instances;
}

/**
 * Clones attributes from a selected document into the editor
 * 
 * @param {Object} sourceDoc - The document to clone attributes from
 */
function cloneAttributesFromDocument(sourceDoc) {
    // Get current document from editor
    var currentDoc = jsonEditor.get();
    
    // Keep the current document's _id and type
    var id = currentDoc._id;
    var type = currentDoc.type;
    
    // Clone attributes from source document, skipping _id, type, and dispVals
    Object.keys(sourceDoc).forEach(function(key) {
        if (key !== '_id' && key !== 'type' && key !== 'dispVals') {
            currentDoc[key] = JSON.parse(JSON.stringify(sourceDoc[key]));
        }
    });
    
    // Ensure ID and type are preserved
    currentDoc._id = id;
    currentDoc.type = type;
    
    // Update the editor with the new document
    jsonEditor.load(currentDoc);
}

/**
 * Removes an attribute from a document or entity type
 * 
 * @param {boolean} applyAll - Whether to apply to all documents of this type
 */
function removeAttr(applyAll) {
    var PK = selectId.PK;
    var attr = selectId.attr;
    var type = "";

    // Snapshot model state
    makeChange();
    
    // Find the document and remove attribute
    json_data.forEach(function(obj) {
        if (obj[table.primary_key] === PK) {
            delete obj[attr];
            type = obj.type;
            return false;
        }
    });

    // Apply to all documents of this type if requested
    if (applyAll) {
        json_data.forEach(function(obj) {
            if (obj["type"] === type) {
                delete obj[attr];
            }
        });
        
        // Remove from schema
        if (schema.models[type]) {
            delete schema.models[type][attr];
        }
    }

    // Move focus to sort key and reload
    selectId.attr = table.sort_key;
    $("#removeAttributeModal").hide();
    loadDataModel();
}

/**
 * Removes a specific item from the collection
 * 
 * @param {string} id - Cell ID reference for the item to delete
 */
function deleteItem(id) {
    var PK = cellId[id].obj[table.primary_key];
    var SK = cellId[id].obj[table.sort_key];
    var message = "";

    // Don't allow deleting from new partitions
    if (PK === "~new~") {
        message = "Items cannot be deleted from new partitions.";
    }

    if (message !== "") {
        alert(message);
        loadDataModel();
        return;
    }

    // Set up confirmation dialog
    alertData = {
        caller: "deleteItem",
        data: id
    };

    $("#alertTitle h1").text("Delete Item");
    $("#alertText").text(`Item key '${PK}, ${SK}' will be deleted, continue?`);

    $("#alertModal").show();
}

/**
 * Finds a document by cell ID
 * 
 * @param {string} id - Cell ID reference
 * @return {Object|null} Document object or null if not found
 */
function findItemByCellId(id) {
    var item = null;
    
    json_data.forEach(function(obj) {
        if (obj[table.primary_key] === cellId[id].PK && 
            obj[table.sort_key] === cellId[id].SK) {
            item = obj;
            return false;  // Break from forEach
        }
    });

    return item;
}

// ===================================================================
// Value Template Management
// ===================================================================

/**
 * Shows the value template editing dialog
 * 
 * @param {string} id - Cell ID reference
 */
function showValueTemplate(id) {
    alertData.data = {};
    alertData.caller = cellId[id].attr;

    // Clear select options
    $('#selectType')
        .find('option')
        .remove()
        .end()
        .append('<option selected="true" disabled="disabled">--Select a Type--</option>');

    // Handle primary key templates
    if (alertData.caller === table.primary_key) {
        $("#txtMapFunction").prop("disabled", true);
        $("#btnDefineMap").prop("disabled", true);

        // Add all entity types to dropdown
        Object.keys(schema.models).forEach(function(type) {
            $("#selectType").append($('<option></option>').val(type).html(type));
        });
        
        $("#selectTypeDiv").show();
    } else {
        // Get item type and set up label
        var item = findItemByCellId(id);
        alertData.data.type = item.type;
        $("#lblEditMap").text(
            `Enter Mapping Function for '${alertData.data.type}.${alertData.caller}' attribute:`
        );
    }

    // Load existing value templates
    if (alertData.caller === table.sort_key) {
        if (datamodel.KeyAttributes && 
            datamodel.KeyAttributes.SortKey && 
            datamodel.KeyAttributes.SortKey.hasOwnProperty("MapFunction") &&
            datamodel.KeyAttributes.SortKey.MapFunction.hasOwnProperty(alertData.data.type)) {
                $("#txtMapFunction").val(
                    datamodel.KeyAttributes.SortKey.MapFunction[alertData.data.type]
                );
        }
    } else if (datamodel.NonKeyAttributes) {
        datamodel.NonKeyAttributes.forEach(function(obj) {
            if (obj.AttributeName === alertData.caller && 
                obj.hasOwnProperty("MapFunction") &&
                obj.MapFunction.hasOwnProperty(alertData.data.type)) {
                    $("#txtMapFunction").val(obj.MapFunction[alertData.data.type]);
            }
        });
    }

    // Show the dialog
    $("#defineValueTemplateDiv").show();
    $("#txtMapFunction").focus();
}

/**
 * Updates the entity type in the mapping function dialog
 */
function setType() {
    // Load template for selected type if exists
    if (datamodel.KeyAttributes && 
        datamodel.KeyAttributes.PartitionKey && 
        datamodel.KeyAttributes.PartitionKey.hasOwnProperty("MapFunction") &&
        datamodel.KeyAttributes.PartitionKey.MapFunction.hasOwnProperty($("#selectType").val())) {
            $("#txtMapFunction").val(
                datamodel.KeyAttributes.PartitionKey.MapFunction[$("#selectType").val()]
            );
    }

    // Enable form controls
    $("#txtMapFunction").prop("disabled", false);
    $("#btnDefineMap").prop("disabled", false);
    
    // Update type reference and label
    alertData.data.type = $("#selectType").val();
    $("#lblEditMap").text(
        `Enter Mapping Function for '${alertData.data.type}.${alertData.caller}' attribute:`
    );
    
    $("#txtMapFunction").focus();
}

// ===================================================================
// Document Generation
// ===================================================================

/**
 * Creates documents based on template specification
 * 
 * @param {Object} spec - Document generation specification
 * @return {Array} Generated documents
 */
function makeDocuments(spec) {
    // Instantiate random data generator
    var chance = new Chance();
    var docsToInsert = [];
     
    // Generate the specified number of documents
    for (var i = 0; i < (spec.numDocs || 10); i++) {
        var doc = {};
       
        // Generate attributes based on spec
        Object.keys(spec.doc).forEach(function(key) {
           doc[key] = getAttrValue(spec.doc[key], spec.options);
        });

        docsToInsert.push(doc);
    }
    
    return docsToInsert;
}

/**
 * Generates attribute values based on spec
 * 
 * @param {*} field - Field specification
 * @param {Object} options - Generation options
 * @return {*} Generated attribute value
 */
function getAttrValue(field, options) {
    // Handle array fields
    if (Array.isArray(field)) {
        var currentArray = [];
        var upperLimit = parseInt(Object.keys(field[0])[0]);

        for (var item = 0; item < upperLimit; item++) {
            field.forEach(function(key) {
                currentArray.push(getAttrValue(key[upperLimit.toString()], options));
            });
        }
        
        return currentArray;
    }

    // Handle object fields
    if (typeof field === "object") {
        var currentObj = {};
        
        Object.keys(field).forEach(function(key) {
            currentObj[key] = getAttrValue(field[key], options);
        });

        return currentObj;
    }
      
    // Handle primitives
    field = field.toLowerCase();
    switch (field) {
        case 'objectid':
            return new BSON.ObjectId();
        
        case 'date':
            return new Date(chance.date(options[field] || {year: 2022}));
        
        case 'geo':
            return { 
                type: "Point", 
                coordinates: [ 
                    chance.longitude(options[field] || undefined), 
                    chance.latitude(options[field] || undefined) 
                ] 
            };
        
        default:
            return chance[field](options[field] || undefined);
    }
}

// ===================================================================
// Modal Dialog Response Handling
// ===================================================================

/**
 * Handles responses from modal dialogs
 * 
 * @param {boolean} applyAll - Whether to apply changes to all items of type
 */
function postResponse(applyAll) {
    // Hide all modals
    $(".modal").hide();

    var newData = [];

    switch (alertData.caller) {
        case "saveDocument":
            // Handle document editor schema changes
            if (applyAll) {
                // Process deleted attributes
                alertData.data.deletedAttrs.forEach(function(attr) {
                    // Remove from schema
                    delete schema.models[alertData.data.type][attr];

                    // Remove from all documents of this type
                    json_data.forEach(function(doc) {
                        if (doc.type === alertData.data.type) {
                            delete doc[attr];
                        }
                    });
                });

                // Process new attributes
                alertData.data.newAttrs.forEach(function(attr) {
                    // Add to schema
                    schema.models[alertData.data.type][attr] = { type: 'String' };

                    // Add to all other documents of this type
                    json_data.forEach(function(document) {
                        if (document["type"] === alertData.data.type && 
                            document["_id"] !== alertData.data.callerId) {
                            document[attr] = "~new~";
                        }
                    });
                });
            }

            loadDataModel();
            break;

        case "createModel":
            if (applyAll === '0') {
                $("#createModelDiv").show();
            }
            break;

        case "deletePartition":
            // Create new array without deleted document
            json_data.forEach(function(obj) {
                if (obj["_id"] !== alertData.data) {
                    newData.push(obj);
                }
            });
            break;

        case "cutItem":
        case "copyItem":
        case "deleteItem":
            var PK = cellId[alertData.data].obj[table.primary_key];

            // Create new array without deleted item
            json_data.forEach(function(obj) {
                if (obj[table.primary_key] === PK) {
                    pasteItem = obj;
                } else {
                    newData.push(obj);
                }
            });
            break;

        default:
            alertData = "";
            break;
    }

    // Apply changes for delete/cut operations
    if (alertData.caller.startsWith("delete") || alertData.caller.startsWith("cut")) {
        showValues = true;
        makeChange();
        model.DataModel[modelIndex].CollectionData = newData;
        loadDataModel();
        pasteItem = alertData.caller === "cutItem" ? pasteItem : {};
    }
}