#!/usr/bin/env node

// to scaffold the project!


const mysql = require("mysql");
const cuid = require("cuid"); // use this to create a cuid in insertaion ops
const safe = require('../server/safe.js');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || null;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || 'root';
const DB_NAME = process.env.DB_NAME || 'cds';


const connection = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    port: DB_PORT
});

connection.connect(err => {
    if(err) return console.error(err);
    console.log(`database is connected to ${DB_USER}@${DB_HOST}/${DB_NAME}`);
    const errlog = (err, rows) => err ? console.log(err.sqlMessage) : console.log("ok");



    
    // ============================================= COMMENT INIT SETUP ===============================================================
    // comment table
    // ...
    connection.query(`CREATE TABLE IF NOT EXISTS comment (
    id INT AUTO_INCREMENT PRIMARY KEY, 
    post_id INT,
    content TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    cuid VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX post_ind (post_id),
    FOREIGN KEY (post_id)
        REFERENCES post(id)
        ON DELETE CASCADE)ENGINE=INNODB;` ,[] ,(err, rows) => {
            if(err) errlog(err, rows)
            else connection.query(`INSERT INTO comment(post_id, content, name, email, cuid) VALUES(
                1,
                'این پست عالی است!',
                'wilonion',
                'ea_pain@yahoo.com',
                ?
            );` ,[cuid()] ,errlog)
        });

    // ================================ CANDO BODY AND THEIR RELATED tabs INIT SETUP ============================================================================
    connection.query(`CREATE TABLE IF NOT EXISTS route (
        id INT AUTO_INCREMENT PRIMARY KEY,
        access INT,
        title TEXT NOT NULL,
        en_title TEXT NOT NULL,
        status TINYINT NOT NULL DEFAULT 0,
    )ENGINE=INNODB;` ,[] ,(err, rows) =>{
        if(err) errlog(err, rows)
        // TODO
        else connection.query(`INSERT INTO route(country_name, country_en_name, title, en_title, cuid) VALUES(
            'کانادا',
            'canada',
            'مهاجرت به کانادا',
            'migratio to canada',
            ?
        );` ,[cuid()] ,errlog)
    });
// PAGE
    connection.query(`CREATE TABLE IF NOT EXISTS page (
        id INT AUTO_INCREMENT PRIMARY KEY,
        route_id INT,
        title TEXT NOT NULL,
        en_title TEXT NOT NULL,
        slug TEXT NOT NULL,
        en_slug TEXT NOT NULL,
        content TEXT NOT NULL,
        en_content TEXT NOT NULL,
        status TINYINT NOT NULL DEFAULT 0,
        cuid VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX route_ind (route_id),
        FOREIGN KEY (route_id)
            REFERENCES tab(id)
                ON DELETE CASCADE)ENGINE=INNODB;` ,[] ,(err, rows) =>{
        if(err) errlog(err, rows)
        else connection.query(`INSERT INTO page(route_id, slug, en_slug, content, en_content, cuid) 
        VALUES();`, [cuid()], errlog)
    });
    connection.query(`CREATE TABLE IF NOT EXISTS page_tag(
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_id INT,
        tag TEXT NOT NULL,
        en_tag TEXT NOT NULL,
        cuid VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX page_ind (page_id),
        FOREIGN KEY (page_id)
        REFERENCES page(id)
        ON DELETE CASCADE)ENGINE=INNODB;`, [], (err, rows)=>{
            if(err) errlog(err, rows)
            else connection.query(`INSERT INTO page_tag(page_id, tag, en_tag, cuid) 
            VALUES ();`, [cuid()], errlog)
        });

    // ========================================= USER INIT SETUP ===================================================================
    // user table
    // ...
    connection.query(`CREATE TABLE IF NOT EXISTS user (
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    firstname text NULL,
    lastname text NULL,
    email text NOT NULL,
    password text NOT NULL,
    access int NOT NULL DEFAULT '2',
    avatar text NULL
    )ENGINE=INNODB;` ,[] ,(err, rows)=>{
        if(err) errlog(err, rows)
        // add account dev@cds.or.ir:dev with dev access (7)
        else safe.hash("dev",(err, password) => {
            connection.query(`INSERT INTO user(id, email, password, access, firstname, lastname) VALUES(1, 'dev@cds.org.ir', ?, 7, 'dev', 'eloper')` ,[password] ,errlog);
        });
    });

    // ========================================= DEV INIT SETUP ===================================================================
    // error table
    // ...
    connection.query(`CREATE TABLE IF NOT EXISTS error (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        msg text NULL,
        status int NULL
        )ENGINE=INNODB;` ,[] ,errlog);
});
