-- Create the database
CREATE DATABASE camscannerx_db;

-- Connect to the new database
\c camscannerx_db

-- Create the user
CREATE USER camscannerx_user WITH PASSWORD 'C0ldC0fe';

-- Grant privileges to the user on the database
GRANT ALL PRIVILEGES ON DATABASE camscannerx_db TO camscannerx_user;

-- Create the users table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Grant privileges on the users table to the user
GRANT ALL PRIVILEGES ON TABLE users TO camscannerx_user;
