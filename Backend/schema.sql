-- schema.sql: create database and users table for the project

CREATE DATABASE IF NOT EXISTS year4project;
USE year4project;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) DEFAULT '',
  age INT NULL,
  weight FLOAT NULL,
  `condition` VARCHAR(255) NULL,
  goals JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL
);
