/**
 * MongoDB Index Modeler - Event Handlers
 * 
 * This file contains event handler functions for the application's UI elements.
 * Handles document ready events and binds user interactions to application functionality.
 */

// ===================================================================
// Document Ready Handler
// ===================================================================

$(document).ready(function() {
    // Initialize from cookies if available
    initializeFromCookies();
    
    // Set up file upload handler
    initializeFileUploader();
    
    // Set up button event handlers
    initializeButtonHandlers();
    
    // Set up modal dialog handlers
    initializeModalHandlers();
    
    // Set up UI controls
    initializeUIControls();
});

// ===================================================================
// Initialization Functions
// ===================================================================

/**
 * Initializes application from cookies if available
 */
function initializeFromCookies() {
    var credStr = getCookie("credentials");
    
    if (credStr !== "") {
        credentials = JSON.parse(credStr);
        initDynamoClient();
    }
}

/**
 * Initializes file uploader with event handler
 */
function initializeFileUploader() {
    $("#importFile").change(function(e) {
        $("#fileDiv").hide();
        var reader = new FileReader();
        reader.onload = onReaderLoad;
        reader.readAsText(e.target.files[0]);
    });
}

/**
 * Initializes button event handlers
 */
function initializeButtonHandlers() {
    // OneTable schema import button
    $(".btnImportOneTable").bind('click', function(evt) {
        importOneTableSchema($("#schema").text());
        $("#oneTableModal").hide();
    });

    // Document generation button
    $("#btnCreateDocs").bind('click', function(evt) {
        $("#createModelDiv").hide();
        $("#generateDocs").show();
    });

    // Value template definition button
    $("#btnDefineMap").bind('click', function(evt) {
        if ($("#txtMapFunction").val().indexOf("${" + alertData.caller + "}") >= 0) {
            alert("Map Functions cannot reference the destination attribute.");
            return;
        }
        
        var valueTemplate = $("#txtMapFunction").val();
        
        makeChange();
        createMapping(alertData.data.type, alertData.caller, valueTemplate);
        loadDataModel();

        // Reset dialog fields and hide
        $("#txtMapFunction").val("");
        $("#lblEditMap").text("Mapping Function:");
        $("#selectTypeDiv").hide();
        $("#defineValueTemplateDiv").hide();
    });

    // Document save button
    if ($("#btnSaveDocument").length) {
        $("#btnSaveDocument").on('click', function() {
            saveDocument();
        });
    }

    // Schema view toggle button
    $("#showValues").bind('click', function(e) {
        toggleSchema();
        $("#showValuesCheckbox").prop("checked", showValues);
        e.preventDefault();
    });

    // Show values checkbox default state
    $("#showValuesCheckbox").prop("checked", true);
}

/**
 * Initializes modal dialog handlers
 */
function initializeModalHandlers() {
    // Document setup modal handlers
    $("#selectDocumentType").change(function() {
        handleTypeSelectionChange();
    });

    $("#btnProcessDocumentSetup").click(function() {
        processDocumentSetup();
    });
    
    // Generic cancel button handler for all modals
    $('.cancel').bind('click', function(evt) {
        closeAllModals();
        
        // Refresh the table view to show updated values
        loadDataModel();
    });

    // Create model button handler
    $("#btnCreateModel").click(function(evt) {
        // Get values from form
        var modelName = $("#txtModelName").val();
        var author = $("#txtModelAuthor").val(); 
        var description = $("#txtModelDesc").val();
        
        // Create new model
        createNewModel(modelName, author, description);
        
        // Close modal and open collection dialog
        $("#createModelDiv").hide();
        addCollection();
    });

    // View table dropdown change handler
    $("#viewTable").change(function(event) {
        $("#selectTableDiv").hide();

        if ($("#viewTable").val() === "-1") {
            // Create new collection if selected
            $("#selectTableDiv").hide();
            addCollection();
        }
        else {
            // Load selected collection
            modelIndex = parseInt($("#viewTable").val());
            loadDataModel();
        }

        // Update collection list
        findDataModels();
    });

    // Create index button handler
    $("#createIndex").find(".btn_create").on('click', function() {
        var definition = {};

        // Validate index keys
        if ($('.indexKeys').val() === '') {
            alert("Please provide the Key Attributes for the index!");
            return;
        }

        // Set up index definition
        definition.KeyAttributes = {};
        definition.IndexName = $('.indexTitle').val();
        definition.KeyAttributes = $('.indexKeys').val().replace(", ", ",").split(",");

        // Add index to model
        makeChange();
        datamodel.SecondaryIndexes.push(definition);
        
        // Reset form and close dialog
        $("#createIndex").find('.key_input').val('');
        $('#createIndex').toggle();

        // Refresh UI
        findDataModels();
        loadDataModel();
    });

    // Create collection button handler
    $("#createCollection").find(".btn_tablecreate").on('click', function() {
        // Validate collection name
        if ($('.collectionTitle').val() === '') {
            alert("Please provide a name for the collection!");
            return;
        }

        // Create new collection
        var collectionName = $('.collectionTitle').val();
        createNewCollection(collectionName);
        
        // Add initial document
        addItem("~new~");
        
        // Reset form and close dialog
        $("#createCollection").find('.key_input').val('');
        $('#createCollection').toggle();

        // Refresh UI
        findDataModels();
        loadDataModel();
    });
}

/**
 * Initializes UI controls and menu items
 */
function initializeUIControls() {
    // Sidebar menu items
    initializeSidebarMenu();
    
    // Table controls
    initializeTableControls();
    
    // Import/export controls
    initializeImportExportControls();
}

/**
 * Initializes sidebar menu items
 */
function initializeSidebarMenu() {
    // Load Model menu item
    $("#loadModel").on('click', function() {
        $("#mySidenav").css("width","0");
        $("#saveCredsDiv").hide();
        $("#fileDiv").show();
        
        $("#fileType").text("Load Model");
        $("#loadType").text("Select a model:");
        
        alertData.caller = "loadModel";
    });
    
    // Load Credentials menu item
    $("#loadCreds").on('click', function() {
        $("#mySidenav").css("width","0");
        $("#saveCredsDiv").prop('checked', false);
        $("#saveCredsDiv").show();
        $("#fileDiv").show();
        
        $("#fileType").text("Load Credentials");
        $("#loadType").text("Select credentials file:");
        
        alertData.caller = "loadCreds";
    });
    
    // Save to Table menu item
    $("#saveToTable").on('click', function() {
        alertData.caller = "save";
        $("#lblLoadSave").text("Save to Table");
        $("#mySidenav").css("width","0");
        $("#schemaTableDiv").show();
    });
    
    // Load from Table menu item
    $("#loadFromTable").on('click', function() {
        alertData.caller = "load";
        $("#selectModel").val("none");
        $("#lblLoadSave").text("Load from Table");
        $("#mySidenav").css("width","0");
        $("#schemaTableDiv").show();
    });

    // Create Model menu item
    $("#createModel").on('click', function() {
        $("#mySidenav").css("width","0");
        
        if (model.ModelName != null) {
            // Confirm overwrite of existing model
            alertData = {
                caller: "createModel",
                data: ""
            };

            $("#alertTitle h1").text("Model Overwrite");
            $("#alertText").text("The existing model will be overwritten, continue?");

            $("#alertModal").show();
        }
        else {
            // Show create model dialog
            $("#createModelDiv").show();
        }
    });

    // Save Model menu item
    $("#saveModel").on('click', function() {
        $("#mySidenav").css("width","0");
        saveModel();
    });

    // Reload/Clear Model menu item
    $("#reload").on('click', function() {
        location.reload();
    });
}

/**
 * Initializes table control buttons
 */
function initializeTableControls() {
    // Add GSI button
    $(".addGSI").on('click', function() {
        $("#mySidenav").css("width","0");
        $('#createIndex').toggle();
    });

    // Clear indexes button
    $("#clearIdx").on('click', function() {
        $("#mySidenav").css("width","0");
        datamodel.GlobalSecondaryIndexes = [];
        loadDataModel();
    });
}

/**
 * Initializes import/export controls
 */
function initializeImportExportControls() {
    // Import Schema button
    $("#importSchema").on('click', function() {
        $("#oneTableModal").show();
    });

    // Export Schema button
    $("#exportSchema").on('click', function() {
        $("#mySidenav").css("width","0");
        exportOneTableSchema();
    });
}

// ===================================================================
// Modal Dialog Management
// ===================================================================

/**
 * Closes all modal dialogs and resets their state
 */
function closeAllModals() {
    // Hide all modal containers
    $(".modal").hide();
    $("#createTableOrIndex").hide();
    $("#fileDiv").hide();
    $("#selectTableDiv").hide();
    $("#createModelDiv").hide();
    $("#alertModal").hide();
    $("#removeAttributeModal").hide();
    $("#oneTableModal").hide();
    $("#defineValueTemplateDiv").hide();
    $("#schemaTableDiv").hide();
    $("#modelDiv").hide();
    $("#editDocument").hide();

    // Reset value template dialog
    $("#txtMapFunction").val("");
    $("#lblEditMap").text("Mapping Function:");
    $("#selectTypeDiv").hide();
    $("#txtMapFunction").prop("disabled", false);
    $("#btnDefineMap").prop("disabled", false);

    // Reset any active query
    if (typeof initQuery === 'function') {
        initQuery();
    }
}

/**
 * Shows the collection creation dialog
 */
function addCollection() {
    $("#tbSort").show();
    $("#dropSort").show();
    $("#primaryKey").hide();
    $("#projection_cfg").hide();
    $('#createCollection').toggle();
}

// ===================================================================
// File and Model Loading
// ===================================================================

/**
 * Handles file reader load event for model loading
 * 
 * @param {Event} event - File reader load event
 */
function onReaderLoad(event) {
    if (alertData.caller === "loadModel") {
        // Parse model from file
        model = JSON.parse(event.target.result);

        // Reset schema
        schema = Object.assign({}, DEFAULT_SCHEMA);

        // Find collections in model
        findDataModels();

        // Move any model schema to the appropriate collection
        if (model.hasOwnProperty("ModelSchema")) {
            model.DataModel[modelIndex].ModelSchema = model.ModelSchema;
            delete model.ModelSchema;
        }
        
        // Load the model
        loadDataModel();
    } else if (alertData.caller === "loadCreds") {
        // Parse credentials from file
        credentials = JSON.parse(event.target.result);
        
        // Initialize DynamoDB client
        initDynamoClient();
        
        // Save credentials to cookie if requested
        if ($("#saveCookie").is(":checked")) {
            setCookie("credentials", JSON.stringify(credentials), 365);
        }
    }
    
    // Reset file input and alert data
    $("#importFile").val("");
    alertData = {};
}

/**
 * Initializes DynamoDB client with credentials
 */
function initDynamoClient() {
    // Update AWS config with credentials
    AWS.config.update(credentials);
    
    // Create DynamoDB clients
    dynamodb = new AWS.DynamoDB();
    client = new AWS.DynamoDB.DocumentClient({
        maxRetries: 20, 
        httpOptions: {connectTimeout: 500}
    });
    
    // List available tables
    var params = {};
    
    dynamodb.listTables(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);
        } else {
            // Store account tables
            accountTables = data;
            
            // Initialize table dropdown
            $("#acctTable").empty();
            
            // Add default selected item
            $("#acctTable").append('<option disabled="disabled" selected="selected" value="none"> -- none -- </option>');
            
            // Add each table as an option
            data.TableNames.forEach(function(table) {
                $("#acctTable").append(`<option value="${table}">${table}</option>`);
            });
            
            // Show relevant buttons
            $("#loadFromTable").show();
            $("#saveToTable").show();
            $("#loadCreds").hide();
        }
    });
}

/**
 * Gets table description to determine key schema
 * 
 * @param {Object} params - Table parameters
 */
function describeTable(params) { 
    dynamodb.describeTable(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);
        } else {
            // Extract key schema
            data.Table.KeySchema.forEach(function(key) {
                if (key.KeyType === "HASH") {
                    alertData.PK = key.AttributeName;
                } else {
                    alertData.SK = key.AttributeName;
                }
            });
        }
    });    
}

/**
 * Saves schema to DynamoDB table
 */
function saveToTable() {
    var params = {
        TableName: saveTable
    };
    
    // Get table description to determine keys
    describeTable(params);

    // Build item to save
    let item = {};
    item[alertData.PK] = "_schema";
    item[alertData.SK] = model.ModelName;
    item.Schema = model;

    params.Item = item;

    // Save to DynamoDB
    client.put(params, function(err, data) {
        if (err) {
            if (err.message.includes("Missing the key")) {
                // Retry after key determination completes
                saveToTable();
            } else {
                console.log(err);
            }
        } else {
            // Reset state and hide dialog
            alertData = {};
            $("#schemaTableDiv").hide();
        }
    });
}

/**
 * Handles table schema operations
 */
function schemaTable() {
    initDynamoClient();
    
    if (alertData.caller === "save") {
        saveTable = $("#acctTable").val();
        saveToTable();
    } else {
        loadFromTable();
    }
}

/**
 * Loads available models from selected table
 */
function loadModels() {
    if (alertData.caller === "save") {
        return;
    }
    
    // Set up query parameters
    var params = {
        TableName: $("#acctTable").val()
    };

    // Get table description to determine keys
    describeTable(params);
    
    // Find all schema items
    params = {
        TableName: $("#acctTable").val(),
        KeyConditionExpression: "#pk = :val",
        ExpressionAttributeNames: {
            "#pk": alertData.PK
        },
        ExpressionAttributeValues: {
            ":val": "_schema"
        }
    };
    
    // Initialize models container
    alertData.models = {};
    
    // Query DynamoDB for schema items
    client.query(params, function(err, data) {
        if (err) { 
            if (err.message.includes("ExpressionAttributeNames")) {
                // Retry after key determination completes
                loadModels();
            } else {
                console.log(err);
            }
        } else {
            // Initialize model dropdown
            $("#selectModel").empty();
            
            // Add default option
            $("#selectModel").append('<option disabled="disabled" selected="selected" value="none"> -- none -- </option>');
            
            // Add each model as an option
            data.Items.forEach(function(item) {
                $("#selectModel").append(`<option value="${item[alertData.SK]}">${item[alertData.SK]}</option>`);
                alertData.models[item[alertData.SK]] = item.Schema;
            });
            
            // Show model selection
            $("#modelDiv").show();
        }
    });
}

/**
 * Loads selected model from DynamoDB
 */
function loadFromTable() {
    // Get selected model
    model = alertData.models[$("#selectModel").val()];
    
    // Reset state and hide dialog
    alertData = {};
    $("#modelDiv").hide();
    $("#schemaTableDiv").hide();
    
    // Load the model
    loadDataModel();
}

/**
 * Loads selected data model's collections into dropdown
 */
function findDataModels() {
    // Initialize dropdown
    $("#viewTable").empty();

    // Add default selected item
    $("#viewTable").append('<option disabled="disabled" selected="selected" value="none"> -- none -- </option>');

    // Add an option for each collection in the model
    if (model.DataModel) {
        model.DataModel.forEach(function(collection, idx) {
            $("#viewTable").append(`<option value="${idx}">${collection.CollectionName}</option>`);
        });
    }

    // Add the create new collection option
    $("#viewTable").append('<option value="-1"> Add new Collection... </option>');
}

// ===================================================================
// Schema Import/Export
// ===================================================================

/**
 * Imports a OneTable schema
 * 
 * @param {string} text - OneTable schema JSON
 */
function importOneTableSchema(text) {
    // Parse schema JSON
    schema = JSON.parse(text);
    
    // Validate schema
    if (!schema.models) {
        alert('Invalid OneTable schema. Missing top level models.');
        return;
    }
    
    // Initialize model
    model = {};

    // Process indexes
    for (let [indexName, index] of Object.entries(schema.indexes)) {
        var def = {};
        def.KeyAttributes = {};
        def.KeyAttributes.PartitionKey = {
            'AttributeName': index.hash,
            'AttributeType': 'S'
        };
        def.KeyAttributes.SortKey = {
            'AttributeName': index.sort,
            'AttributeType': 'S'
        };
        def.NonKeyAttributes = [];
        def.TableData = [];

        // Create new table or add as GSI
        if (!model.hasOwnProperty("DataModel")) {
            modelIndex = 0;
            model.DataModel = [];
            def.GlobalSecondaryIndexes = [];
            def.TableName = indexName;
            tableChanges[indexName] = [];
            model.DataModel.push(def);
            
            // Set table reference
            table = {
                name: indexName,
                primary_key: def.KeyAttributes.PartitionKey.AttributeName,
                sort_key: def.KeyAttributes.SortKey.AttributeName,
                sortkey_datatype: def.KeyAttributes.SortKey.AttributeType
            };
            
            // Set data reference
            json_data = def.TableData;
        } else {
            // Add as GSI
            def.IndexName = indexName;
            def.Projection = { ProjectionType: "ALL" };
            model.DataModel[modelIndex].GlobalSecondaryIndexes.push(def);
        }
    }
    
    // Set model index
    modelIndex = 0;
    datamodel = model.DataModel[modelIndex];

    // Extract models and attributes
    for (let [modelName, model] of Object.entries(schema.models)) {
        for (let [name, field] of Object.entries(model)) {
            if (field.value) {
                if (!schema.indexes[name]) {
                    // Add non-key attribute
                    let item = datamodel.NonKeyAttributes.find(a => a.AttributeName === name);
                    if (!item) {
                        item = {
                            AttributeName: name,
                            AttributeType: typeToDynamo(field.type),
                        };
                        datamodel.NonKeyAttributes.push(item);
                    }
                }
            }
        }
        
        // Define type attribute (OneTable does this automatically)
        if (!schema.models[modelName]) {
            schema.models[modelName].type = { 
                type: 'String', 
                required: true, 
                value: modelName 
            };
        }
    }

    // Process sample data if available
    if (schema.data) {
        // Convert each data row
        for (let row of schema.data) {
            let item = {};
            for (let [key, value] of Object.entries(row)) {
                item[key] = { 'S': value };
            }
            json_data.push(item);
        }
        
        // Process value templates and show table
        expandValueTemplates();
        showTable();
    } else {
        // Start with empty item
        addItem("~new~");
    }
}

/**
 * Exports current schema to OneTable format
 */
function exportOneTableSchema() {
    // Clone schema without modifying original
    let output = Object.assign({}, schema, {data: []});
    let data = output.data;
    
    // Convert each document to data row
    for (let row of json_data) {
        let item = {};
        for (let [key, value] of Object.entries(row)) {
            item[key] = Object.values(value)[0];
        }
        data.push(item);
    }
    
    // Save to file
    saveToFile(JSON.stringify(output, null, 4), "schema.json", "json");
}