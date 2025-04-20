/**
 * MongoDB Index Modeler - UI Manager
 * 
 * This file contains functions for managing the user interface,
 * including rendering tables, handling user input, and
 * displaying collection data.
 */

// ===================================================================
// Table Rendering and Display
// ===================================================================

/**
 * Shows the table for the current collection
 * Clears existing content and builds new table structure
 */
function showTable() {
    // Reset the table display
    $("#primary_table").html('');

    // Build the table html
    makeTable(table);

    // Build HTML and add tabs for each index
    if (datamodel.SecondaryIndexes) {
        $.each(datamodel.SecondaryIndexes, function(index, gsi) {
            makeIndex(gsi);
        });
    }

    // Show table and hide about section
    $("#aboutDiv").hide();
    $("#tabDiv").show();
    $("#tabs").show();
    $("#fileDiv").hide();
    $("#tableDivButton").className += " active";

    // Add mouse event handlers for table cells
    $(".tabable").mousedown(function(eventData) {
        var id = $(this).attr("id");
        selectId = cellId[id];
        mouseDown = true;
        if (eventData.which === 3) {
            $(jq(id)).selectText(parseInt(id.substr(4)));
        }
    });
}

/**
 * Generates the table for the main collection view
 * 
 * @param {Object} table - Table configuration
 */
function makeTable(table) {
    // Generate HTML for the primary key index tab
    var html = '<thead tabindex="-1"><tr tabindex="-1">' +
               '<th tabindex="-1" colspan="2" style="text-align: center; width: 40%;">' +
               '<div>Index Key<div tabindex="-1" class="bottomright noselect">' +
               '<input tabindex="-1" onclick="addItemClick(\'\')" type="image" src="./img/add.png" ' +
               'title="Add Document" style="cursor:pointer; background:transparent; float:right; border:0; outline:none;" ' +
               'border = 0 width="20" height="20"></div></div></th>'; 
    
    html += generate(true, ["_id"]);

    // Add generated HTML to the primary_table element and set titles and styles
    $("#primary_table").html(html);
    $(".basetable_title").text(table.name);
    $(".tablediv").css('display', '-webkit-box');
    $(".classprimaryKey").css('width', '400');

    // Focus the first cell or selected object
    var focusCell = selectId == null || Object.keys(selectId).length === 0 ? 
        boundary.first : selectId;
    
    $.each(cellId, function(prop, val) {
        if (val.PK === focusCell.PK && 
            val.SK === focusCell.SK && 
            val.attr === focusCell.attr) {
            $(jq(prop)).trigger("focus");
            return false;
        }
    });

    // Remove all index tab content
    $.each($(".tabcontent"), function(idx, obj) {
        if (obj.id !== "tablediv") {
            $(jq(obj.id)).remove();
        }
    });

    // Remove index tab buttons
    $.each($(".tablinks"), function(idx, obj) {
        if (obj.id !== "tableDivButton") {
            $(jq(obj.id)).remove();
        }
    });
}

/**
 * Generates HTML and tab element for a secondary index
 * 
 * @param {Object} index - Index configuration
 */
function makeIndex(index) {
    // Set base element name
    var element = "#" + index.IndexName;

    // If this tab already exists then remove it
    if ($(element + "_tab").length) {
        $(element + "_tab").remove();
    }

    // Generate the HTML for this index
    var html = '<div tabindex="-1" id="' + index.IndexName + '_tab" class="tabcontent">'; 
    var colspan = index.KeyAttributes.length;

    if (colspan < 2) {
        colspan = 2;
    }

    html += '<table tabindex="-1"><thead tabindex="-1"><tr tabindex="-1">' +
            '<th tabindex="-1" colspan=' + colspan + '>Index Keys</th>';
    html += generate(false, index.KeyAttributes);
    html += "</div>";

    // Add the html to the tab control
    $("#tabs").append(html);

    // If the button for this index tab exists then remove it
    if ($(element + "_btn").length) {
        $(element + "_btn").remove();
    }

    // Build the button for the HTML and add it to the tab control
    html = '<button tabindex="-1" id="'+ index.IndexName + '_btn" class="tablinks" ' +
           'style="display:inline" onclick="showTab(event, \'' + index.IndexName + '_tab\')">' +
           '<h2>' + index.IndexName + '</h2></button>';
    
    $("#tabDiv").append(html);
}

/**
 * Generates HTML for table or index content
 * 
 * @param {boolean} isCollection - Whether this is the main collection view
 * @param {Array} sortKeys - Array of sort key fields
 * @return {string} HTML for the table
 */
function generate(isCollection, sortKeys) {
    // Container for sort row html
    var sortHtml = '';
    var maxLength = 0;
    
    // Column span for partition key column
    var primaryColSpan = 1;

    // Add sort key to table header if it exists
    if (sortKeys.length > 1) {
        sortKeys.forEach(function(item, index) {
            if (index > 0) {
                sortHtml += '<th tabindex="-1" class="key_cell">' + item + '</th>';
            }
        });
    } else {
        primaryColSpan = 2;
    }

    // Set the tab index
    tabIndex = 1;
    var rowHtml = '';

    // Expand and sort the document data
    var sortData = expandDocuments(sortKeys);

    // Find the max length of all rows to calculate cell width
    sortData.forEach(function(object) {
        addEntityToSchema(object);
        // Record max width for the table
        if (maxLength < Object.keys(object).length) {
            maxLength = Object.keys(object).length;
        }
    });

    // Process sorted groups of documents
    sortObjectList(isCollection, sortKeys[0], sortData).forEach(function(documentArray) {
        var tbodyHtml = '';
        var PK = '';
        var SK = '';
        var dispVal = '';
        var id = '';

        // Build B-tree view map for hierarchical display
        keyMap = buildBtreeView(documentArray, sortKeys);

        // For each document in this partition group
        documentArray.forEach(function(document, count) {
            tbodyHtml = '<tr>';

            let type = (document && document.type) ? document.type : null;
            let entity = type ? schema.models[type] : null;

            // If first cell, insert primary key value spanning all rows
            if (count === 0) {
                PK = document["dispVals"][sortKeys[0]];
                dispVal = PK;
    
                // If this is the main collection view, cells are editable
                if (isCollection) {
                    id = "cell" + tabIndex;
                    
                    // If this is a new document, set focus
                    if (PK === "~new~") {
                        selectId = {
                            PK: "~new~",
                            attr: sortKeys[0]
                        };
                    }

                    // Initialize first cell reference if needed
                    if (!boundary.first.hasOwnProperty("PK")) {
                        boundary.first = {
                            PK: PK,
                            attr: sortKeys[0]
                        };
                    }

                    // Store cell metadata
                    cellId[id] = {
                        PK: PK,
                        attr: sortKeys[0],
                        type: type,
                        obj: document
                    };

                    // Create editable cell for primary key
                    dispVal = buildKeyCell(id, sortKeys[0], sortKeys);
                }

                // Add the cell to the row
                tbodyHtml += '<td class="td_key" rowspan="' + 
                            (documentArray.length * 2) + 
                            '" colspan="' + primaryColSpan + '">' + 
                            dispVal + '</td>';
            }

            // Insert sort key values for the document
            let vals = {};
            sortKeys.forEach(function(key, index) {
                // Skip partition key (first key)
                if (index === 0) {
                    return true;
                }

                id = "cell" + tabIndex;
                
                // Determine display value based on view mode
                if (!showValues && entity) {
                    if (entity[key]) {
                        SK = dispVal = entity[key].value || entity[key].type;
                    } else {
                        SK = document["dispVals"][key];
                    }
                } else {
                    SK = document["dispVals"][key];
                    dispVal = SK.startsWith("~new~") ? "~new~" : SK;
                }

                // Get actual value through dot notation path
                let path = key.split(".");
                let val = document[path[0]];

                for (let i = 1; i < path.length; i++) {
                    val = val[path[i]];
                }

                val = getDisplayValue(val);
                
                // Track values for B-tree rendering
                if (!vals.hasOwnProperty(key)) {
                    vals[key] = [];
                }
                
                vals[key].push(val);

                // Build cells with appropriate rowspan based on B-tree structure
                switch (index) {
                    case 1:
                        if (!keyMap[val].hasOwnProperty("isGenerated")) {
                            tbodyHtml += '<td class="td_key" rowspan="' + 
                                        keyMap[val]["span"] + '">' + 
                                        dispVal + '</td>';
                            keyMap[val]["isGenerated"] = true;
                        }
                        break;
                    
                    case 2:
                        if (!keyMap[vals[sortKeys[1]][0]][val].hasOwnProperty("isGenerated")) {
                            tbodyHtml += '<td class="td_key" rowspan="' + 
                                        keyMap[vals[sortKeys[1]][0]][val]["span"] + '">' + 
                                        dispVal + '</td>';
                            keyMap[vals[sortKeys[1]][0]][val]["isGenerated"] = true;
                        }
                        break;

                    case 3:
                        if (!keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][val].hasOwnProperty("isGenerated")) {
                            tbodyHtml += '<td class="td_key" rowspan="' + 
                                        keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][val]["span"] + '">' + 
                                        dispVal + '</td>';
                            keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][val]["isGenerated"] = true;
                        }
                        break;
                    
                    case 4:
                        if (!keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][val].hasOwnProperty("isGenerated")) {
                            tbodyHtml += '<td class="td_key" rowspan="' + 
                                        keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][val]["span"] + '">' + 
                                        dispVal + '</td>';
                            keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][val]["isGenerated"] = true;
                        }
                        break;
                    
                    case 5:
                        if (!keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][vals[sortKeys[4]]][val].hasOwnProperty("isGenerated")) {
                            tbodyHtml += '<td class="td_key" rowspan="' + 
                                        keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][vals[sortKeys[4]]][val]["span"] + '">' + 
                                        dispVal + '</td>';
                            keyMap[vals[sortKeys[1]]][vals[sortKeys[2]]][vals[sortKeys[3]]][vals[sortKeys[4]]][val]["isGenerated"] = true;
                        }
                        break;
                }
            });

            // Build header and value rows for the document
            var header = '';
            var row = '';
            
            // Process each field in the document
            Object.entries(document).forEach(function([name, value]) {
                id = "cell" + tabIndex;
                
                // Skip sort keys and display values
                if (sortKeys.includes(name) || name === "dispVals") {
                    return true;
                }

                // Start building the header cell
                header += '<td class="grey-header">';
                var tail = "";

                // If this is a new attribute, make it editable
                if (isCollection && name === "~new~") {
                    cellId[id] = {
                        PK: document["dispVals"][sortKeys[0]],
                        attr: "new",
                        type: type,
                        obj: document
                    };

                    // Store attribute name cell id in the focus pointer
                    selectId = cellId[id];

                    // Create editable div for attribute name
                    header += '<div id="' + id + '" class="tabable tab' + tabIndex + 
                             ' attribute-context-menu" tabindex="0" onfocus="$(\'#' + id + 
                             '\').selectText(' + tabIndex++ + ')" onfocusout="focusOut(\'' + 
                             id + '\')" onkeypress="nameAttribute(\'' + id + '\')" contenteditable>';
                    tail = "</div>";
                }

                // Finish the header cell
                header += name + tail + '</td>';

                // Create and store metadata for attribute value cell
                if (isCollection) {
                    id = "cell" + tabIndex;
                    cellId[id] = {
                        PK: PK,
                        attr: name,
                        type: type,
                        obj: document
                    };

                    boundary.last = cellId[id];
                }

                // Remove display values to avoid cluttering the object
                delete document["dispVals"];

                // Handle different value types
                if (typeof value === 'object' || Array.isArray(value)) {
                    // For objects and arrays, show expandable content
                    let linkText = "{...}</td>";
                    if (Array.isArray(value)) {
                        linkText = "[...]</td>";
                    }
                    
                    // Add document editor for complex values
                    if (isCollection) {
                        row += '<td onclick="editDocument(\'' + id + '\')" ' +
                              'style="text-align: center; cursor: zoom-in;" class="tabable tab' + 
                              tabIndex++ + '" tabindex="0">' + linkText;
                    } else {
                        row += "<td" + linkText;
                    }
                } else {
                    // Handle primitive values based on view mode
                    if (!showValues && entity && entity[name]) {
                        if (name === 'type') {
                            dispVal = value;
                        } else {
                            dispVal = entity[name].value || entity[name].type || value;
                        }
                    } else {
                        dispVal = value;
                        if (dispVal === '~new~' && entity && entity[name] && entity[name].default) {
                            dispVal = entity[name].default;
                        }
                    }
                    
                    // Make cell editable in collection view
                    if (isCollection) {
                        dispVal = '<div id="' + id + '" class="tabable cell-context-menu tab' + 
                                 tabIndex + '" tabindex="0" onfocus="$(\'#' + id + 
                                 '\').selectText(' + tabIndex++ + ')" onfocusout="focusOut(\'' + 
                                 id + '\')" onkeypress="updateItem(\'' + id + 
                                 '\')" contenteditable>' + dispVal + '</div>';
                    }
                    
                    row += '<td>' + dispVal + '</td>';
                }
            });

            // Finish the header/value rows and add to document row
            header += '</tr>';
            row += '</tr>';
            tbodyHtml += header + row;

            // Add document rows to the collection HTML
            rowHtml += tbodyHtml;
        });
    });

    // Add the undo button if this is the collection view
    var backDiv = "";
    if (isCollection) {
        backDiv = '<input tabindex="-1" onclick="undoChange(\'\')" type="image" src="./img/back.png" ' +
                 'title="Undo Change" style="cursor:pointer; background:transparent; float:right; ' +
                 'border:0; outline:none;" border = 0 width="20" height="20">';
    }

    // Build the complete table HTML
    var html = '<th id="attrHead" rowspan="2" colspan="' + maxLength + 
              '">Attributes' + backDiv + '</th></tr>';
    html += '<tr><th class="key_cell" colspan="' + primaryColSpan + '">' + 
            sortKeys[0] + '</th>';
    html += sortHtml + '</tr></thead><tbody>';
    html += rowHtml;
    html += "</tbody>";

    return html;
}

/**
 * Creates the HTML for a key cell with edit controls
 * 
 * @param {string} id - Cell ID
 * @param {string} primaryKey - Primary key name
 * @param {Array} sortKeys - Sort key names
 * @return {string} HTML for the key cell
 */
function buildKeyCell(id, primaryKey, sortKeys) {
    var keypress = '"updatePK(\'' + id + '\')"';
    var css = "PK-context-menu tab";
    var cellValue = buildButtonHtml(id);

    let retVal = '<div id="' + id + '" class="tabable ' + css + ' tab' + tabIndex + 
                '" tabindex="0" onfocus="$(\'#' + id + '\').selectText(' + tabIndex++ + 
                ')" onfocusout="focusOut(\'' + id + '\')" onkeypress=' + keypress + 
                ' contenteditable>' + cellValue +'</div>';

    return retVal;
}

/**
 * Constructs the button HTML for a key cell
 * 
 * @param {string} id - Cell ID
 * @return {string} HTML with cell content and control buttons
 */
function buildButtonHtml(id) {
    var add = '<input tabindex="-1" onclick="editDocument(\'' + id + 
             '\')" type="image" src="./img/edit.png" title="Edit Document" ' +
             'style="cursor:pointer; background:transparent; float:right; border:0; outline:none;" ' +
             'border = 0 width="15" height="15">';
             
    var remove = '"deletePartition(\'' + id + '\')"';
    var text = cellId[id].PK;
    var title = "Delete Document";

    text += '<div tabindex="-1" style="min-width: 35px;" class="bottomright noselect">' + 
            add + '<input tabindex="-1" onclick=' + remove + 
            ' type="image" src="./img/delete.png" title="' + title + 
            '" style="cursor:pointer; background:transparent; float:left; border:0; outline:none;" ' +
            'border = 0 width="15" height="15"></div>';
    
    return text;
}

/**
 * Toggles between showing values or schema metadata
 */
function toggleSchema() {
    showValues = !showValues;
    showTable();
}

// ===================================================================
// Event Handlers for Table Cells
// ===================================================================

/**
 * Updates the primary key when edited
 * 
 * @param {string} id - Cell ID
 */
function updatePK(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // Process only on Enter or null key events
    if (keycode === 13 || keycode === 0) {
        // Set keypress event flag
        fired = true;

        // Cancel the carriage return
        event.preventDefault();

        // Get the new value, process only if different
        var newVal = $(jq(id)).text();

        if (newVal === cellId[id].PK) {
            return;
        }

        // Check for duplicate ID
        if (!testForDuplicateId(newVal)) {
            // Snapshot the model state
            makeChange();
            var first = {};
            
            // Find the document and update the _id value
            json_data.forEach(function(obj) {
                if (obj[table.primary_key] === cellId[id].PK) {
                    obj[table.primary_key] = newVal;
                    
                    if (jQuery.isEmptyObject(first)) {
                        first = obj;
                    }
                }
            });

            // Update cell metadata
            cellId[id].PK = newVal;
            selectId = cellId["cell" + (parseInt(id.substr(4)) + 1)];
            selectId.PK = newVal;
            selectId.obj = first;
        }
    
        // Refresh the table
        loadDataModel();
    }
}

/**
 * Assigns a name to a new attribute
 * 
 * @param {string} id - Cell ID
 * @return {boolean} False if operation fails
 */
function nameAttribute(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // Process on Enter key or from context menu selection
    if (keycode === 13 || keycode === 0 || selectId.hasOwnProperty("attrName")) {
        // Cancel keypress
        event.preventDefault();

        // Get the attribute name
        var attribute = selectId.hasOwnProperty("attrName") ? 
                       selectId.attrName : 
                       $(jq(id)).text();
        
        delete selectId.attrName;

        // Find the document for this cell
        let obj = cellId[id].obj;
        
        // Check if property already exists
        if (obj.hasOwnProperty(attribute)) {
            return false;
        }
        
        // Add the attribute definition to the schema
        addModelAttribute(obj.type, attribute);
        
        // Move value to the new attribute and delete placeholder
        obj[attribute] = obj["~new~"];
        delete obj["~new~"];
        
        // Set focus to the new attribute
        selectId = {
            PK: obj[table.primary_key],
            attr: attribute,
            obj: obj
        };

        // Add this attribute to other objects of this type
        if (obj.hasOwnProperty("type")) {
            json_data.forEach(function(obj1) {
                if (obj.type === obj1.type) {
                    obj1[attribute] = "~new~";
                }
            });
        }

        // Refresh the table
        loadDataModel();
    }
}

/**
 * Updates an item attribute with a new value
 * 
 * @param {string} id - Cell ID
 */
function updateItem(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // Process only on Enter or null key events
    if(keycode === 13 || keycode === 0) {
        event.preventDefault();

        // Set flags
        fired = true;
        mouseDown = false;
        
        // Update the value
        setValue(id);
    }
}

/**
 * Sets an attribute value
 * 
 * @param {string} id - Cell ID
 */
function setValue(id) {
    // Get the new value and cell metadata
    var newVal = $(jq(id)).text();
    var PK = cellId[id].PK;
    var name = cellId[id].attr;
    var obj = cellId[id].obj;

    // Skip uninitialized values
    if (newVal === "~new~") {
        return;
    }
        
    // Get entity schema
    let entity = schema.models[obj.type] || {};
    let field = entity[name] || { type: "String" };
    
    // Handle meta view editing
    if (!showValues) {
        // Editing type or value template
        if (name === 'type') {
            if (obj.type === newVal) {
                return;
            }
            
            showValues = true;
            setValue(id);
            showValues = false;
        } else {
            // Skip if no change
            if (newVal === field.type || newVal === field.value) {
                return;
            }
            
            makeChange();
            
            // Update attribute type if valid
            if (Object.keys(DATA_TYPES).includes(newVal)) {
                json_data.forEach(function(item) {
                    setAttributeType(newVal, item, name);
                });
                
                field.type = newVal;    
            } else {
                // Set as value template
                field.value = newVal;
            }
        }
        
        loadDataModel();
    } else {
        // Regular attribute value editing
        if (obj[name] !== newVal) {
            // Move to next cell if available
            if (cellId.hasOwnProperty("cell" + (parseInt(id.substr(4)) + 1))) {
                selectId = cellId["cell" + (parseInt(id.substr(4)) + 1)];
            } else {
                selectId = cellId["cell1"];
            }

            // Snapshot model state and apply the change
            makeChange();
            obj[name] = newVal;

            // Handle type changes
            if (name === "type") {
                // Remove existing attributes except keys
                Object.keys(obj).forEach(function(key) {
                    if (key !== table.primary_key && key !== "type") {
                        delete obj[key];
                    }
                });

                // Add attributes for new type with default values
                if (schema.models.hasOwnProperty(newVal)) {
                    Object.keys(schema.models[newVal]).forEach(function(prop) {
                        let props = ['type', table.primary_key];
                        if (!props.includes(prop)) {
                            obj[prop] = '~new~';
                        }
                    });
                } else {
                    // Create new entity type schema
                    addEntityToSchema(obj);
                }
            }

            // Refresh the table
            loadDataModel();
        }
    }
}

// ===================================================================
// Document Editing
// ===================================================================

/**
 * Opens the document editor for a cell
 * 
 * @param {string} id - Cell ID
 */
function editDocument(id) {
    // Clone object without display values
    delete cellId[id].obj.dispVals;
    
    // Initialize JSON editor with object
    jsonEditor = new JsonEditor("#documentJSON", cellId[id].obj);
    
    // Show the editor modal
    $("#editDocument").toggle();
}

/**
 * Saves changes from the document editor
 */
function saveDocument() {
    var editDoc = {};
    var repDoc = {};
    var deletedAttrs = [];
    var newAttrs = [];

    try {
        // Get edited document from editor
        editDoc = jsonEditor.get();
        $("#editDocument").toggle();
    } catch (e) {
        alert("Parsing error. Valid JSON text required.");
        return;
    }
    
    // Snapshot the model state
    makeChange();

    // Find the document to replace
    json_data.forEach(function(doc) {
        if (editDoc["_id"] === doc["_id"]) {
            repDoc = doc;
            return false;
        }
    });

    // Handle type changes
    if (repDoc["type"] !== editDoc["type"]) {
        // Remove existing attributes except ID
        Object.keys(repDoc).forEach(function(key) {
            if (key !== "_id") {
                delete repDoc[key];
            }
        });

        // Add attributes for existing type or create new model
        if (schema.models.hasOwnProperty(editDoc["type"])) {
            repDoc["type"] = editDoc["type"];
            
            // Add default values for type attributes
            Object.keys(schema.models[editDoc["type"]]).forEach(function(prop) {
                let props = ['type', "_id"];
                if (!props.includes(prop)) {
                    repDoc[prop] = '~new~';
                }
            });
        } else {
            // Copy all attributes from edited doc
            Object.keys(editDoc).forEach(function(key) {
                if (key !== "_id") {
                    repDoc[key] = editDoc[key];
                }
            });
            
            // Add to schema
            addEntityToSchema(repDoc);
        }
    } else {
        // Same type - track attribute changes
        
        // Find deleted attributes
        Object.keys(repDoc).forEach(function(key) {
            if (Object.keys(editDoc).includes(key)) {
                repDoc[key] = editDoc[key];
            } else {
                deletedAttrs.push(key);
                delete repDoc[key];
            }
        });
    
        // Find new attributes
        Object.keys(editDoc).forEach(function(key) {
            if (!Object.keys(repDoc).includes(key)) {
                repDoc[key] = editDoc[key];
                newAttrs.push(key);
            }
        });
    }
    
    // If no schema changes, just reload
    if (newAttrs.length === 0 && deletedAttrs.length === 0) {
        loadDataModel();
    } else {
        // Ask about applying schema changes to all documents
        alertData["caller"] = "saveDocument";
        alertData["data"] = {};
        alertData["data"]["newAttrs"] = newAttrs;
        alertData["data"]["deletedAttrs"] = deletedAttrs;
        alertData["data"]["type"] = repDoc["type"];
        alertData["data"]["callerId"] = repDoc["_id"];

        $("#schemaChangeText").text(
            `Apply schema changes to all documents of the '${alertData.data.type}' type?`
        );
    
        $("#schemaChangeModal").show();
    }
}

// ===================================================================
// Context Menu and UI Controls
// ===================================================================

/**
 * Constructs context menus for table cells
 * Sets up right-click menu options based on cell type
 */
function buildContextMenus() {
    // Clear existing context menus
    $.contextMenu('destroy');
    
    // Build attribute selection menu
    var attrItems = {};
    
    // Add available attributes from model
    if (datamodel.NonKeyAttributes) {
        datamodel.NonKeyAttributes.forEach(function(attr) {
            if (!selectId.obj.hasOwnProperty(attr.AttributeName)) {
                attrItems[attr.AttributeName] = {name: attr.AttributeName};
            }
        });
    }
    
    // Create context menu for attribute name cells
    if (Object.keys(attrItems).length > 0) {
        $.contextMenu({
            selector: '.attribute-context-menu',
            callback: function(key, options) {
                selectId.attrName = key;
                nameAttribute($(this).attr("id"));
            },
            items: attrItems
        });
    }
    
    // Add "new attribute" option
    attrItems["new"] = {name: "New attribute..."};

    // Create standard item context menu
    var items = {
        "add": {
            name: "Add Attribute", 
            icon: "fa-plus",
            items: attrItems
        },
        "cut": {name: "Cut Item", icon: "fa-cut"},
        "copy": {name: "Copy Item", icon: "fa-copy"},
        "delete": {name: "Delete Item", icon: "fa-minus"},
        "function": {
            name: "Edit Value Template",
            icon: "fa-wrench"
        },
        "insert": {
            name: "Generate Value",
            items: {
                "uuid": { name: "UUID", icon: "fa-fingerprint" },
                "date": { name: "ISO8601 Date String", icon: "fa-clock" }
            },
            icon: "fa-clone"
        }
    };

    // Context menu for sort key cells
    $.contextMenu({
        selector: '.SK-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "date":
                    $(this).text(new Date().toISOString().split(".")[0]);
                    selectId.SK = $(this).text();
                    setValue($(this).attr("id"));
                    break;

                case "uuid":
                    $(this).text(generateUUID());
                    selectId.SK = $(this).text();
                    setValue($(this).attr("id"));
                    break;

                case "cut":
                    alertData.caller = "cutItem";
                    alertData.data = $(this).attr("id");
                    postResponse();
                    break;

                case "copy":
                    alertData.caller = "copyItem";
                    alertData.data = $(this).attr("id");
                    postResponse();
                    break;

                case "delete":
                    deleteItem($(this).attr("id"));
                    break;

                case "function":
                    showValueTemplate($(this).attr("id"));
                    break;
                    
                default:
                    addAttribute($(this).attr("id"), key === "new" ? "~new~" : key);
                    break;
            }
        },
        items: items
    });
    
    // Context menu for standard value cells
    $.contextMenu({
        selector: '.cell-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "date":
                    $(this).text(new Date().toISOString().split(".")[0]);
                    setValue($(this).attr("id"));
                    break;

                case "uuid":
                    $(this).text(generateUUID());
                    setValue($(this).attr("id"));
                    break;

                case "delete":
                    selectId = cellId[$(this).attr("id")];
                    $("#removeAttributeModal").show();
                    break;

                case "function":
                    showValueTemplate($(this).attr("id"));
                    break;
            }
        },
        items: {
            "delete": {
                name: "Delete Attribute",
                icon: "fa-minus",
                disabled: function(key, opt) {
                    return cellId[$(this).attr("id")].attr === "type";
                }
            },
            "function": {
                name: "Edit Value Template",
                icon: "fa-wrench",
                disabled: function(key, opt) {
                    return cellId[$(this).attr("id")].attr === "type";
                }
            },
            "insert": {
                name: "Generate Value",
                items: {
                    "uuid": { name: "UUID", icon: "fa-fingerprint" },
                    "date": { name: "ISO8601 Date String", icon: "fa-clock" }
                },
                icon: "fa-clone"
            }
        }
    });

    // Context menu for partition key cells
    items = {
        "add": {name: "Add Attribute", icon: "fa-plus"},
        "delete": {name: "Delete Document", icon: "fa-minus"}
    };

    $.contextMenu({
        selector: '.PK-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "add":
                    addAttribute($(this).attr("id"), "~new~");
                    break;

                case "delete":
                    deletePartition($(this).attr("id"));
                    break;

                case "paste":
                    selectId.SK = pasteItem.SK;
                    selectId.attr = table.sort_key;
                    addItem($(this).attr("id"));
                    loadDataModel();
                    break;

                case "function":
                    showValueTemplate($(this).attr("id"));
                    break;
            }
        },
        items: items
    });
}