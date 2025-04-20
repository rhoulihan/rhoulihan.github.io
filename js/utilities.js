/**
 * MongoDB Index Modeler - Utility Functions
 * 
 * This file contains utility and helper functions used throughout the application.
 * Functions are grouped by purpose and well-documented.
 */

// ===================================================================
// DOM and jQuery Helpers
// ===================================================================

/**
 * Escapes special characters in element IDs for jQuery selectors
 * 
 * @param {string} myid - The ID to escape, with or without # prefix
 * @return {string} Properly escaped ID with # prefix
 */
function jq(myid) {
    return (myid.startsWith("#") ? "" : "#") + myid.replace(/(:|\.|\||\[|\]|,|=|@|#|~|!)/g, "\\$1");
}

/**
 * Handles firing keypress events when an editable div loses focus
 * Ensures we process changes made even if enter wasn't pressed
 * 
 * @param {string} id - ID of the element that lost focus
 */
function focusOut(id) {
    if (!fired) {
        $(jq(id)).triggerHandler("keypress");
    }
    fired = false;
}

/**
 * Selects all text within a specified table cell for easy editing
 * 
 * @param {number} idx - The cell index to select
 */
jQuery.fn.selectText = function(idx) {
    var doc = document;
    var element = $("#cell" + idx)[0];
    idx++;

    if (!cellId.hasOwnProperty("cell" + idx)) {
        idx--;
    }
    
    selectId = cellId["cell" + idx];
    mouseDown = false;
    
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
    
    buildContextMenus();
};

// ===================================================================
// Data Format and Validation Functions
// ===================================================================

/**
 * Checks if a string contains valid JSON
 * 
 * @param {string} str - String to validate as JSON
 * @return {boolean} True if valid JSON, false otherwise
 */
function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

/**
 * Generates a UUID for use as document IDs
 * 
 * @return {string} A UUID v4 format string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Converts MongoDB type name to DynamoDB attribute type code
 * 
 * @param {string} type - The MongoDB type name
 * @return {string} DynamoDB attribute type code
 */
function typeToDynamo(type) {
    switch (type) {
    case 'Binary':
        return 'B';
    case 'Boolean':
        return 'BOOL';
    case 'Date':
        return 'S';
    case 'Number':
        return 'N';
    case 'Set':
        // Need support for SS, NS, BS
        return 'SS';
    default:
        return 'S';
    }
}

/**
 * Converts DynamoDB attribute type code to MongoDB type name
 * 
 * @param {string} dtype - The DynamoDB attribute type code
 * @return {string} MongoDB type name
 */
function dynamoToType(dtype) {
    switch (dtype) {
    case 'B':
        return 'Binary';
    case 'BOOL':
        return 'Boolean';
    case 'S':
        return 'String';
    case 'N':
        return 'Number';
    case 'SS':
        return 'Set';
    default:
        return 'String';
    }
}

/**
 * Gets a display value for any type of data
 * Used to normalize display of different MongoDB data types
 * 
 * @param {*} value - Any value to format for display
 * @return {string} Formatted string representation
 */
function getDisplayValue(value) {
    switch (typeof value) {
        case 'object':
            return JSON.stringify(value);
        case 'number':
            return value.toString();
        default:
            return value;
    }
}

// ===================================================================
// Cookie Management
// ===================================================================

/**
 * Retrieves a cookie value by name
 * 
 * @param {string} cookieName - Name of the cookie to retrieve
 * @return {string} Cookie value or empty string if not found
 */
function getCookie(cookieName) {
    var name = cookieName + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var cookieParts = decodedCookie.split(';');
    
    for (var i = 0; i < cookieParts.length; i++) {
        var cookie = cookieParts[i];
        while (cookie.charAt(0) === ' ') {
            cookie = cookie.substring(1);
        }
        if (cookie.indexOf(name) === 0) {
            return cookie.substring(name.length, cookie.length);
        }
    }
    return "";
}

/**
 * Sets a cookie with the given name, value and expiration
 * 
 * @param {string} cookieName - Name of the cookie to set
 * @param {string} cookieValue - Value to store in the cookie
 * @param {number} expirationDays - Number of days until cookie expires
 */
function setCookie(cookieName, cookieValue, expirationDays) {
    var date = new Date();
    date.setTime(date.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + date.toGMTString();
    document.cookie = cookieName + "=" + cookieValue + ";" + expires + ";path=/";
}

// ===================================================================
// Debug Utilities
// ===================================================================

/**
 * Dumps object(s) to console for debugging, with proper formatting
 * 
 * @param {...*} args - Objects to dump to console
 */
function dump(...args) {
    let output = [];
    for (let item of args) {
        output.push(JSON.stringify(item, function(key, value) {
            if (this[key] instanceof Date) {
                return this[key].toLocaleString();
            }
            return value;
        }, 4));
    }
    console.log(output.join(' '));
}

/**
 * Simplified wrapper for console.log
 * 
 * @param {...*} args - Items to log to console
 */
function print(...args) {
    console.log(...args);
}

// ===================================================================
// File Operations
// ===================================================================

/**
 * Saves data to a file and triggers download
 * 
 * @param {string} data - Data to save to file
 * @param {string} filename - Name for the downloaded file
 * @param {string} type - MIME type for the file
 */
function saveToFile(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) {
        // For IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    } else {
        // For other browsers
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