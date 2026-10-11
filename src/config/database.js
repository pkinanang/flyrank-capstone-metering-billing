const { Pool } = require("pg");
const path = require("path");
const dotenv = require("dotenv");

// Ensure .env.test is loaded in test environment and .env in other environments
if (process.env.NODE_ENV === "test") {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });
} else {
    dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
    })
    : new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE || process.env.DB_NAME,
        port: Number(process.env.DB_PORT),
    });

module.exports = pool;
