{
    indexes: {
        primary: {
            hash: 'PK',
            sort: 'SK',
        },
        gsi1: {
            hash: 'PK1',
            sort: 'SK1',
            projection: 'ALL'
        },
        gsi2: {
            hash: 'PK2',
            sort: 'SK2',
            projection: 'ALL'
        },
        gsi3: {
            hash: 'PK3',
            sort: 'SK3',
            projection: 'ALL'
        },
        gsi4: {
            hash: 'PK4',
            sort: 'SK4',
            projection: 'ALL'
        }
    },
    models: {
        patient: {
            PK:             { type: String, value: 'patient#${id}' },
            SK:             { type: String, value: 'patient#' },
            name:           { type: String, required: true },
            age:            { type: Number, required: true },
            medicare:       { type: String },
        },
        treatment: {
            PK:             { type: String, value: 'treatment#${id}' },
            SK:             { type: String, value: 'treatment#${timestamp}#${treatmentId}' },
            timestamp:      { type: Date },
            treatmentId:    { type: String },
            PK1:            { type: String },
            SK1:            { type: String },
            PK2:            { type: String },
            SK2:            { type: String }
        },
        medicine: {
            PK:             { type: String, value: 'medicine#' },
            SK:             { type: String, value: 'medicine#' },
            name:           { type: String },
            PK1:            { type: String },
            SK1:            { type: String },
            PK2:            { type: String },
            SK2:            { type: String }
        },
        admission: {
            PK:             { type: String, value: 'admission#${patientId}' },
            SK:             { type: String, value: 'admission#${timestamp}#{roomId}' },
            timestamp:      { type: Date },
            roomId:         { type: String },
            condition:      { type: String },
            patientId:      { type: String },
            PK1:            { type: String },
            SK1:            { type: String },
            PK2:            { type: String },
            SK2:            { type: String }
        },
        doctor: {
            PK:             { type: String, value: 'doctor#${name}' },
            SK:             { type: String, value: 'doctor#' },
            name:           { type: String, required: true },
            PK1:            { type: String },
            SK1:            { type: String },
            PK2:            { type: String },
            SK2:            { type: String }
        },
        nurse: {
            PK:             { type: String, value: 'nurse#${name}' },
            SK:             { type: String, value: 'nurse#' },
            name:           { type: String, required: true },
            PK1:            { type: String },
            SK1:            { type: String },
        },
        room: {
            PK:             { type: String, value: 'room#${roomId}' },
            SK:             { type: String, value: 'room#' },
            PK3:            { type: String },
            SK3:            { type: String },
            roomId:         { type: String, required: true },
            building:       { type: String, required: true },
        },
        activity: {
            PK:             { type: String, value: 'activity#${date}' },
            SK:             { type: String, value: 'activity#' },
            PK1:            { type: String },
            SK1:            { type: String },
            timestamp:      { type: Date, required: true },
            description:    { type: String },
        }
    }
}