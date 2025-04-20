/**
 * MongoDB Index Modeler - Global Variables and Constants
 * 
 * This file contains all global variables and constants used throughout the application.
 * Variables are organized by functional domain and documented for clarity.
 */

// ===================================================================
// Application State - Primary Data Model
// ===================================================================

/**
 * Container for the entire data model including collection definitions and metadata
 * @type {Object}
 */
var model = {};

/**
 * Pointer to the currently active collection in model.DataModel[modelIndex]
 * @type {Object}
 */
var datamodel = {};

/**
 * Pointer to the active collection's document data (model.DataModels[modelIndex].CollectionData)
 * @type {Array}
 */
var json_data = [];

/**
 * Container for change history (up to 50 revisions per collection)
 * Format: { collectionName: [revisions] }
 * @type {Object}
 */
var tableChanges = {};

// ===================================================================
// Current Collection Configuration 
// ===================================================================

/**
 * Container for the current collection settings
 * @type {Object}
 * @property {string} name - Collection name
 * @property {string} primary_key - Primary key field (usually "_id")
 * @property {string} sort_key - Sort key field (if applicable)
 * @property {string} sortkey_datatype - Data type of sort key
 */
var table = {};

/**
 * Individual configuration properties extracted for convenience
 * These are set during collection loading
 */
var primary_key; // Current primary key
var sort_key;    // Current sort key
var sortkey_datatype; // Data type of sort key

// ===================================================================
// UI State Variables
// ===================================================================

/**
 * Current tabIndex for DOM element focus management
 * @type {number}
 */
var tabIndex = 0;

/**
 * Contains info about the cell to focus when re-rendering the table 
 * @type {Object}
 */
var selectId = {};

/**
 * Flag to prevent double-firing of keypress events
 * @type {boolean}
 */
var fired = true;

/**
 * Mouse state tracking to prevent event overlaps 
 * @type {boolean}
 */
var mouseDown = false;

/**
 * Container to track first and last attribute cells in the table
 * @type {Object}
 * @property {Object} first - First cell in table
 * @property {Object} last - Last cell in table 
 */
var boundary = {
    first: {},
    last: {}
};

/**
 * Metadata for each cell in the table, indexed by cell ID
 * Format: { cellId: { PK, SK, attr, type, obj } }
 * @type {Object}
 */
var cellId = {};

/**
 * Toggle between showing values or schema metadata
 * @type {boolean}
 */
var showValues = true;

/**
 * BTrees data structure for managing hierarchical display in the UI
 * @type {Object}  
 */
var keyMap = {};

// ===================================================================
// Data Management Variables
// ===================================================================

/**
 * Index of the current collection in model.DataModel array
 * @type {number}
 */
var modelIndex = 0;

/**
 * Container for items that match the current query
 * @type {Array}
 */
var match_data = [];

/**
 * Item clipboard for cut/copy/paste operations
 * @type {Object}
 */
var pasteItem = {};

/**
 * Tracks unique values by attribute name
 * @type {Object}
 */
var unique_values = {};

/**
 * Container for alert modal data
 * @type {Object}
 * @property {string} caller - Function that triggered the alert
 * @property {*} data - Data relevant to the alert
 */
var alertData = {
    caller: "",
    data: ""
};

// ===================================================================
// GSI (Global Secondary Index) Configuration
// ===================================================================

/**
 * GSI projection settings for new indexes
 */
var gsi_attrkey = 'all';  // Projection type
var gsi_attrlist = [];    // Attributes to include in projection
var vals = [];            // Values from attributes with Map type

// ===================================================================
// Query Configuration
// ===================================================================

/**
 * Number of filters for the currently loaded query
 * @type {number}
 */
var numFilters = 0;

// ===================================================================
// AWS Connection Variables
// ===================================================================

/**
 * AWS credentials and connection objects
 */
var credentials;  // AWS account credentials
var client;       // DynamoDB document client
var dynamodb;     // DynamoDB client
var accountTables; // Tables in the current AWS account
var saveTable;    // Table selected for saving

/**
 * JsonEditor instance for document editing
 * @type {Object}
 */
var jsonEditor;

// ===================================================================
// Schema Definition Constants
// ===================================================================

/**
 * Default schema structure used when creating a new model
 * @const
 * @type {Object}
 */
const DEFAULT_SCHEMA = {
    indexes: {},
    models: {},
    queries: {},
    data: [],
};

/**
 * Mapping of MongoDB data types to their corresponding codes
 * @const
 * @type {Object}
 */
const DATA_TYPES = {
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
};

/**
 * Schema structure defining indexes and entity models.
 * This serves as a template and documentation for schema properties.
 * 
 * @type {Object}
 */
var schema = {
    /**
     * Index definitions
     * Format: {
     *   primary: { hash: 'partition-key-name', sort: 'sort-key-name' },
     *   gs1: { hash: 'partition-key-name', sort: 'sort-key-name' }
     * }
     */
    indexes: {},
    
    /**
     * Entity model definitions with attribute configurations
     * Supported attribute properties:
     * - map:      String. Either simple attribute name or "attribute.property"
     * - default:  String. Default value string or function
     * - foreign:  String. Reference to another entity model (model:keys)
     * - nulls:    Boolean. Allow property to be set to null
     * - required: Boolean. Attribute is always required
     * - size:     Number. Maximum size of the data value
     * - type:     String: String, Boolean, Number, Date, Set, Buffer, Binary, Set, Object, Array
     * - validate: String. Regular expression to match data (/regexp/qualifiers)
     * - value:    String|Function. Value string template, function (mapping function)
     * - unique:   Boolean. Attribute must have a unique value
     */
    models: {},

    // Additional properties for import/export
    queries: {},
    data: {}
};