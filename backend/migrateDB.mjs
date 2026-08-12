import 'dotenv/config';
import pool from './config/db.mjs';

async function runMigrations() {
  try {
    console.log('Starting Bare Metal DB Migration...');

    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_profiles(
                id CHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                dob DATE NOT NULL,
                phone_no VARCHAR(15) UNIQUE NOT NULL,
                account_status ENUM('ACTIVE','SUSPENDED','CLOSED') DEFAULT 'ACTIVE',
                tax_id VARCHAR(50) NOT NULL,
                tax_id_type ENUM('PAN', 'SSN', 'NID') NOT NULL DEFAULT 'PAN',
                country_code CHAR(2) NOT NULL DEFAULT 'IN',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_tax_identity(tax_id,tax_id_type,country_code),
                CONSTRAINT chk_tax_id_format CHECK(
                (tax_id_type='PAN' AND tax_id REGEXP '^[A-Z]{5}[0-9]{4}[A-Z]{1}$') OR
                (tax_id_type='SSN' AND tax_id REGEXP '^[0-9]{3}-[0-9]{2}-[0-9]{4}$') OR
                (tax_id_type= 'NID' AND CHAR_LENGTH(tax_id) BETWEEN 6 AND 50)
                )
            )
            `);
    console.log('user_profiles table created.');

    await pool.query(`
                CREATE TABLE IF NOT EXISTS user_credentials(
                    user_id CHAR(36) PRIMARY KEY,
                    password_hash VARCHAR(255) NOT NULL,
                    failed_attempts TINYINT DEFAULT 0,
                    locked_until TIMESTAMP NULL,
                    last_login_at TIMESTAMP NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT
                )
                `);
    console.log('user_credentials table created.');

    await pool.query(`
                    CREATE TABLE IF NOT EXISTS wallets(
                        id CHAR(36) PRIMARY KEY,
                        user_id CHAR(36) UNIQUE NOT NULL,
                        balance BIGINT UNSIGNED DEFAULT 0,
                        reserved BIGINT UNSIGNED DEFAULT 0,
                        currency ENUM('INR','USD') DEFAULT 'INR',
                        version INT UNSIGNED DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
                        CONSTRAINT chk_positive_balance CHECK (balance>=0),
                        CONSTRAINT chk_positive_reserved CHECK (reserved >= 0),
                        CONSTRAINT chk_reserved_lte_balance CHECK (reserved <= balance)
                    )
                    `);
    console.log('Wallets table created.');

    await pool.query(`
                        CREATE TABLE IF NOT EXISTS ledger(
                            id CHAR(36) PRIMARY KEY,
                            wallet_id CHAR(36) NOT NULL,
                            amount BIGINT UNSIGNED NOT NULL,
                            type ENUM('CREDIT','DEBIT') NOT NULL,
                            transaction_category ENUM('DEPOSIT','WITHDRAWAL','TRADE_BUY','TRADE_SELL','ORDER_RESERVE','ORDER_RELEASE','FEE','REVERSAL','DIVIDEND') NOT NULL,
                            payment_channel ENUM('UPI','NEFT','RTGS','IMPS','INTERNAL') NOT NULL DEFAULT 'INTERNAL',
                            reference_id VARCHAR(128) UNIQUE,
                            balance_after BIGINT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            withdrawal_status ENUM('PENDING','PROCESSED','FAILED') NULL DEFAULT NULL,
                            FOREIGN KEY(wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
                            CONSTRAINT chk_positive_amount CHECK (amount>0),
                            CONSTRAINT chk_channel_category CHECK (
                                (transaction_category IN ('DEPOSIT', 'WITHDRAWAL') 
                                    AND payment_channel IN ('UPI','NEFT','RTGS','IMPS'))
                                OR
                                (transaction_category IN ('TRADE_BUY','TRADE_SELL','ORDER_RESERVE','ORDER_RELEASE','FEE','REVERSAL','DIVIDEND') 
                                    AND payment_channel = 'INTERNAL')
                            ),
                            INDEX idx_wallet_time(wallet_id, created_at DESC)
                        )
                        `);
    console.log('ledger table created');
    await pool.query(`
                    CREATE TABLE IF NOT EXISTS user_session(
                                id CHAR(36) PRIMARY KEY,
                                user_id CHAR(36) NOT NULL,
                                token_hash VARCHAR(64) NOT NULL,
                                jti CHAR(36) UNIQUE NOT NULL,
                                expires_at TIMESTAMP NOT NULL,
                                revoked_at TIMESTAMP NULL,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                user_agent VARCHAR(255),
                                FOREIGN KEY(user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT
                            )
                            `);
    await pool.query(`
                            CREATE TABLE IF NOT EXISTS bank_accounts (
        id              CHAR(36) PRIMARY KEY,
        user_id         CHAR(36) NOT NULL,
        account_number  VARCHAR(20) NOT NULL,
        ifsc_code       VARCHAR(11) NOT NULL,
        account_holder  VARCHAR(255) NOT NULL,
        bank_name       VARCHAR(255) NOT NULL,
        account_type    ENUM('SAVINGS','CURRENT') NOT NULL DEFAULT 'SAVINGS',
        is_verified     BOOLEAN DEFAULT FALSE,
        verified_at     TIMESTAMP NULL,
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
        UNIQUE KEY unique_account_per_user (user_id, account_number, ifsc_code)
    )
`);
    console.log('bank_accounts table created.');
    await pool.query(`
            CREATE TABLE IF NOT EXISTS instruments (
                id            CHAR(36) PRIMARY KEY,
                symbol        VARCHAR(20) NOT NULL,
                company_name  VARCHAR(255) NOT NULL,
                exchange      ENUM('NSE','BSE') NOT NULL DEFAULT 'NSE',
                instrument_type ENUM('EQUITY','ETF','FUTURE','OPTION') NOT NULL DEFAULT 'EQUITY',
                lot_size      INT UNSIGNED NOT NULL DEFAULT 1,
                is_active     BOOLEAN DEFAULT TRUE,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_symbol_exchange (symbol, exchange)
            )
        `);
    console.log('instruments created.');

    await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id              CHAR(36) PRIMARY KEY,
                user_id         CHAR(36) NOT NULL,
                instrument_id   CHAR(36) NOT NULL,
                side            ENUM('BUY','SELL') NOT NULL,
                order_type      ENUM('MARKET','LIMIT') NOT NULL,
                quantity        INT UNSIGNED NOT NULL,
                filled_quantity INT UNSIGNED NOT NULL DEFAULT 0,
                price           BIGINT UNSIGNED NULL,
                status          ENUM('PENDING','PARTIAL','FILLED','CANCELLED','REJECTED') NOT NULL DEFAULT 'PENDING',
                product_type    ENUM('CNC') NOT NULL DEFAULT 'CNC',
                reserved        BIGINT UNSIGNED NOT NULL DEFAULT 0,
                exchange_order_id VARCHAR(64) NULL,
                rejection_reason   VARCHAR(255) NULL,
                cancelled_at       TIMESTAMP NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
                FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE RESTRICT,
                INDEX idx_user_status (user_id, status),
                INDEX idx_instrument_status (instrument_id, status),
                CONSTRAINT chk_limit_has_price CHECK (
                    order_type = 'MARKET' OR
                    (order_type = 'LIMIT' AND price IS NOT NULL)
                ),
                CONSTRAINT chk_quantity_positive CHECK (quantity > 0),
                CONSTRAINT chk_filled_lte_quantity CHECK (filled_quantity <= quantity)
            )
        `);
    console.log('orders created.');

    await pool.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id                CHAR(36) PRIMARY KEY,
                our_order_id      CHAR(36) NOT NULL,
                our_side          ENUM('BUY','SELL') NOT NULL,
                instrument_id     CHAR(36) NOT NULL,
                quantity          INT UNSIGNED NOT NULL,
                trade_price       BIGINT UNSIGNED NOT NULL,
                trade_value       BIGINT UNSIGNED NOT NULL,
                exchange_trade_id VARCHAR(64) UNIQUE NULL,
                executed_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                FOREIGN KEY (our_order_id) REFERENCES orders(id) ON DELETE RESTRICT,
                FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE RESTRICT,
                CONSTRAINT chk_trade_quantity_positive CHECK (quantity > 0),
                CONSTRAINT chk_trade_value_positive CHECK (trade_value > 0),
                INDEX idx_instrument_time (instrument_id, executed_at DESC),
                INDEX idx_our_order (our_order_id)
            )
        `);
    console.log('trades created.');

    await pool.query(`
            CREATE TABLE IF NOT EXISTS positions (
                id                      CHAR(36) PRIMARY KEY,
                user_id                 CHAR(36) NOT NULL,
                instrument_id           CHAR(36) NOT NULL,
                quantity                INT UNSIGNED NOT NULL DEFAULT 0,
                locked_quantity         INT UNSIGNED NOT NULL DEFAULT 0,
                average_buy_price       BIGINT UNSIGNED NOT NULL DEFAULT 0,
                total_invested          BIGINT UNSIGNED NOT NULL DEFAULT 0,
                product_type            ENUM('CNC') NOT NULL DEFAULT 'CNC',
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
                FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE RESTRICT,
                CONSTRAINT chk_locked_lte_quantity CHECK (locked_quantity <= quantity),
                UNIQUE KEY unique_position (user_id, instrument_id, product_type),
                INDEX idx_user_positions (user_id)
            )
        `);
    console.log('positions created.');
    console.log('All database migrations executed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();
