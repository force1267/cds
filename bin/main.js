#!/usr/bin/env node

const {app, db} = require('../server/index.js')


const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'admin';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || '';

const mysql = require("mysql");

db.connection = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME
});
db.connection.connect(err => {
    if(err) throw err;
    console.log(`database is connected to ${DB_USER}@${DB_HOST}/${DB_NAME}`)
});


const PID = process.pid;
const PORT = process.env.PORT || process.argv[2] || 8080; // we'll use this in production
const SECRET = process.env.SECRET || "force"; // we'll use this in production

app.listen(PORT)
console.log(`server is running on http://127.0.0.1:${PORT}/`)
console.log(`PID ${PID}`)


// graceful shutdown

function exit() {
    setTimeout(e => {
        process.exit(0);
    }, 1000);
}

// DEBUG not tested
process.on('SIGTERM', () => {
    var done = false;
    db.connection.close().then(() => {
        done = done ? process.exit(0) : true;
    });
    app.close(() => {
        done = done ? process.exit(0) : true;
    });
});