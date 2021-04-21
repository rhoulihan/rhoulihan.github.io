/*
    CHANGES:

    TODO
    * Rename table -> ???
 */
var // container for the data model
    model = {},
    // pointer to model.DataModel[modelIndex]
    datamodel = {},
    // pointer to model.DataModels[0].TableData
    json_data = [],
    // container for change history (up to 50 revisions per table in the model)
    tableChanges = {},
    // container for the current table
    // properties: name, partition_key, sort_key, sortkey_datatype
    table = {},
    // holders for the current keys and data types used by makeTable()/makeIndex()/generate()
    partition_key,
    sort_key,
    sortkey_datatype,
    // list of unique values by attribute name
    unique_values = {},
    // gsi projection settings for new GSI
    gsi_attrkey = 'all',
    gsi_attrlist = [],
    // list of values from attributes with Map type
    vals = [],
    // Attribute element counter
    tabIndex = 0,
    // the object to focus when table is rendered
    selectId = {},
    // keypress event flag;
    fired = true,
    // current DataModel index
    modelIndex = 0,
    // container for alert data
    alertData = {
        caller: "",
        data: ""
    },
    // onClick event indicator to avoid double firing updates
    mouseDown = false,
    // container to hold first and last Attribute cells
    boundary = {
        first: {},
        last: {}
    },
    // container for Attribute cell metadata
    cellId = {},
    // the Item clipboard
    pasteItem = {},
    // number of filters for the currently loaded query
    numFilters = 0,
    // collection of items matching the current query
    match_data = [];
    // Show values vs types/templates
    showValues = true;

const DefaultSchema = {
    indexes: {},
    models: {},
    queries: {},
    data: [],
}

const types = {
    "String": "S", 
    "Number": "N", 
    "Binary": "B",
    "Boolean": "BOOL", 
    "Null": "NULL",
    "Map": "M",
    "List": "L",
    "StringSet": "SS",
    "NumberSet": "NS",
    "BinarySet": "BS"
}

/*
    Schema defining indexes, entity models.
*/
var schema = {
    indexes: { /*
        primary: { hash: 'partition-key-name', sort: 'sort-key-name' }
        gs1: { hash: 'partition-key-name', sort: 'sort-key-name' }
    */ },
    models: { /*
        map             String. Either simple attribute name or "attribute.property".
        default         String. Default value string or function.
        foreign         String. Reference to another entity model (model:keys)
        nulls           Boolean. Allow property to be set to null.
        required        Boolean. Attribute is always required.
        size            Number. Maximum size of the data value
        type            String: String, Boolean, Number, Date, Set, Buffer, Binary, Set, Object, Array
        validate        String. Regular expression to match data (/regexp/qualifiers)
        value           String|Function. Value string template, function (mapping function)
        unique          Boolean. Attribute must have a unique value

        //  Not proposed to implement
        crypt           Boolean
        enum            Array of values
        filter          Boolean. Prevent a property from being used in a filter
        hidden          Boolean Don't return the attributes to API callers.
        transform       Transform hook function
        uuid            ‘uuid | ulid | ksuid'
    */ },

    //  Present on import / export
    queries: {},
    data: {},
}

// Utility method to escape characters in an element id that will mess with jquery
function jq( myid ) {
    return (myid.startsWith("#") ? "" : "#") + myid.replace( /(:|\.|\||\[|\]|,|=|@|#|~|!)/g, "\\$1" );
}

// utility method to get string value from a DynamoDB json formatted attribute
function getValue(obj) {
    return obj ? obj[Object.keys(obj)[0]] : '';
}

// utility method to set  value of DynamoDB json formatted attribute
function assignValue(obj, val) {
    obj[Object.keys(obj)[0]] = val;
}

// passthrough method to fire keypress event when an editable div loses focus
function focusOut(id) {
    if (!fired)
        $(jq(id)).triggerHandler("keypress");

    fired = false;
}

// update a partition key value
function updatePK(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // if this is an enter or null key event then process the cell text
    if(keycode == '13' || keycode == '0') {
        // set keypress event flag
        fired = true;

        // cancel the carriage return
        event.preventDefault();

        // get the new value, if its different than the old key then process it
        var newVal = $(jq(id)).text();
        if (newVal != cellId[id].PK) {
            // snapshot the model state
            makeChange();
            // find the items in this partition and update the key values
            $.each(json_data, function(idx, obj) {
                if ( getValue(obj[table.partition_key]) == cellId[id].PK) {
                    assignValue(obj[table.partition_key], newVal);
                }
            });

            // update the cell metadata
            cellId[id].PK = newVal;
            selectId = cellId["cell" + (parseInt(id.substr(4)) + 1)];
            selectId.PK = newVal;

            // refresh the table view
            loadDataModel();
        }
    }
}

function addItemClick(id) {
    pasteItem = {};
    addItem(id);
}

// add a new item to the table
function addItem(id) {
    // build the new item
    var newItem = Object.keys(pasteItem).length > 0 ? JSON.parse(JSON.stringify(pasteItem)) : {};

    newItem[table.partition_key] = {"S":(cellId.hasOwnProperty(id) ? getValue(cellId[id].obj[table.partition_key]) : "~new~")};

    if (!newItem.hasOwnProperty(table.sort_key)) {
        if (sortkey_datatype == 'N')
            newItem[table.sort_key] = {"N":"0"};
        else
            newItem[table.sort_key] = {"S":"~new~"};

        newItem["type"] = {"S": "~new~"};
    } else {
        var dup = false;
        
        $.each(json_data, function(idx, obj) {
            if (getValue(obj[table.partition_key]) == getValue(newItem[table.partition_key]) && getValue(obj[table.sort_key]) == getValue(newItem[table.sort_key])) {
                alert("Duplicate Sort Key values not allowed in the same Partition.");
                dup = true;
                return false;
            }
        });

        if (dup)
            return;
    }

    // snapshot model state
    makeChange();

    // add "type" as a non-key attribute
    addNonKeyAttribute(null, 'type');
    json_data.push(newItem);

    // refresh the table view
    showValues = true;
    loadDataModel();
}

// add a non-key attribute to the model if it does not already exist
function addNonKeyAttribute(type, attribute) {
    // add this attribute to the schema
    if (type && !schema.models[type][attribute]) {
        schema.models[type][attribute] = { type: 'String' }
    }
    // search the attribute list for this name
    var found = false;
    $.each(model.DataModel[modelIndex].NonKeyAttributes, function (idx, obj) {
        if (attribute.AttributeName == obj.AttributeName)
            found = true;
    });

    // if the attribute is not on the list then add it
    if (!found)
        model.DataModel[modelIndex].NonKeyAttributes.push({AttributeName: attribute, AttributeType: 'S'});
}

function findModel(id) {
    let type = findType(id)
    return schema.models.find(m => m.type == type)
}

function findType(id) {
    return cellId[id].type
}

// add an attribute to an Item. Note: this does not change the schema until an attibute name is assigned.
function addAttribute(id) {
    // find the backing object for this Item
    let obj = cellId[id].obj;
    
    // if the object has a "type" attribute that is unset then throw an alert and bail
    if (obj.hasOwnProperty("type") && obj.type.S == "~new~") {
        alert("You need to assign this object a type before adding new attributes.");

        // set the selectId to focus on the type attribute for this item when the table renders and bail out
        selectId.attr = "type";
    } else {
        // snapshot the model state and add a new attribute to the Item
        makeChange();
        obj["~new~"] = {"S":"~new~"};
    }

    // refresh the table view
    showValues = true;
    loadDataModel();
}

// assign a name to a new attribute
function nameAttribute(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // process the name change if this is an enter or null key
    if(keycode == '13' || keycode == '0') {
        // cancel keypress
        event.preventDefault();

        // find the attribute name
        var attribute = $(jq(id)).text(),
            type = {};

        // find the backing object for the Item
        let obj = cellId[id].obj;
        
        // if the property already exists then bail out
        if (obj.hasOwnProperty(attribute)) {
            return false;
        }
        // add the non-key attribute defintion
        addNonKeyAttribute(obj.type.S, attribute)
        
        // swap the value into the new attribute and delete the placeholder
        obj[attribute] = obj["~new~"];
        delete obj["~new~"];
        selectId = {
            PK: getValue(obj[table.partition_key]),
            SK: getValue(obj[table.sort_key]),
            attr: attribute
        };

        // add this attribute to other objects of this type
        if (obj.hasOwnProperty("type")) {
            $.each(json_data, function (idx, obj1) {
                if (obj.type.S == obj1.type.S)
                    obj1[attribute] = { "S" : "~new~"};
            });
        }

        // if the object had a type then add attribute to other objects of this type
        if (Object.keys(type).length > 0) {
            $.each(json_data, function (idx, obj) {
                if (obj["type"]["S"] == type.S)
                    obj[attribute] = { "S" : "~new~"};
            });
        }

        // refresh the table view
        loadDataModel();
    }
}

function importOneTableSchema(text) {
    schema = JSON.parse(text);
    if (!schema.models) {
        alert('Invalid OneTable schema. Missing top level models.')
        return
    }
    model = {};

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

        if (!model.hasOwnProperty("DataModel")) {
            modelIndex = 0;
            model.DataModel = [];
            def.GlobalSecondaryIndexes = [];
            def.TableName = indexName;
            tableChanges[indexName] = [];
            model.DataModel.push(def);
            table = {
                name: indexName,
                partition_key: def.KeyAttributes.PartitionKey.AttributeName,
                sort_key: def.KeyAttributes.SortKey.AttributeName,
                sortkey_datatype: def.KeyAttributes.SortKey.AttributeType
            };
            json_data = def.TableData;
        } else {
            def.IndexName = indexName;
            def.Projection = { ProjectionType: "ALL" };
            model.DataModel[modelIndex].GlobalSecondaryIndexes.push(def);
        }
    }
    modelIndex = 0;
    datamodel = model.DataModel[modelIndex];

    for (let [modelName, model] of Object.entries(schema.models)) {
        for (let [name, field] of Object.entries(model)) {
            if (field.value) {
                if (!schema.indexes[name]) {
                    let item = datamodel.NonKeyAttributes.find(a => a.AttributeName == name);
                    if (!item) {
                        item = {
                            AttributeName: name,
                            AttributeType: typeToDynamo(field.type),
                        }
                        datamodel.NonKeyAttributes.push(item);
                    }
                }
            }
        }
        //  Define type attribute (OneTable does this automatically)
        if (!schema.models[modelName]) {
            schema.models[modelName].type = { type: 'String', required: true, value: modelName };
        }
    }

    if (schema.data) {
        let item = {};
        for (let row of schema.data) {
            item = {};
            for (let [key, value] of Object.entries(row)) {
                item[key] = { 'S': value };
            }
            json_data.push(item);
        }
        expandValueTemplates();
        buildContextMenus();
        showTable();
    } else {
        addItem("~new~");
    }
}

function exportOneTableSchema() {
    let output = Object.assign({}, schema, {data: []})
    let data = output.data
    for (let row of json_data) {
        let item = {}
        for (let [key, value] of Object.entries(row)) {
            item[key] = Object.values(value)[0]
        }
        data.push(item)
    }
    save(JSON.stringify(output, null, 4), "schema.json", "json");
}

function setAttributeType(type, item, attr) {

    switch (type) {
        case "Number":
            if ( isNaN(getValue(item[attr])) ) 
                item[name] = {
                    "N": "0"
                }
            else
                item[name] = {
                    "N": getValue(item[attr])
                }
            break;
            
        case "Boolean":
            item[attr] = {
                "BOOL": getValue(item[attr]) == "false" || getValue(item[attr]) == "FALSE" || getValue(item[attr]) == "0" ? false : !!getValue(item[attr])
            };
            break;
            
        default:
            let newAttr = {};
            newAttr[types[type]] = getValue(item[attr]);
            item[attr] = newAttr;
            break;
    }
}

// set an attribute value
function setValue(id) {
    // get the new value for the attribute and split out the key values and attribute name
    var newVal = $(jq(id)).text(),
        PK = cellId[id].PK,
        SK = cellId[id].SK,
        name = cellId[id].attr,
        change = true,
        obj = cellId[id].obj;

    // if the value is uninitialized
    if (newVal == "~new~")
        return;

    // if this is a sort key change make sure it is a unique value
    var found = false;
    if ( name == table.sort_key ) {
        $.each(json_data, function(idx, obj) {
            if ( getValue(obj[table.partition_key]) == PK && getValue(obj[table.sort_key]) == newVal) {
                found = true;
                $(jq(id)).html(buildButtonHtml(id));
            }
        });
    }

    if (!found) {            
        let entity = schema.models[getValue(obj.type)]
        let field = {
            type: "String"
        }
        
        if (entity)
            field = entity[name];
        
        if (!showValues) {
            //  Editing meta view, so update the type or value template where appropriate
            if (name == 'type') {
                if (getValue(obj.type) == newVal)
                    return;
                
                showValues = true;
                setValue(id);
                showValues = false;
            } else {
                
                if (newVal == field.type || newVal == field.value)
                    return;
                
                if (Object.keys(types).includes(newVal)) {
                    $.each(json_data, function(idx, item) {
                        setAttributeType(newVal, item, name);
                    });
                    
                    field.type = newVal    
                } else {
                    field.value = newVal
                }
            }
            
            loadDataModel();
        } else {
            // if the value has changed then process it
            if (getValue(obj[name]) != newVal) {
                if ( name == sort_key) {
                    if ( !mouseDown  )
                        selectId = {
                            PK: PK,
                            SK: newVal,
                            attr: "type"
                        };
                }
                else {
                    selectId = cellId["cell" + (parseInt(id.substr(4)) + 1)];
                }

                // snapshot model state and apply the change
                makeChange();
                assignValue(obj[name], newVal);
                setAttributeType(field.type, obj, name);

                // if this is a type change then adjust the attributes accordingly
                if (name == "type") {
                    //remove existing attributes
                    $.each(Object.keys(obj), function (idx, key) {
                        if (key != table.partition_key && key != table.sort_key && key != "type")
                            delete obj[key];
                    });

                    // add attributes for new type with default value
                    if (schema.models.hasOwnProperty(newVal)) {
                        $.each(schema.models[newVal], function(prop, field) {
                            let props = ['type', table.partition_key, table.sort_key];
                            if (!props.includes(prop)) {
                                obj[prop] = {'S': field.default || '~new~'}
                            }
                        });
                    } else {
                        addEntityToSchema(obj);
                    }
                }

                // refresh the table view
                loadDataModel();
            }
        }
    }
}

// update an Item attribute with a new value
function updateItem(id) {
    var keycode = (event.keyCode ? event.keyCode : event.which);

    // if this is an enter or null key code then process new value
    if(keycode == '13' || keycode == '0') {
        event.preventDefault();

        // set keypress event flag
        fired = true;
        mouseDown = false;
        setValue(id);
    }
}

// remove all items from a partition
function deletePartition(id) {
    if (getValue(cellId[id].obj[table.partition_key]) == "~new~") {
        alert("New partitions cannot be deleted.");
        return;
    }

    alertData = {
        caller: "deletePartition",
        data: getValue(cellId[id].obj[table.partition_key])
    };

    $("#alertTitle h1").text("Delete Partition");
    $("#alertText").text(`All items in the '${alertData.data}' partition will be deleted, continue?`);

    $("#alertModal").show();
}

// remove an item from the model
function deleteItem(id) {
    alertData = {
        caller: "deleteItem",
        data: id
    };

    var PK = getValue(cellId[id].obj[table.partition_key]),
        SK = getValue(cellId[id].obj[table.sort_key]),
        message = "";

    if (PK == "~new~")
        message = "Items cannot be deleted from new partitions.";

    if (SK == "~new~")
        message = "New Items cannot be deleted.";

    if ( message != "") {
        loadDataModel();
        return;
    }

    $("#alertTitle h1").text("Delete Item");
    $("#alertText").text(`Item key '${PK}, ${SK}' will be deleted, continue?`);

    $("#alertModal").show();
}

// refresh the table view
function showTable() {
    // reset the table display
    $("#primary_table").html('');

    // build the table html
    makeTable(table);

    // build the HTML and add a tab for each index
    $.each(datamodel.GlobalSecondaryIndexes, function(index, gsi) {
        makeIndex(gsi);
    });

    $("#aboutDiv").hide();
    $("#tabDiv").show();
    $("#tabs").show();
    $("#fileDiv").hide();
    $("#tableDivButton").className += " active";

    $(".tabable").mousedown(function(eventData) {
        var id = $(this).attr("id");
        selectId = cellId[id];
        mouseDown = true;
        if (eventData.which === 3) {
            $(jq(id)).selectText(parseInt(id.substr(4)));
        }
    });
}

// show the query modal
function showQuery(caller) {
    initQuery();

    $("#selectQuery").show();
    $("#queryDiv").show();
}

// reset the query modal
function initQuery() {
    if (!model.DataModel) return;
    var name = model.DataModel[modelIndex].TableName;

    $(".remove").remove();
    $("#selectQuery").val($("#selectQuery option:first").val());
    $("#selectTableOrIndex").val($("#selectTableOrIndex option:first").val());
    $("#selectOp").val($("#selectOp option:first").val());
    $("#filterOp").val($("#filterOp option:first").val());
    $("#selectAttrType").val($("#selectAttrType option:first").val());

    $("#txtQueryName").val("");
    $("#txtPKval").val("");
    $("#txtSKval").val("");
    $("#txtSKendVal").val("");
    $("#txtFilterAttr").val("");
    $("#txtFilterValue").val("");
    $("#txtFilterEndValue").val("");
    $("#btnAddFilter").hide();
    $("#btnAddSort").hide();
    $("#queryConditions").css("display", "none");
    $("#skDiv").css("display", "none");
    $("#filterArea").css("display", "none");
    $("#queryDiv").hide();

    match_data = [];
    loadDataModel();

    $("#selectTableOrIndex").append(`<option value="${name}" class="remove">${name}</option>`);
    $.each(model.DataModel[modelIndex].GlobalSecondaryIndexes, function (idx, gsi) {
        $("#selectTableOrIndex").append(`<option value="${gsi.IndexName}" class="remove">${gsi.IndexName}</option>`)
    });

    $.each(datamodel.SavedQuery, function (name, query) {
        $("#selectQuery").append(`<option value="${name}" class="remove">${name}</option>`)
    });
    $("#selectQuery").append(`<option value="new" class="remove">Define new query...</option>`);
}

// show second value textbox if this is a between
function setOp(type) {
    if (type == 'sort') {
        if ($("#selectOp").val() == 'between') {
            $("#lblSKendVal").css("visibility", "visible");
            $("#txtSKendVal").css("visibility", "visible");
        } else {
            $("#lblSKendVal").css("visibility", "hidden");
            $("#txtSKendVal").css("visibility", "hidden");
        }
    } else {
        $.each($(".filterOp"), function (idx, select) {
            if (select.value == 'between') {
                $("#lblFilterEndVal" + select.id.substring(8)).css("visibility", "visible");
                $("#txtFilterEndVal" + select.id.substring(8)).css("visibility", "visible");
            } else {
                $("#lblFilterEndVal" + select.id.substring(8)).css("visibility", "hidden");
                $("#txtFilterEndVal" + select.id.substring(8)).css("visibility", "hidden");
            }
        });
    }
}

// make the sort condition area visible
function addSortCondition() {
    $("#btnAddSort").hide();
    $("#skDiv").show();
}

// add a filter to the query modal
function addFilter() {
    if ($("#filterArea").is(":hidden")) {
        numFilters = 0;
        $("#filterArea").show();
    }
    else {
        var clone = $("#filterDiv").clone(true);
        clone.attr("id", "filterDiv" + numFilters);
        clone.attr("class", "filterDiv remove");
        $("#selectFilter").append(clone);
        $("#filterDiv" + numFilters).find(">:first-child").show();

        $.each($("#filterDiv" + numFilters).children(), function (idx, child) {
            child.id = child.id + numFilters;
        });

        $("#selectFilter" + numFilters).val($("#selectFilter" + numFilters + " option:first").val());
        $("#selectAttrType" + numFilters).val($("#selectAttrType" + numFilters + " option:first").val());
        $("#txtFilterVal" + numFilters).val("");
        $("#txtFilterEndVal" + numFilters).val("");
        $("#txtFilterAttr" + numFilters).val("");

        $("#lblFilterEndVal" + numFilters).css("visibility", "hidden");
        $("#txtFilterEndVal" + numFilters).css("visibility", "hidden");

        numFilters++;
    }

    $("#selectFilter").scrollTop($("#selectFilter")[0].scrollHeight);
}

// create a query object
function buildQuery() {
    var query = {},
        test = {};

    query.view = $("#selectTableOrIndex").val();
    query.PK = $("#txtPKval").val();
    if ($("#selectOp").val() != null) {
        query.SK = {};
        query.SK.condition = $("#selectOp").val();
        query.SK.values = [];
        query.SK.values.push($("#txtSKval").val());

        if ( query.SK.condition == "between" )
            query.SK.values.push($("#txtSKendVal").val());
    }

    query.filter = [];

    $.each($(".filterDiv"), function (count, div) {
        if (!$("#filterArea").is(":visible"))
            return;

        var divId = count > 0 ? count - 1 : "";

        if (divId >= 0)
            test.operator = $("#selectAndOr" + divId).val();

        test.attribute = $("#txtFilterAttr" + divId).val();
        test.type = $("#selectAttrType" + divId).val();
        test.condition = $("#filterOp" + divId).val();
        test.values = [];
        test.values.push($("#txtFilterVal" + divId).val());

        if (test.condition == "between")
            test.values.push($("#txtFilterEndVal" + divId).val());

        query.filter.push(test);
        test = {};
    });

    if (!datamodel.hasOwnProperty("SavedQuery"))
        datamodel.SavedQuery = {};

    if ($("#txtQueryName").val() != "")
        datamodel.SavedQuery[$("#txtQueryName").val()] = query;

    runQuery($("#txtQueryName").val());
}

// load a query object into the query modal
function setConditions() {
    var query = $("#selectQuery").val();

    $("#selectQuery").css("display", "none");

    $("#queryConditions").show();
    $("#btnAddFilter").show();
    $("#btnAddSort").show();

    if (query == "new") {
        $("#lblQueryName").show();
        $("#txtQueryName").show();
        return;
    }

    $("#txtQueryName").val(query);
    query = datamodel.SavedQuery[query];
    $("#selectTableOrIndex").val(query.view);
    $("#txtPKval").val(query.PK);

    if (query.hasOwnProperty("SK")) {
        $("#skDiv").show();
        $("#btnAddSort").hide();
        $("#selectOp").val(query.SK.condition);
        $("#txtSKval").val(query.SK.values[0]);

        $("#txtSKendVal").css("display", "none");

        if (query.SK.condition == "between") {
            $("#txtSKendVal").val(query.SK.values[1]);
            $("#txtSKendVal").show();
        }
    }

    $.each(query.filter, function (idx, test) {
        var divId = idx > 0 ? idx - 1 : "";
        addFilter();

        if (divId != "")
            $("#selectAndOr" + divId).val(test.operator);

        $("#txtFilterAttr" + divId).val(test.attribute);
        $("#selectAttrType" + divId).val(test.type);
        $("#filterOp" + divId).val(test.condition);
        $("#txtFilterVal" + divId).val(test.values[0]);

        if (test.condition == "between")
            $("#txtFilterEndVal" + divId).val(test.values[1]);
    });
}

// execute the query and display the result
function runQuery(name) {
    var query = datamodel.SavedQuery[name],
        PK = "",
        SK = "";

    match_data = [];
    json_data = datamodel.TableData;

    if (query.view == datamodel.TableName) {
        PK = table.partition_key;
        SK = table.sort_key
    } else {
        $.each(datamodel.GlobalSecondaryIndexes, function (idx, gsi) {
            if (gsi.IndexName == query.view) {
                PK = gsi.KeyAttributes.PartitionKey.AttributeName;
                SK = gsi.KeyAttributes.SortKey.AttributeName;
                return false;
            }
        });
    }

    $.each(json_data, function (idx, item) {
        if (item.hasOwnProperty(PK) && getValue(item[PK]) == query.PK) {
            var test = {},
                pass = true;

            // test the sort condition if there is one
            if (query.hasOwnProperty("SK")) {
                test.type = table.sortkey_datatype;
                test.attribute = table.sort_key;
                test.values = query.SK.values;
                test.condition = query.SK.condition;
                pass = evaluate(item, test);
            }

            if (pass) {
                // test each filter condition
                $.each(query.filter, function (idx, filter) {
                    if (filter.operator == "OR")
                        if (pass)
                            // if pass is still true on an OR operator the test is done
                            return false;
                        else
                            // if pass is false on OR operator then set it to true and continue testing
                            pass = true;

                    if (pass)
                        pass = evaluate(item, filter);
                });
            }

            // add the item if it passed all condition checks
            if (pass)
                match_data.push(item);
        }
    });

    $("#queryDiv").hide();
    $("#runQueryDiv").hide();
    $(".remove").remove();
    $("#filterArea").hide();
    loadDataModel();
}

// evaluate whether an item passes a test or not
function evaluate(item, test) {
    var value = "",
        comparevalues = [];

    switch (test.type) {
        case "Boolean":
            value = getValue(item[test.attribute]) == true;
            $.each(test.values, function (idx, value) {
                test.values[idx].replace(value == "true");
            });
            break;

        case "N":
        case "Number":
            value = parseFloat(getValue(item[test.attribute]));
            $.each(test.values, function (idx, value) {
                test.values[idx].replace(parseFloat(value));
            });
            break;

        case "S":
        case "String":
            value = getValue(item[test.attribute]);
            break;
    }

    var testVal = false;
    switch (test.condition) {
        case ">":
            if (value > test.values[0])
                testVal = true;
            break;

        case ">=":
            if (value >= test.values[0])
                testVal = true;
            break;

        case "<":
            if (value < test.values[0])
                testVal = true;
            break;

        case "<=":
            if (value <= test.values[0])
                testVal = true;
            break;

        case "=":
            if (value == test.values[0])
                testVal = true;
            break;

        case "begins":
            if (value.startsWith(test.values[0]))
                testVal = true;
            break;

        case "between":
            var startVal = test.values[0],
                endVal = test.values[1];

            if (startVal > endVal) {
                startVal = endVal;
                endVal = test.values[0];
            }

            if (value > test.values[0] && value < test.values[1])
                testVal = true;
            break;

        case "contains":
            if (value.indexOf(test.values[0]) >= 0)
                testVal = true;
            break;

        case "in":
            $.each(test.values, function (idx, val) {
                if (value == val) {
                    testVal = true;
                    return false;
                }
            });
            break;
    }

    return testVal;
}

// generate the HTML for the table
function makeTable(table) {
    // set the working configuration for the HTML generator
    partition_key = table.partition_key;
    sort_key = table.sort_key;
    sortkey_datatype = table.sortkey_datatype;

    // group and sort the object list
    sortObjectList();

    // generate HTML for the table
    var html = '<thead tabindex="-1"><tr tabindex="-1"><th tabindex="-1" colspan="2" style="text-align: center; width: 40%;"><div>Primary Key<div tabindex="-1" class="bottomright noselect"><input tabindex="-1" onclick="addItemClick(\'\')" type="image" src="./img/add.png" title="Add Partition" style="cursor:pointer; background:transparent; float:right; border:0; outline:none;" border = 0 width="20" height="20"></div></div></th>'; 
    
    
    html += generate(true);

    // add generated HTML to the primary_table element and set titles and styles
    $("#primary_table").html(html);
    $(".basetable_title").text(table.name);
    $(".tablediv").css('display', '-webkit-box');
    $(".classprimaryKey").css('width', '400');


    // focus the first cell or selected object
    var focusCell = selectId == null || Object.keys(selectId).length == 0 ? boundary.first : selectId;
    $.each(cellId, function(prop, val) {
        if (val.PK == focusCell.PK && val.SK == focusCell.SK && val.attr == focusCell.attr) {
            $(jq(prop)).trigger("focus");
            return false;
        }
    });

    // remove all index tab content
    $.each($(".tabcontent"), function (idx, obj) {
        if (obj.id != "tablediv") {
            $(jq(obj.id)).remove();
        }
    });

    // remove index tab buttons
    $.each($(".tablinks"), function (idx, obj) {
        if (obj.id != "tableDivButton")
            $(jq(obj.id)).remove();
    });
}

// generate the HTML and construct the tab element for an index
function makeIndex(index) {
    // set the working configuration for the HTML generator
    partition_key = index.KeyAttributes.PartitionKey.AttributeName;
    sort_key = index.KeyAttributes.SortKey.AttributeName;
    sortkey_datatype = index.KeyAttributes.SortKey.AttributeType;

    // group and sort the object list
    sortObjectList();

    // set base element name
    var element = "#" + index.IndexName;

    // if this tab already exists then remove it
    if ($(element + "_tab").length)
        $(element + "_tab").remove();

    // generate the HTML for this index
    var html = '<div tabindex="-1" id="' + index.IndexName + '_tab" class="tabcontent">';
    html += '<table tabindex="-1"><thead tabindex="-1"><tr tabindex="-1"><th tabindex="-1" colspan=2>Primary Key</th>';
    html += generate(false);
    html += "</div>";

    // add the html to the tab control
    $("#tabs").append(html);

    // if the button for this index tab exists then remove it
    if ($(element + "_btn").length)
        $(element + "_btn").remove();

    // build the button for the HTML and add it to the tab control
    html = '<button tabindex="-1" id="'+ index.IndexName + '_btn" class="tablinks" style="display:inline" onclick="showTab(event, \'' + index.IndexName + '_tab\')"><a tabindex="-1" href="#"><h2 class="gsi_title">' + index.IndexName + '</h2></a></button>'
    $("#tabDiv").append(html);
}

// build the html for a table or index view
function generate(isTable) {
    // container for sort row html
    var sort_row = '',
        maxLength = 0;
    // column span for partition key column
    var partition_colspan = 1;

    // Add sort key to table header if it exists
    if (sort_key && sort_key != '') {
        sort_row = '<th tabindex="-1" class="key_cell">' + sort_key + '</th>';
    } else {
        sort_row = '';
        partition_colspan = 2;
    }

    // find the max length of all rows to calculate cell width
    $.each(json_data, function(index, object) {
        // Record max width for the table
        if (maxLength < Object.keys(object).length)
            maxLength = Object.keys(object).length;
    });

    // set the tab index
    tabIndex = 1;
    // Build a row for each Item in the TableData array
    var row_html = '';

    $.each(sortObjectList(), function(index, tr_arr) {
        var tbody_html = '',
            PK = '',
            SK = '',
            dispVal = '',
            id = '';

        $.each(tr_arr, function(count, obj) {
            // Check if partition key exists on this item and skip it if not
            if (!obj.hasOwnProperty(partition_key)) {
                return true;
            }

            //Check for sort key and skip item if does not exist
            if (sort_key && sort_key != '') {
                if (!obj.hasOwnProperty(sort_key)) {
                    return true;
                }
            }

            tbody_html = '<tr>';

            let type = (obj && obj.type) ? obj.type.S : null;
            let entity = type ? schema.models[type] : null;

            // If its the first cell insert the partition key value and span all the rows for the objects in this partition otherwise skip
            if (count == 0) {
                if (!showValues && entity) {
                    if (entity[partition_key]) {
                        PK = dispVal = entity[partition_key].value || entity[partition_key].type;
                    } else {
                        PK = getValue(obj[partition_key]);
                    }
                } else {
                    PK = getValue(obj[partition_key]);
                    // set the default display value
                    dispVal = PK;
                }

                // if this is the table then its editable
                if (isTable) {
                    id = "cell" + tabIndex;
                    
                    // if this is a new partition then set the focus on it when the table renders
                    if (PK == "~new~")
                        selectId = {
                            PK: "~new~",
                            attr: partition_key
                        };

                    if (!boundary.first.hasOwnProperty("PK"))
                        boundary.first = {
                            PK: PK,
                            attr: partition_key
                        };

                    cellId[id] = {
                        PK: PK,
                        attr: partition_key,
                        type: type,
                        obj: obj
                    }

                    // wrap the partition key value in a contenteditable div using the cellId value as element id and hook the relevant handlers
                    dispVal = buildKeyCell(id);
                }

                // add the cell to the row
                tbody_html += '<td class="td_key" rowspan="' + tr_arr.length * 2 + '" colspan="' + partition_colspan + '">' + dispVal + '</td>';
            }

            // Insert sort key value for the Item
            if (sort_key && sort_key != '') {
                id = "cell" + tabIndex;
                if (!showValues && entity) {
                    if (entity[sort_key]) {
                        SK = dispVal = entity[sort_key].value || entity[sort_key].type;
                    } else {
                        SK = getValue(obj[sort_key]);
                    }
                } else {
                    SK = getValue(obj[sort_key]);
                    // set the default display value
                    dispVal = SK.startsWith("~new~") ? "~new~" : SK;
                }

                // if this is the table then its editable
                if (isTable) {
                    cellId[id] = {
                        PK: PK,
                        SK: SK,
                        attr: sort_key,
                        type: type,
                        obj: obj
                    }

                    // wrap the partition key value in a contenteditable div using the PK value as element id and hook the relevant handlers
                    dispVal = buildKeyCell(id);
                }

                // add the cell to the row
                tbody_html += '<td class="td_key" rowspan="2">' + dispVal + '</td>';
            }

            // build header and value rows for the Item
            var header = '';
            var row = '';
            $.each(obj, function(name, value) {
                id = "cell" + tabIndex;
                if (name == partition_key || name == sort_key)
                    return true;

                // start building the header cell
                header += '<td class="grey-header">'
                var tail = "";

                // if this is a new attribute then it needs to be editable
                if (isTable && name == "~new~") {
                    cellId[id] = {
                        PK: getValue(obj[partition_key]),
                        SK: getValue(obj[sort_key]),
                        attr: "new",
                        type: type,
                        obj: obj
                    }

                    // store attribute name cell id in the focus pointer
                    selectId = cellId[id];

                    // wrap the attribute name in a contenteditable div and hook the relevant event handlers
                    header += '<div id="' + id + '" class="tabable tab' + tabIndex + '" tabindex="0" onfocus="$(\'' + jq(jq(id)) + '\').selectText(' + tabIndex++ + ')" onfocusout="focusOut(\'' + id + '\')" onkeypress="nameAttribute(\'' + id + '\')" contenteditable>';
                    tail = "</div>";
                }

                // finish the header cell
                header += name + tail + '</td>';

                // if this is not a map attribute then add the value cell
                if (Object.keys(value)[0] != 'M') {
                    if (!showValues && entity && entity[name]) {
                        if (name == 'type') {
                            dispVal = getValue(value);
                        } else {
                            dispVal = entity[name].value || entity[name].type || getValue(value);
                        }
                    } else {
                        dispVal = getValue(value);
                        if (dispVal == '~new~' && entity && entity[name] && entity[name].default) {
                            displVal = entity[name].default
                        }
                    }
                    if (isTable) {
                        id = "cell" + tabIndex;
                        cellId[id] = {
                            PK: PK,
                            SK: SK,
                            attr: name,
                            type: type,
                            obj: obj
                        }

                        boundary.last = cellId[id];

                        dispVal = '<div id="' + id + '" class="tabable cell-context-menu tab' + tabIndex + '" tabindex="0" onfocus="$(\'' + jq(jq(id)) + '\').selectText(' + tabIndex++ + ')" onfocusout="focusOut(\'' + id + '\')" onkeypress="updateItem(\'' + id + '\')" contenteditable>' + dispVal + '</div>';
                    }
                    row += '<td>' + dispVal + '</td>';
                } else {
                    // this is a map attribute so push the value onto the vals array
                    vals.push(value);
                    // link the map in the value cell
                    // TODO - implement map editor
                    row += '<td style="text-align: center; cursor: alias;" class="attr_key" rel=' + (vals.length - 1) + '>...</td>';
                }
            });

            // finish the header/value rows and add them to the Item row
            header += '</tr>';
            row += '</tr>';
            tbody_html += header;
            tbody_html += row;

            //Add the Item row to the Item row collection HTML
            row_html += tbody_html;
        });
    });

    // add the undo button if this is the table view
    var backDiv = "";
    if (isTable) {
        backDiv = '<input tabindex="-1" onclick="undoChange(\'\')" type="image" src="./img/back.png" title="Undo Change" style="cursor:pointer; background:transparent; float:right; border:0; outline:none;" border = 0 width="20" height="20">';

        if (showValues)
            backDiv += '<i class="fas fa-wrench" title="Show Schema" style="cursor:pointer; background:transparent; float:right; border:0; padding: 2px; outline:none;" onclick="toggleSchema()"></i>';
        else
            backDiv += '<i class="fas fa-sliders-h" title="Show Values" style="cursor:pointer; background:transparent; float:right; border:0; padding: 2px; outline:none;" onclick="toggleSchema()"></i>';
    }

    // build the table HTML
    var html = '<th id="attrHead" rowspan="2" colspan="' + maxLength + '">Attributes' + backDiv + '</th></tr>';
    html += '<tr><th class="key_cell" colspan="' + partition_colspan + '">' + partition_key + '</th>';
    html += sort_row + '</tr></thead><tbody>';
    html += row_html;
    html += "</tbody>";

    return html;
}

// create the HTML for the controls in a key cell
function buildKeyCell(id) {
    var keypress = '"updatePK(\'' + id + '\')"',
        css = "PK-context-menu tab";

    if (cellId[id].attr == sort_key) {
        keypress = '"updateItem(\'' + id + '\')"';
        css = "SK-context-menu tab";
    }

    retVal = '<div id="' + id + '" class="tabable ' + css + ' tab' + tabIndex + '" tabindex="0" onfocus="$(\'' + jq(jq(id)) + '\').selectText(' + tabIndex++ + ')" onfocusout="focusOut(\'' + id + '\')" onfocusout="focusOut(\'' + id + '\')" onkeypress=' + keypress + ' contenteditable>' + buildButtonHtml(id) + '</div>';

    return retVal;
}

// construct the button HTML for a key cell
function buildButtonHtml(id) {
    var add = '"addItemClick(\'' + id + '\')"',
        remove = '"deletePartition(\'' + id + '\')"',
        text = cellId[id].PK,
        title1 = "Add Item",
        title2 = "Delete Partition";

    if (cellId[id].attr == table.sort_key) {
        add = '"addAttribute(\'' + id + '\')"';
        remove = '"deleteItem(\'' + id + '\')"';
        text = cellId[id].SK;
        title1 = "Add Attribute";
        title2 = "Delete Item";
    }

    text += '<div tabindex="-1" style="min-width: 35px;" class="bottomright noselect"><input tabindex="-1" onclick=' + add + ' type="image" src="./img/add.png" title="' + title1 + '" style="cursor:pointer; background:transparent; float:right; border:0; outline:none;" border = 0 width="15" height="15"><input tabindex="-1" onclick=' + remove + ' type="image" src="./img/delete.png" title="' + title2 + '" style="cursor:pointer; background:transparent; float:left; border:0; outline:none;" border = 0 width="15" height="15"></div>'
    
    return text;
}

// process value templates and generate values
function expandValueTemplates() {
    for (let item of datamodel.TableData) {
        for (let [name, value] of Object.entries(item)) {
            if (!item.type) continue
            let type = Object.values(item.type)[0]
            if (type == '~new~') continue

            let entity = schema.models[type]
            if (!entity) continue

            let field = entity[name]
            if (!field || !field.value) continue

            let text = field.value.replace(/\${(.*?)}/g, (pattern, varName) => {
                return item[varName] ? Object.values(item[varName])[0] : pattern
            })
            if (text != value) {
                item[name] = { 'S' : text }
            }
        }
    }
}

// choose a table to view from the model
function selectTable() {
    $("#selectTableDiv").show();
}

// parse the json file coming from the file loader
function onReaderLoad(event) {
    model = JSON.parse(event.target.result);

    // Clear out prior schema
    schema = Object.assign({}, DefaultSchema)

    findDataModels();
    loadDataModel();

    if (!model.hasOwnProperty("ModelSchema"))
        createSchema();
    else
        schema = model.ModelSchema;
        
}

// load the table data models into the view table dropdown
function findDataModels() {
    // initialize the dropdown
    $("#viewTable").empty();

    // add the default selected item
    $("#viewTable").append('<option disabled="disabled" selected="selected" value="none"> -- none -- </option>');

    // add an option for each table in the model
    $.each(model["DataModel"], function (idx, obj) {
        $("#viewTable").append(`<option value="${idx}">${obj.TableName}</option>`);
    });

    // add the create new table option
    $("#viewTable").append('<option value="-1"> Add new Table... </option>');
}

// add a new table to the model
function addTable() {
    $("#title h1").text("Create Table");
    $("#idx_lbl").text("Table name:");
    $("#tbSort").show();
    $("#dropSort").show();
    $("#projection_cfg").hide();
    $('#createTableOrIndex').modal('toggle');
}

/*
    Create a schema from the data in a workbench model
 */
function createSchema() {
    schema = Object.assign({}, DefaultSchema)
    let {data, indexes, models, queries} = schema
    let keys = datamodel.KeyAttributes

    /*
        Extract indexes
     */
    indexes.primary = {
        hash: keys.PartitionKey.AttributeName,
        sort: keys.SortKey.AttributeName,
    }
    for (let gsi of datamodel.GlobalSecondaryIndexes) {
        indexes[gsi.IndexName] = {
            hash: gsi.KeyAttributes.PartitionKey.AttributeName,
            sort: gsi.KeyAttributes.SortKey.AttributeName,
            projection: gsi.Projection.ProjectionType,
        }
    }

    /*
        Extract the schema entity models
     */
    for (let row of datamodel.TableData) {
        let entity
        if (row.type) {
            let type = Object.values(row.type)[0]
            entity = schema.models[type] = schema.models[type] || {}
        }
        /*
            Extract the attributes, map the types and save the data to the schema.data (future)
         */
        let drow = {}
        for (let [fieldName, col] of Object.entries(row)) {
            if (entity) {
                let field = entity[fieldName] = entity[fieldName] || {}
                field.type = dynamoToType(Object.keys(col)[0])
            }
            drow[fieldName] = Object.values(col)[0]
        }
        data.push(drow)
    }
    /*
        Apply the value templates
     */
    for (let [type, fn] of Object.entries(keys.PartitionKey.MapFunction || {})) {
        schema.models[type][keys.ParitionKey.AttributeName].value = fn
    }
    for (let [type, fn] of Object.entries(keys.SortKey.MapFunction || {})) {
        schema.models[type][keys.SortKey.AttributeName].value = fn
    }
    for (let att of datamodel.NonKeyAttributes) {
        for (let [type, fn] of Object.entries(att.MapFunction || {})) {
            schema.models[type][att.AttributeName].value = fn
        }
    }

    model.ModelSchema = schema;
}

// load the current data model for the viewer
function loadDataModel() {
    datamodel = model.DataModel[modelIndex];
    table = {
        name: datamodel.TableName,
        partition_key: datamodel.KeyAttributes.PartitionKey.AttributeName,
        sort_key: datamodel.KeyAttributes.SortKey.AttributeName,
        sortkey_datatype: datamodel.KeyAttributes.SortKey.AttributeType
    };

    if (!tableChanges.hasOwnProperty(datamodel.TableName))
        tableChanges[datamodel.TableName] = [];

    expandValueTemplates();
    json_data = datamodel.TableData;

    if (match_data.length > 0)
        json_data = match_data;

    if (!table.hasOwnProperty(("partition_key"))) {
        alert("Invalid Table Specification.");
        location.reload();
    }

    buildContextMenus();
    // render the table
    showTable();
}

// download the model in JSON format
function saveModel() {
    if (!model.hasOwnProperty("ModelName")) {
        var date = new Date();

        model.ModelName = "export";
        model.ModelMetadata  = {
            "Author": "unknown",
            "DateCreated": date.toDateString(),
            "DateLastModified": date.toDateString(),
            "Description": "",
            "AWSService": "Amazon DynamoDB",
            "Version": "2.0"
        };
    }
    
    delete model.ModelSchema.data;

    save(JSON.stringify(model), model.ModelName + ".json", "json");
}

// save the file
function save(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

// store a copy of the current datamodel in the history buffer
function makeChange() {
    //MOB - must save schema here somehow
    tableChanges[model.DataModel[modelIndex]["TableName"]].push(JSON.parse(JSON.stringify(datamodel)));

    // if the buffer is too long then trim the oldest change
    if (tableChanges[model.DataModel[modelIndex]["TableName"]].length > 50)
        tableChanges[model.DataModel[modelIndex]["TableName"]].shift();
}

// undo the last edit to the model
function undoChange() {
    // if there are changes then undo the last one
    if (tableChanges[model.DataModel[modelIndex]["TableName"]].length > 0) {
        // pop the last change into the current datamodel and reset the config
        model.DataModel[modelIndex] = tableChanges[model.DataModel[modelIndex]["TableName"]].pop();
    }

    selectId = boundary.first;
    loadDataModel();
}

// Build a map of unique attribute values by attribute name and identify typed objects
function findValues() {
    $.each(json_data, function(index, obj) {
        $.each(obj, function(name, propVal) {
            if (!unique_values.hasOwnProperty(name)) {
                unique_values[name] = [];
            }

            var value = propVal[Object.keys(propVal)[0]];
            if (!unique_values[name].includes(value)) {
                unique_values[name].push(value);
            }
        });
        addEntityToSchema(obj);
    });
}

// scan object templates and add new types
function addEntityToSchema(obj) {
    var type = getValue(obj.type);
    if (type != '~new~' && !schema.models[type]) {
        // add the type template object
        schema.models[type] = {type: { type: 'String', required: true, value: type }};

        // add all the attributes from this object to the template
        $.each(Object.keys(obj), function (idx, key) {
            schema.models[type][key] = { type: 'String' };
        });
    }
}

// move a partition up or down in the display order
function movePartition(moveUp) {
    var index = -1;

    $.each(unique_values[table.partition_key], function (idx, unique) {
        if (unique == selectId.PK) {
            index = idx;
            return false;
        }
    });

    if (index >= 0) {
        var temp = unique_values[table.partition_key][index],
            swap = index + 1;

        if (moveUp)
            swap = index - 1;

        unique_values[table.partition_key][index] = unique_values[table.partition_key][swap];
        unique_values[table.partition_key][swap] = temp;
    }

    var newKeySort = [];
    $.each(unique_values[table.partition_key], function(idx, unique) {
        $.each(json_data, function(idx, obj) {
            if (getValue(obj[table.partition_key]) == unique)
                newKeySort.push(obj);
        });
    });

    makeChange();
    model.DataModel[modelIndex].TableData = newKeySort;
    loadDataModel();
}

// group objects by current partion key, sorted by current sort key
function sortObjectList() {
    var sortedItems = [];
    unique_values = {};

    findValues();

    // Group the JSON Objects by partition key
    $.each(unique_values[partition_key], function(index, unique) {
        var newArr = [];
        $.each(json_data, function(index, obj){
            if ( obj.hasOwnProperty(partition_key) && unique === getValue(obj[partition_key]) ) {
                newArr.push(obj);
            }
        });

        // If there is a sort key then sort all the JSON objects by type
        if (sort_key && sort_key != '') {
            if (sortkey_datatype == 'N') {
                newArr.sort((a,b) => (parseInt(a[sort_key].N) > parseInt(b[sort_key].N) ? 1 : -1));
            } else {
                try {
                    newArr.sort((a,b) => (a[sort_key].S > b[sort_key].S ? 1 : -1));
                } catch(e) {
                    //no sort key on these items
                }
            }
        }
        sortedItems.push(newArr);
    });

    return sortedItems;
}

// select the text inside the focused table element
jQuery.fn.selectText = function(idx){
    idx++;

    if ( cellId.hasOwnProperty("cell" + idx) )
        selectId = cellId["cell" + idx];
    else
        selectId = boundary.first;

    mouseDown = false;
    var doc = document;
    var element = this[0];
    console.log(this, element);
    if (doc.body.createTextRange) {
        var range = document.body.createTextRange();
        range.moveToElementText(element);
        range.select();
    } else if (window.getSelection) {
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(element);
        range.setEnd(element, 1);
        selection.removeAllRanges();
        selection.addRange(range);
    }
};

// create a fake UUID
function fakeUUID() {
   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
   });
}

// onclick event for Question dialog
function postResponse() {
    $("#alertModal").hide();

    var new_data = [];

    switch (alertData.caller) {
        case "createModel":
            if (response == '0')
                $("#createModelDiv").show();
            break;

        case "deletePartition":
            $.each(json_data, function (idx, obj) {
                if (getValue(obj[datamodel.KeyAttributes.PartitionKey.AttributeName]) != alertData.data)
                    new_data.push(obj);
            });
            break;

        case "cutItem":
        case "copyItem":
        case "deleteItem":
            var PK = getValue(cellId[alertData.data].obj[table.partition_key]),
                SK = getValue(cellId[alertData.data].obj[table.sort_key]);

            $.each(json_data, function (idx, obj) {
                if (getValue(obj[table.partition_key]) == PK && getValue(obj[table.sort_key]) == SK)
                    pasteItem = obj;
                else
                    new_data.push(obj);
            });
            break;

        default:
            alertData = "";
            break;
    }

    if (alertData.caller.startsWith("delete") || alertData.caller.startsWith("cut")) {
        showValues = true;
        makeChange();
        model.DataModel[modelIndex].TableData = new_data;
        loadDataModel();
        pasteItem = alertData.caller == "cutItem" ? pasteItem : {};
    }
}

// delete an attribute from an entity type
function removeAttr(applyAll) {
    var PK = selectId.PK,
        SK = selectId.SK,
        attr = selectId.attr,
        type = "";

    makeChange();
    $.each(json_data, function(idx, obj) {
        if (getValue(obj[table.partition_key]) == PK && getValue(obj[table.sort_key]) == SK) {
            delete obj[attr];
            type = getValue(obj.type);
            return false;
        }
    });

    if (applyAll) {
        $.each(json_data, function(idx, obj) {
            if (getValue(obj["type"]) == type)
            delete obj[attr];
        });
        if (schema.models[type]) {
            delete schema.models[type][attr];
        }
    }

    selectId.attr = table.sort_key;
    $("#removeAttributeModal").hide();
    loadDataModel();
}

// create a mapping for an entity attribute
function createMapping(type, name, value) {
    schema.models[type][name].value = value

    /*
    makeChange();
    switch (alertData.caller) {
        case table.partition_key:
            if (!datamodel.KeyAttributes.PartitionKey.hasOwnProperty("MapFunction"))
                datamodel.KeyAttributes.PartitionKey.MapFunction = {};

            datamodel.KeyAttributes.PartitionKey.MapFunction[alertData.data.type] = alertData.data.function;
            break;

        case table.sort_key:
            if (!datamodel.KeyAttributes.SortKey.hasOwnProperty("MapFunction"))
                datamodel.KeyAttributes.SortKey.MapFunction = {};

            datamodel.KeyAttributes.SortKey.MapFunction[alertData.data.type] = alertData.data.function;
            break;

        default:
            $.each(datamodel.NonKeyAttributes, function (idx, attr) {
                if (attr.AttributeName == alertData.caller) {
                    if (!attr.hasOwnProperty("MapFunction"))
                        attr.MapFunction = {};
                    attr.MapFunction[alertData.data.type] = alertData.data.function;
                }
            });
            break;
    }
    if (loadModel) {
        loadDataModel();
    }
    */
}

// get the backing Item for a table cell by cellId
function findItemByCellId(id) {
    var item = null;
    $.each(json_data, function(idx, obj) {
        if (getValue(obj[table.partition_key]) == cellId[id].PK && getValue(obj[table.sort_key]) == cellId[id].SK) {
            item = obj;
            return false;
        }
    });

    return item;
}

// update the entity type in the Mapping Function modal when it is changed
function setType() {
    if (datamodel.KeyAttributes.PartitionKey.hasOwnProperty("MapFunction"))
        if (datamodel.KeyAttributes.PartitionKey.MapFunction.hasOwnProperty($("#selectType").val()))
            $("#txtMapFunction").val(datamodel.KeyAttributes.PartitionKey.MapFunction[$("#selectType").val()]);

    $("#txtMapFunction").prop("disabled", false);
    $("#btnDefineMap").prop("disabled", false);
    alertData.data.type = $("#selectType").val();
    $("#lblEditMap").text("Enter Mapping Function for '" + alertData.data.type + "." + alertData.caller + "' attribute:");
    $("#txtMapFunction").focus();
}

// initialize and show the Value Template modal
function showValueTemplate(id) {
    alertData.data = {};
    alertData.caller = cellId[id].attr;

    $('#selectType')
    .find('option')
    .remove()
    .end()
    .append('<option selected="true" disabled="disabled">--Select a Type--</option>');

    if (alertData.caller == table.partition_key) {
        $("#txtMapFunction").prop("disabled", true);
        $("#btnDefineMap").prop("disabled", true);

        $.each(schema.models, function(prop, val) {
            $("#selectType").append($('<option></option>').val(prop).html(prop));
        });
        $("#selectTypeDiv").show();
    } else {
        var item = findItemByCellId(id);
        alertData.data.type = getValue(item.type);
        $("#lblEditMap").text("Enter Mapping Function for '" + alertData.data.type + "." + alertData.caller + "' attribute:");
    }

    switch (alertData.caller) {
        case table.sort_key:
            if (datamodel.KeyAttributes.SortKey.hasOwnProperty("MapFunction"))
                if (datamodel.KeyAttributes.SortKey.MapFunction.hasOwnProperty(alertData.data.type))
                    $("#txtMapFunction").val(datamodel.KeyAttributes.SortKey.MapFunction[alertData.data.type]);
            break;

        default:
            $.each(datamodel.NonKeyAttributes, function(idx, obj) {
                if (obj.AttributeName == alertData.caller && obj.hasOwnProperty("MapFunction"))
                    if (obj.MapFunction.hasOwnProperty(alertData.data.type))
                        $("#txtMapFunction").val(obj.MapFunction[alertData.data.type]);
            });
            break;
    }

    $("#defineValueTemplateDiv").show();
    $("#txtMapFunction").focus();
}

// construct the context menus for the table cells
function buildContextMenus() {
    $.contextMenu({
        selector: '.cell-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "date":
                    $(this).text(new Date().toISOString().split(".")[0]);
                    setValue($(this).attr("id"));
                    break;

                case "uuid":
                    $(this).text(fakeUUID());
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
                    return cellId[$(this).attr("id")].attr == "type";
                }
            },
            "function": {
                name: "Edit Value Template",
                icon: "fa-wrench",
                disabled: function(key, opt) {
                    return cellId[$(this).attr("id")].attr == "type";
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

    var items = {
        "add": {name: "Add Item", icon: "fa-plus"},
        "paste": {
            name: "Paste Item",
            icon: "fa-paste",
            disabled: function(key, opt) {
                return Object.keys(pasteItem).length == 0;
            }
        },
        "delete": {name: "Delete Partition", icon: "fa-minus"},
        "function": {
            name: "Edit Value Template",
            icon: "fa-wrench"
        },
        "moveUp": {
            name: "Move Up",
            icon: "fa-arrow-up",
            disabled: function(key, opt) {
                return unique_values[table.partition_key][0] == cellId[$(this).attr("id")].PK;
            }
        },
        "moveDown": {
            name: "Move Down",
            icon: "fa-arrow-down",
            disabled: function(key, opt) {
                return unique_values[table.partition_key][unique_values[table.partition_key].length - 1] == cellId[$(this).attr("id")].PK;
            }
        }
    };

    $.contextMenu({
        selector: '.PK-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "add":
                    addItemClick($(this).attr("id"));
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

                case "moveUp":
                case "moveDown":
                    selectId = cellId[$(this).attr("id")];
                    movePartition(key == "moveUp");
                    break;

                case "function":
                    showValueTemplate($(this).attr("id"));
                    break;
            }
        },
        items: items
    });

    items = {
        "add": {name: "Add Attribute", icon: "fa-plus"},
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

    $.contextMenu({
        selector: '.SK-context-menu',
        callback: function(key, options) {
            switch (key) {
                case "add":
                    addAttribute($(this).attr("id"));
                    break;

                case "date":
                    $(this).text(new Date().toISOString().split(".")[0]);
                    selectId.SK = $(this).text();
                    setValue($(this).attr("id"));
                    break;

                case "uuid":
                    $(this).text(fakeUUID());
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
            }
        },
        items: items
    });
}

function toggleSchema() {
    showValues = !showValues
    showTable();
}

function getModel(type) {
    return schema.models.find(m => m.type == type)
}

function dynamoToType(dtype) {
    switch (dtype) {
    case 'B':
        return 'Binary'
    case 'BOOL':
        return 'Boolean'
    case 'S':
        return 'String'
    case 'N':
        return 'Number'
    case 'SS':
        return 'Set'
    default:
        return 'String'
    }
}

function typeToDynamo(type) {
    switch (type) {
    case 'Binary':
        return 'B'
    case 'Boolean':
        return 'BOOL'
    case 'Date':
        return 'S'
    case 'Number':
        return 'N'
    case 'Set':
        //  need support for SS, NS, BS
        return 'SS'
    default:
        return 'S'
    }
}

// UI logic and onclick handlers
$(document).ready(function() {
    //file upload
    $("#importFile").change(function(e) {
        $("#fileDiv").hide();
        var reader = new FileReader();
        reader.onload = onReaderLoad;
        reader.readAsText(e.target.files[0]);
    });

    $(".btnImportOneTable").bind('click', function(evt) {
        importOneTableSchema($("#schema").text());
        $("#oneTableModal").hide();
    });

    $("#btnDefineMap").bind('click', function(evt) {
        if ($("#txtMapFunction").val().indexOf("${" + alertData.caller + "}") >= 0) {
            alert("Map Functions cannot reference the destination attribute.");
            return;
        }
        let valueTemplate = $("#txtMapFunction").val();
        debugger;
        makeChange();
        createMapping(alertData.data.type, alertData.caller, valueTemplate);
        loadDataModel();

        $("#txtMapFunction").val("");
        $("#lblEditMap").text("Mapping Function:");
        $("#selectTypeDiv").hide();
        $("#defineValueTemplateDiv").hide();
    });

    // generic click handler for Cancel buttons
    $('.cancel').bind('click', function(evt) {
        $("#createTableOrIndex").hide();
        $("#fileDiv").hide();
        $("#selectTableDiv").hide();
        $("#createModelDiv").hide();
        $("#alertModal").hide();
        $("#removeAttributeModal").hide();
        $("#oneTableModal").hide();
        $("#defineValueTemplateDiv").hide();
        $("#txtMapFunction").val("");
        $("#lblEditMap").text("Mapping Function:");
        $("#selectTypeDiv").hide();
        $("#txtMapFunction").prop("disabled", false);
        $("#btnDefineMap").prop("disabled", false);

        initQuery();
    });

    // click handler for Create Model
    $("#btnCreateModel").click(function (evt) {
        // initialize the current model
        model = {};

        // populate metadata from the form and set created timestamp
        model.ModelName = $("#txtModelName").val();
        var date = new Date();
        model.ModelMetadata = {
            "Author": $("#txtModelAuthor").val(),
            "DateCreated": date,
            "DateLastModified": date,
            "Description": $("#txtModelDesc").val(),
            "AWSService": "Amazon DynamoDB",
            "Version": "2.0"
        };

        // initialize Model change buffer and add a new Table
        tableChanges = {};
        addTable();

        $("#createModelDiv").hide();
    });

    // hook the onchange event handler for the view table dropdown
    $("#viewTable").change(function (event) {
        $("#selectTableDiv").hide();

        if ($("#viewTable").val() == "-1") {
            // if create table was selected then fire add table dialog
            $("#selectTableDiv").hide();
            addTable();
        }
        else {
            // set the modelIndex to load
            modelIndex = parseInt($("#viewTable").val());

            // initialize tab index and load the selected data model
            loadDataModel();
        }

        findDataModels();

    });

    $("#createTableOrIndex").find(".input_key_select").on('change', function() {
        var sel = $(this).val();
        if (sel == "include") {
            $(".inputkey_group").show();
            gsi_attrkey = "include";
        } else {
            $(".inputkey_group").hide();
            gsi_attrkey = "all";
        }
        gsi_attrlist = [];
    });

    // click handler for Create Table
    $("#createTableOrIndex").find(".btn_tablecreate").on('click', function() {
        var definition = {},
            isTable = $("#title h1").text() == "Create Table";

        if ($('.gsi_primary').val() == '') {
            alert("Please provide a patition key!");
            return;
        }

        if ($('.cgi_title').val() == '') {
            alert("Please provide a name");
            return;
        }

        definition.KeyAttributes = {};
        let indexName = $('.cgi_title').val();
        definition[isTable ? "TableName" : "IndexName"] = indexName
        definition.KeyAttributes.PartitionKey = {
            "AttributeName": $('.gsi_primary').val(),
            "AttributeType": $('#dropPart').val()
        };
        definition.KeyAttributes.SortKey =  {
            "AttributeName": $('.gsi_sort').val(),
            "AttributeType": $('#dropSort').val()
        };

        if (!isTable) {
            definition["Projection"] = {
                "ProjectionType": "ALL"
            };

            makeChange();
            datamodel.GlobalSecondaryIndexes.push(definition);
            schema.indexes[indexName] = {
                hash: $('.gsi_primary').val(),
                sort: $('.gsi_sort').val(),
                projection: 'ALL',
            }
        } else {
            datamodel = {
                "TableName": definition.TableName,
                "KeyAttributes": definition.KeyAttributes,
                "NonKeyAttributes":[],
                "GlobalSecondaryIndexes": [],
                "TableData": []
            };

            if (model.DataModel == null)
                model.DataModel = []

            model.DataModel.push(datamodel);
            modelIndex = model.DataModel.length - 1;

            json_data = datamodel.TableData;

            table.name = definition.TableName;
            table.partition_key = $('.gsi_primary').val();
            table.sort_key = $('.gsi_sort').val();
            table.sortkey_datatype = $('.dropSort').val();
            tableChanges[datamodel.TableName] = [];

            schema.indexes.primary = {
                hash: $('.gsi_primary').val(),
                sort: $('.gsi_sort').val(),
            }
            addItem("~new~");
        }
        $("#createTableOrIndex").find('.key_input').val('');
        $('#createTableOrIndex').modal('toggle');

        findDataModels();
        loadDataModel();
    });

    $("#createTableOrIndex").find(".btn_attrkey").on("click", function() {
        gsi_attrkey = $("#createTableOrIndex").find(".input_key_select").val();
        var html = '';
        var atrkey = $("#createTableOrIndex").find(".attrkey_input").val();
        if (atrkey.trim() == '') {
            alert("Please input key");
            return;
        }
        if (gsi_attrkey == 'include') {
            html = '<li>' + atrkey + '</li>';
            gsi_attrlist.push(atrkey);
        } else {

        }
    });

    $("#source").on('click', function() {
        $("#mySidenav").css("width","0");
        $("#fileDiv").show();
    });

    $(".addGSI").on('click', function() {
        $("#mySidenav").css("width","0");
        $("#title h1").text("Create Index");
        $("#idx_lbl").text("Index name:");
        $("#tbSort").show();
        $("#dropSort").show();
        $("#projection_cfg").show();
        $('#createTableOrIndex').modal('toggle');
    });

    $("#createModel").on('click', function() {
        $("#mySidenav").css("width","0");
        if (model.ModelName != null) {
            alertData = {
                caller: "createModel",
                data: ""
            };

            $("#alertTitle h1").text("Model Overwrite");
            $("#alertText").text("The existing model will be overwritten, continue?");

            $("#alertModal").show();
        }
        else
            $("#createModelDiv").show();
    });

    $("#saveModel").on('click', function() {
        $("#mySidenav").css("width","0");
        saveModel();
    });

    $("#clearIdx").on('click', function() {
        $("#mySidenav").css("width","0");
        datamodel.GlobalSecondaryIndexes = [];
        loadDataModel();
    });

    $("#importSchema").on('click', function() {
        $("#oneTableModal").show();
    });

    $("#showValues").on('click', function(e) {
        showValues = !showValues
        showTable();
        $("#showValuesCheckbox").prop("checked", showValues);
        e.preventDefault()
    });

    $("#showValuesCheckbox").prop("checked", true);

    $("#exportSchema").on('click', function() {
        $("#mySidenav").css("width","0");
        exportOneTableSchema();
    });

    $("#reload").on('click', function() {
        location.reload();
    });
});

// Just for debug
dump = (...args) => {
    let s = []
    for (let item of args) {
        s.push(JSON.stringify(item, function (key, value) {
            if (this[key] instanceof Date) {
                return this[key].toLocaleString()
            }
            return value
        }, 4))
    }
    print(s.join(' '))
}
print = (...args) => {
    console.log(...args)
}
