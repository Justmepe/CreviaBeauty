/**
 * Database Configuration and Initialization
 * Uses PostgreSQL with pg (node-postgres)
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Load config (handles dotenv internally)
let config;
try {
    config = require('./config');
} catch (e) {
    // Config may not be available during initial setup
    config = {
        database: {
            host: 'localhost',
            port: 5432,
            name: 'crevia_and_co',
            user: 'postgres',
            password: 'postgres'
        }
    };
}

// Create connection pool
const pool = new Pool({
    connectionString: config.database.connectionString,
    host: config.database.connectionString ? undefined : config.database.host,
    port: config.database.connectionString ? undefined : config.database.port,
    database: config.database.connectionString ? undefined : config.database.name,
    user: config.database.connectionString ? undefined : config.database.user,
    password: config.database.connectionString ? undefined : config.database.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Database wrapper for compatibility with existing route code
const db = {
    pool,

    // Query method
    query: (text, params) => pool.query(text, params),

    // Get single row (mimics better-sqlite3 .get())
    async get(text, ...params) {
        const result = await pool.query(text, params);
        return result.rows[0] || null;
    },

    // Get all rows (mimics better-sqlite3 .all())
    async all(text, ...params) {
        const result = await pool.query(text, params);
        return result.rows;
    },

    // Run statement (mimics better-sqlite3 .run())
    async run(text, ...params) {
        const result = await pool.query(text, params);
        return {
            changes: result.rowCount,
            lastInsertRowid: result.rows[0]?.id || null
        };
    },

    // Prepare statement helper (for compatibility)
    prepare(text) {
        return {
            get: async (...params) => {
                const result = await pool.query(text, params);
                return result.rows[0] || null;
            },
            all: async (...params) => {
                const result = await pool.query(text, params);
                return result.rows;
            },
            run: async (...params) => {
                const result = await pool.query(text, params);
                return {
                    changes: result.rowCount,
                    lastInsertRowid: result.rows[0]?.id || null
                };
            }
        };
    },

    // Transaction helper
    async transaction(callback) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    // Close pool
    async close() {
        await pool.end();
    }
};

// Initialize database tables
async function initializeDatabase() {
    const client = await pool.connect();

    try {
        // Create tables
        await client.query(`
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(50),
                password VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Products table
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(12, 2) NOT NULL,
                original_price DECIMAL(12, 2),
                discount INTEGER DEFAULT 0,
                category VARCHAR(100),
                image_url TEXT,
                stock INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Cart table
            CREATE TABLE IF NOT EXISTS cart (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 1,
                session_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Orders table
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                total DECIMAL(12, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                shipping_address TEXT,
                phone VARCHAR(50),
                payment_method VARCHAR(20) DEFAULT 'cod',
                payment_status VARCHAR(20) DEFAULT 'pending',
                payment_reference VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Order items table
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id),
                quantity INTEGER NOT NULL,
                price DECIMAL(12, 2) NOT NULL
            );

            -- Contact messages table
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Reviews table
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                order_id INTEGER REFERENCES orders(id),
                product_id INTEGER REFERENCES products(id),
                customer_name VARCHAR(255) NOT NULL,
                customer_email VARCHAR(255),
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                review_text TEXT,
                product_quality INTEGER CHECK(product_quality >= 1 AND product_quality <= 5),
                delivery_rating INTEGER CHECK(delivery_rating >= 1 AND delivery_rating <= 5),
                is_approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Sessions table
            CREATE TABLE IF NOT EXISTS sessions (
                sid VARCHAR(255) PRIMARY KEY NOT NULL,
                sess JSON NOT NULL,
                expired BIGINT NOT NULL
            );

            -- Payment settings table
            CREATE TABLE IF NOT EXISTS payment_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Marketer profiles table
            CREATE TABLE IF NOT EXISTS marketer_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, suspended
                tier VARCHAR(20) DEFAULT 'bronze',     -- bronze, silver, gold, platinum
                commission_rate DECIMAL(5, 2) DEFAULT 10.00,
                total_sales DECIMAL(12, 2) DEFAULT 0,
                total_commission DECIMAL(12, 2) DEFAULT 0,
                pending_commission DECIMAL(12, 2) DEFAULT 0,
                withdrawn_commission DECIMAL(12, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved_at TIMESTAMP
            );

            -- Commissions table
            CREATE TABLE IF NOT EXISTS commissions (
                id SERIAL PRIMARY KEY,
                marketer_id INTEGER REFERENCES users(id),
                order_id INTEGER REFERENCES orders(id),
                order_total DECIMAL(12, 2) NOT NULL,
                commission_rate DECIMAL(5, 2) NOT NULL,
                commission_amount DECIMAL(12, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, cancelled
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                approved_at TIMESTAMP
            );

            -- Marketer payouts table
            CREATE TABLE IF NOT EXISTS marketer_payouts (
                id SERIAL PRIMARY KEY,
                marketer_id INTEGER REFERENCES users(id),
                amount DECIMAL(12, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
                payment_method VARCHAR(50),
                payment_details TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                processed_by INTEGER REFERENCES users(id)
            );

            -- Commission tiers table
            CREATE TABLE IF NOT EXISTS commission_tiers (
                id SERIAL PRIMARY KEY,
                tier_name VARCHAR(20) UNIQUE NOT NULL,
                min_sales DECIMAL(12, 2) NOT NULL,
                commission_rate DECIMAL(5, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Points settings table
            CREATE TABLE IF NOT EXISTS points_settings (
                id SERIAL PRIMARY KEY,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Points transactions table
            CREATE TABLE IF NOT EXISTS points_transactions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                points INTEGER NOT NULL,
                type VARCHAR(50) NOT NULL,  -- earned, redeemed, referral_bonus, withdrawal, expired
                description TEXT,
                reference_id INTEGER,       -- order_id or referral user_id
                balance_after INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Customer referrals table
            CREATE TABLE IF NOT EXISTS customer_referrals (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER REFERENCES users(id),
                referred_id INTEGER REFERENCES users(id),
                bonus_awarded BOOLEAN DEFAULT FALSE,
                first_order_id INTEGER REFERENCES orders(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Points withdrawals table
            CREATE TABLE IF NOT EXISTS points_withdrawals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                points INTEGER NOT NULL,
                kes_amount DECIMAL(12, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
                payment_method VARCHAR(50),
                payment_details TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP,
                processed_by INTEGER REFERENCES users(id)
            );
        `);

        // Add payment columns to orders table if they don't exist (migration)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_method') THEN
                    ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) DEFAULT 'cod';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_status') THEN
                    ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_reference') THEN
                    ALTER TABLE orders ADD COLUMN payment_reference VARCHAR(50);
                END IF;
            END $$;
        `);

        // Add cost_price column to products table (migration for profit-based commission)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cost_price') THEN
                    ALTER TABLE products ADD COLUMN cost_price DECIMAL(12, 2) DEFAULT 0;
                END IF;
            END $$;
        `);

        // Add subcategory column to products (migration for perfume audience: Women's/Men's/Unisex)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='subcategory') THEN
                    ALTER TABLE products ADD COLUMN subcategory VARCHAR(50);
                END IF;
            END $$;
        `);

        // Niche restructure: collapse to 3 main categories (Perfumes / Skincare / Hair)
        // with subcategories. Idempotent — each UPDATE only touches legacy rows, so
        // it is a no-op after the first run. (Removed categories Makeup / Body Care /
        // Beauty Tools are pruned separately, not auto-deleted on boot.)
        await client.query(`UPDATE products SET subcategory = 'Women''s Perfumes' WHERE category = 'Perfumes' AND subcategory = 'Women''s'`);
        await client.query(`UPDATE products SET subcategory = 'Men''s Perfumes'   WHERE category = 'Perfumes' AND subcategory = 'Men''s'`);
        await client.query(`UPDATE products SET subcategory = 'Unisex Perfumes'   WHERE category = 'Perfumes' AND subcategory = 'Unisex'`);
        await client.query(`UPDATE products SET category = 'Skincare', subcategory = 'Women''s Skincare' WHERE category = 'Women''s Skincare'`);
        await client.query(`UPDATE products SET category = 'Skincare', subcategory = 'Men''s Skincare'   WHERE category = 'Men''s Skincare'`);
        await client.query(`UPDATE products SET category = 'Hair', subcategory = 'Hair Care' WHERE category = 'Hair Care'`);
        await client.query(`UPDATE products SET category = 'Hair', subcategory = 'Wigs'      WHERE category = 'Wigs'`);
        await client.query(`UPDATE products SET category = 'Perfumes', subcategory = 'Unisex Perfumes' WHERE category = 'Fragrances'`);

        // Add wig attribute columns to products table (migration for Wigs category)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='wig_texture') THEN
                    ALTER TABLE products ADD COLUMN wig_texture VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='wig_cap_type') THEN
                    ALTER TABLE products ADD COLUMN wig_cap_type VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='wig_origin') THEN
                    ALTER TABLE products ADD COLUMN wig_origin VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='wig_density') THEN
                    ALTER TABLE products ADD COLUMN wig_density INTEGER;
                END IF;
            END $$;
        `);

        // Add faceted-attribute + metadata columns to products (migration for facets/filters/authenticity)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='brand') THEN
                    ALTER TABLE products ADD COLUMN brand VARCHAR(100);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_local_brand') THEN
                    ALTER TABLE products ADD COLUMN is_local_brand BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='scent_family') THEN
                    ALTER TABLE products ADD COLUMN scent_family VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='skin_type') THEN
                    ALTER TABLE products ADD COLUMN skin_type VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='hair_texture') THEN
                    ALTER TABLE products ADD COLUMN hair_texture VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='ingredients') THEN
                    ALTER TABLE products ADD COLUMN ingredients TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='allergens') THEN
                    ALTER TABLE products ADD COLUMN allergens TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_authentic_verified') THEN
                    ALTER TABLE products ADD COLUMN is_authentic_verified BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_sample') THEN
                    ALTER TABLE products ADD COLUMN is_sample BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='size') THEN
                    ALTER TABLE products ADD COLUMN size VARCHAR(50);
                END IF;
            END $$;
        `);

        // Variants table for shade-pickable products (foundations, lipsticks, etc.)
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                variant_name VARCHAR(100) NOT NULL,
                shade_hex VARCHAR(7),
                undertone VARCHAR(20),
                stock INTEGER DEFAULT 0,
                sku_suffix VARCHAR(40),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
        `);

        // Additional product images (gallery — same product, different angles).
        // products.image_url remains the cover; these are the extra shots.
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_images (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, sort_order);
        `);

        // Bundles + bundle items
        await client.query(`
            CREATE TABLE IF NOT EXISTS bundles (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                bundle_price DECIMAL(12, 2) NOT NULL,
                image_url TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bundle_items (
                id SERIAL PRIMARY KEY,
                bundle_id INTEGER NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
        `);

        // Wishlists
        await client.query(`
            CREATE TABLE IF NOT EXISTS wishlists (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id)
            );
            CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
        `);

        // Hero slides — admin-managed homepage carousel
        await client.query(`
            CREATE TABLE IF NOT EXISTS hero_slides (
                id SERIAL PRIMARY KEY,
                category VARCHAR(100) NOT NULL,
                image_url TEXT NOT NULL,
                badge VARCHAR(100),
                title_prefix VARCHAR(255) NOT NULL,
                title_highlight VARCHAR(255),
                title_suffix VARCHAR(255),
                description TEXT,
                link_text VARCHAR(100) NOT NULL,
                extra_link_url VARCHAR(255),
                extra_link_text VARCHAR(150),
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_hero_slides_order ON hero_slides(display_order);
            CREATE INDEX IF NOT EXISTS idx_hero_slides_active ON hero_slides(is_active);
        `);

        // Articles — engine-published blog content (Content Studio)
        await client.query(`
            CREATE TABLE IF NOT EXISTS articles (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(160) UNIQUE NOT NULL,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                hero_image_url TEXT,
                intro TEXT,
                meta_title VARCHAR(160),
                meta_description VARCHAR(300),
                tags TEXT,
                content JSONB NOT NULL DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'published',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
            CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
        `);

        // Add marketer/rewards columns to users table (migration)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'customer';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referral_code') THEN
                    ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referred_by') THEN
                    ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users(id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='points_balance') THEN
                    ALTER TABLE users ADD COLUMN points_balance INTEGER DEFAULT 0;
                END IF;
            END $$;
        `);

        // Add marketer/rewards columns to orders table (migration)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='marketer_id') THEN
                    ALTER TABLE orders ADD COLUMN marketer_id INTEGER REFERENCES users(id);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='marketer_code') THEN
                    ALTER TABLE orders ADD COLUMN marketer_code VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='points_earned') THEN
                    ALTER TABLE orders ADD COLUMN points_earned INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='points_redeemed') THEN
                    ALTER TABLE orders ADD COLUMN points_redeemed INTEGER DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_from_points') THEN
                    ALTER TABLE orders ADD COLUMN discount_from_points DECIMAL(12, 2) DEFAULT 0;
                END IF;
            END $$;
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
            CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
            CREATE INDEX IF NOT EXISTS idx_cart_user ON cart(user_id);
            CREATE INDEX IF NOT EXISTS idx_cart_session ON cart(session_id);
            CREATE INDEX IF NOT EXISTS idx_cart_product ON cart(product_id);
            CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
            CREATE INDEX IF NOT EXISTS idx_orders_payment_ref ON orders(payment_reference);
            CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
            CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(is_approved);
            CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
            CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
            CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
            CREATE INDEX IF NOT EXISTS idx_orders_marketer_id ON orders(marketer_id);
            CREATE INDEX IF NOT EXISTS idx_marketer_profiles_user ON marketer_profiles(user_id);
            CREATE INDEX IF NOT EXISTS idx_marketer_profiles_status ON marketer_profiles(status);
            CREATE INDEX IF NOT EXISTS idx_commissions_marketer ON commissions(marketer_id);
            CREATE INDEX IF NOT EXISTS idx_commissions_order ON commissions(order_id);
            CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
            CREATE INDEX IF NOT EXISTS idx_marketer_payouts_marketer ON marketer_payouts(marketer_id);
            CREATE INDEX IF NOT EXISTS idx_marketer_payouts_status ON marketer_payouts(status);
            CREATE INDEX IF NOT EXISTS idx_points_transactions_user ON points_transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_customer_referrals_referrer ON customer_referrals(referrer_id);
            CREATE INDEX IF NOT EXISTS idx_customer_referrals_referred ON customer_referrals(referred_id);
            CREATE INDEX IF NOT EXISTS idx_points_withdrawals_user ON points_withdrawals(user_id);
            CREATE INDEX IF NOT EXISTS idx_points_withdrawals_status ON points_withdrawals(status);
        `);

        // Demo catalog content (sample products, wigs, decants, reviews, demo hero
        // slides/articles) only seeds when SEED_DEMO_DATA=true. In production this
        // is OFF, so deploys never (re)inject test products — deleting them in admin
        // keeps them gone. Operational config below (admin user, payment/commission/
        // points settings) always seeds its defaults.
        const SEED_DEMO = process.env.SEED_DEMO_DATA === 'true';

        if (SEED_DEMO) {
            const productCount = await client.query('SELECT COUNT(*) as count FROM products');
            if (parseInt(productCount.rows[0].count) === 0) {
                await seedProducts(client);
            }

            // Seed Wigs separately so existing stores get the new category on next boot
            const wigCount = await client.query("SELECT COUNT(*) as count FROM products WHERE category = 'Wigs'");
            if (parseInt(wigCount.rows[0].count) === 0) {
                await seedWigs(client);
            }
        }

        // Backfill facets onto pre-existing products (idempotent UPDATEs). Demo SKU
        // inserts inside are themselves gated on SEED_DEMO_DATA.
        await seedFacetsAndExtras(client);

        // Check if admin user exists
        const adminCount = await client.query('SELECT COUNT(*) as count FROM users WHERE is_admin = TRUE');
        if (parseInt(adminCount.rows[0].count) === 0) {
            await seedAdminUser(client);
        }

        // Demo reviews — only with SEED_DEMO_DATA on
        if (SEED_DEMO) {
            const reviewCount = await client.query('SELECT COUNT(*) as count FROM reviews');
            if (parseInt(reviewCount.rows[0].count) === 0) {
                await seedReviews(client);
            }
        }

        // Check if payment settings exist
        const paymentSettingsCount = await client.query('SELECT COUNT(*) as count FROM payment_settings');
        if (parseInt(paymentSettingsCount.rows[0].count) === 0) {
            await seedPaymentSettings(client);
        }

        // Check if commission tiers exist
        const commissionTiersCount = await client.query('SELECT COUNT(*) as count FROM commission_tiers');
        if (parseInt(commissionTiersCount.rows[0].count) === 0) {
            await seedCommissionTiers(client);
        }

        // Check if points settings exist
        const pointsSettingsCount = await client.query('SELECT COUNT(*) as count FROM points_settings');
        if (parseInt(pointsSettingsCount.rows[0].count) === 0) {
            await seedPointsSettings(client);
        }

        // Demo hero slides + articles — only with SEED_DEMO_DATA on
        if (SEED_DEMO) {
            const heroSlidesCount = await client.query('SELECT COUNT(*) as count FROM hero_slides');
            if (parseInt(heroSlidesCount.rows[0].count) === 0) {
                await seedHeroSlides(client);
            }

            const articlesCount = await client.query('SELECT COUNT(*) as count FROM articles');
            if (parseInt(articlesCount.rows[0].count) === 0) {
                await seedArticles(client);
            }
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function seedProducts(client) {
    const products = [
        // Perfumes
        ["Dior Sauvage EDT 100ml", "Fresh and bold fragrance with notes of bergamot and ambroxan", 12500, 15000, 17, "Perfumes", "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&h=800&fit=crop", 25],
        ["Chanel No. 5 EDP 50ml", "Iconic floral aldehyde perfume for women", 18500, 22000, 16, "Perfumes", "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&h=800&fit=crop", 20],
        ["Tom Ford Black Orchid 100ml", "Luxurious dark floral fragrance", 24500, null, 0, "Perfumes", "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&h=800&fit=crop", 15],

        // Women's Skincare
        ["La Mer Moisturizing Cream 60ml", "Legendary face cream with Miracle Broth", 35000, 42000, 17, "Women's Skincare", "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&h=800&fit=crop", 12],
        ["Estee Lauder Advanced Night Repair", "Powerful serum for youthful-looking skin", 15500, 18000, 14, "Women's Skincare", "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&h=800&fit=crop", 30],
        ["CeraVe Hydrating Cleanser 473ml", "Gentle daily face wash for dry skin", 2800, 3500, 20, "Women's Skincare", "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=800&h=800&fit=crop", 50],

        // Men's Skincare
        ["Clinique For Men Face Wash", "Oil-free face wash for men", 3500, 4200, 17, "Men's Skincare", "https://images.unsplash.com/photo-1581182800629-7d90925ad072?w=800&h=800&fit=crop", 35],
        ["Lab Series Daily Rescue Gel", "Energizing moisturizer for men", 5500, 6500, 15, "Men's Skincare", "https://images.unsplash.com/photo-1621607505837-eb7f1b98b5b0?w=800&h=800&fit=crop", 28],
        ["Kiehl's Facial Fuel Moisturizer", "Vitamin-enriched face moisturizer for men", 4800, null, 0, "Men's Skincare", "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&h=800&fit=crop", 40],

        // Makeup
        ["MAC Ruby Woo Lipstick", "Iconic matte red lipstick", 3200, 3800, 16, "Makeup", "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=800&fit=crop", 45],
        ["Fenty Beauty Pro Filt'r Foundation", "Soft matte longwear foundation", 5500, 6500, 15, "Makeup", "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&h=800&fit=crop", 35],
        ["Urban Decay Naked Palette", "12 stunning neutral eyeshadows", 7500, 9000, 17, "Makeup", "https://images.unsplash.com/photo-1583241800698-e8ab01830a07?w=800&h=800&fit=crop", 25],

        // Hair Care
        ["Olaplex No. 3 Hair Perfector", "At-home bond building treatment", 4500, 5500, 18, "Hair Care", "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&h=800&fit=crop", 40],
        ["Moroccan Oil Treatment 100ml", "Argan oil-infused hair treatment", 5200, null, 0, "Hair Care", "https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=800&h=800&fit=crop", 30],
        ["Kerastase Nutritive Shampoo", "Nourishing shampoo for dry hair", 3800, 4500, 16, "Hair Care", "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=800&h=800&fit=crop", 35],

        // Body Care
        ["Sol de Janeiro Brazilian Bum Bum Cream", "Luxurious body cream with cupuaçu butter", 6500, 7800, 17, "Body Care", "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&h=800&fit=crop", 28],
        ["The Body Shop Body Butter 200ml", "Intensely moisturizing body butter", 2500, 3000, 17, "Body Care", "https://images.unsplash.com/photo-1570194065650-d99fb4b38b15?w=800&h=800&fit=crop", 50],

        // Fragrances
        ["Jo Malone Wood Sage & Sea Salt", "Fresh unisex cologne", 16500, 19500, 15, "Fragrances", "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&h=800&fit=crop", 18],

        // Beauty Tools
        ["Dyson Airwrap Complete", "Multi-styler for multiple hair types", 75000, 85000, 12, "Beauty Tools", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&h=800&fit=crop", 10],
        ["Real Techniques Brush Set", "Professional makeup brush collection", 4500, 5500, 18, "Beauty Tools", "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&h=800&fit=crop", 40]
    ];

    for (const p of products) {
        await client.query(`
            INSERT INTO products (name, description, price, original_price, discount, category, image_url, stock)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, p);
    }
    console.log('Sample beauty products added to database');
}

async function seedWigs(client) {
    // Verified Unsplash photos that actually depict wigs/mannequin-heads/hair (not skincare bottles).
    const imgWigsOnStands  = 'https://images.unsplash.com/photo-1634315775834-3e1ac73de6b6?w=800&h=800&fit=crop'; // bunch of wigs on display
    const imgMannequinHead = 'https://images.unsplash.com/photo-1663582816182-15cf69d87665?w=800&h=800&fit=crop'; // mannequin head with hair
    const imgPracticeHeads = 'https://images.unsplash.com/photo-1535911974356-3748cdc9d2f5?w=800&h=800&fit=crop'; // three wigs on practice heads
    const imgMannequinShop = 'https://images.unsplash.com/photo-1700219212623-77aebb917034?w=800&h=800&fit=crop'; // mannequin heads display
    const imgColoured      = 'https://images.unsplash.com/photo-1559564071-dfa53d83b513?w=800&h=800&fit=crop'; // woman wearing coloured wig
    const imgLongWig       = 'https://images.unsplash.com/photo-1663582816168-916ea1456edc?w=800&h=800&fit=crop'; // long wig on display
    const imgHairTexture   = 'https://images.unsplash.com/photo-1618566909269-a09202832ac6?w=800&h=800&fit=crop'; // brown/black hair close-up

    // [name, description, price, original_price, discount, category, image_url, stock, wig_texture, wig_cap_type, wig_origin, wig_density]
    const wigs = [
        // Entry / Synthetic
        ['Everyday Bob — Synthetic Headband Wig (Natural Black)', 'Easy slip-on bob with an attached black headband. No glue, no lace, ready in 30 seconds. Perfect first wig.', 2499, 3200, 22, 'Wigs', imgMannequinHead, 30, 'Straight', 'Headband', 'Synthetic', 150],
        ['Soft Curl Synthetic Wig — Shoulder Length (1B)', 'Pre-styled loose curls, lightweight cap. Great for weekends and short trips.', 3299, 3900, 15, 'Wigs', imgPracticeHeads, 25, 'Loose Wave', 'Machine-made', 'Synthetic', 150],
        ['Heat-Friendly Bone Straight Synthetic — 20" (1B)', 'Sleek pin-straight synthetic that can be flat-ironed up to 160°C. Office-ready.', 4800, 5800, 17, 'Wigs', imgLongWig, 22, 'Bone Straight', 'Machine-made', 'Heat-friendly Synthetic', 150],
        ['Pixie Cut Synthetic Wig — Honey Brown (#27)', 'Cropped pixie with finger-wave styling. Lightweight, low-maintenance, statement colour.', 3900, 4500, 13, 'Wigs', imgMannequinShop, 18, 'Straight', 'Machine-made', 'Synthetic', 130],

        // Semi-Human / Mid
        ['Boho Braids Semi-Human Wig — Knotless 22"', 'Pre-braided semi-human unit. Trending TikTok style without spending 6 hours in a chair.', 8500, 10500, 19, 'Wigs', imgHairTexture, 15, 'Braided', 'Machine cap w/ lace front', 'Human/Synthetic Blend', 150],
        ['Fringe Bob Semi-Human Wig — Jet Black 12"', 'Blunt bob with a soft fringe. The Korean bob look adapted for African hair textures.', 7800, 9000, 13, 'Wigs', imgMannequinHead, 18, 'Straight', 'Machine-made w/ fringe', 'Human/Synthetic Blend', 150],
        ['Water Curl Semi-Human Wig — 18" Glueless', 'Soft, splashy water curls. Glueless cap with adjustable straps and combs.', 11500, 13500, 15, 'Wigs', imgPracticeHeads, 12, 'Water Wave', '4x4 Closure (Glueless)', 'Human/Synthetic Blend', 180],

        // Human Hair — Mid
        ['Brazilian Body Wave 4×4 Closure Wig — 16" Natural Black', '100% Remy Brazilian hair. 4×4 closure with pre-plucked baby hairs. Beginner-friendly install.', 16500, 19500, 15, 'Wigs', imgLongWig, 10, 'Body Wave', '4x4 Closure', 'Brazilian', 150],
        ['Indian Straight 13×4 Lace Front Wig — 20" (1B)', 'Silky Indian Remy hair, 13×4 transparent lace front, 150% density. Versatile parting.', 19800, 23000, 14, 'Wigs', imgMannequinShop, 9, 'Straight', '13x4 Lace Front', 'Indian', 150],
        ['Brazilian Deep Wave Closure Wig — 18" Natural Black', 'Defined deep waves, soft and bouncy. 5×5 closure, 180% density.', 22000, 26000, 15, 'Wigs', imgWigsOnStands, 8, 'Deep Wave', '5x5 Closure', 'Brazilian', 180],
        ['Coloured Human Hair Bob — 10" Honey Blonde (#27)', 'Pre-coloured 10" blunt bob in honey blonde. Remy hair, 4×4 HD closure. Statement piece.', 18500, 22000, 16, 'Wigs', imgColoured, 8, 'Straight', '4x4 HD Closure', 'Brazilian', 150],

        // Human Hair — Premium
        ['Brazilian Bone Straight 13×6 HD Lace Frontal — 24"', 'Pin-straight, melt-into-scalp HD lace. 180% density, glueless option. The Nairobi salon favourite.', 32500, 38000, 14, 'Wigs', imgLongWig, 6, 'Bone Straight', '13x6 HD Lace Front', 'Brazilian', 180],
        ['Peruvian Loose Wave 13×4 HD Lace Wig — 22"', 'Peruvian Remy with natural loose waves. Pre-plucked, bleached knots, glueless cap.', 29500, 35000, 16, 'Wigs', imgHairTexture, 6, 'Loose Wave', '13x4 HD Lace Front (Glueless)', 'Peruvian', 180],
        ['Highlighted P4/27 Body Wave 13×4 — 20"', 'Hand-painted piano highlights on body wave Brazilian hair. 13×4 HD lace, 180% density.', 34000, 40000, 15, 'Wigs', imgColoured, 5, 'Body Wave', '13x4 HD Lace Front', 'Brazilian', 180],

        // Luxury
        ['Raw Cambodian Straight Full Lace Wig — 26"', 'Raw, single-donor Cambodian hair. Full lace cap allows any parting + high ponytail. Double-drawn ends.', 68000, 80000, 15, 'Wigs', imgLongWig, 3, 'Straight', 'Full Lace', 'Cambodian', 200],
        ['Virgin Brazilian 360 HD Lace — 28" Body Wave, 200% Density', 'Flagship luxury unit. 360 HD lace, virgin Brazilian, 200% density, pre-customised hairline.', 82000, 95000, 14, 'Wigs', imgWigsOnStands, 2, 'Body Wave', '360 HD Lace', 'Brazilian', 200]
    ];

    for (const w of wigs) {
        await client.query(`
            INSERT INTO products (name, description, price, original_price, discount, category, image_url, stock, wig_texture, wig_cap_type, wig_origin, wig_density)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, w);
    }
    console.log('Sample wig products added to database');
}

async function seedFacetsAndExtras(client) {
    // 1) Backfill scent_family / skin_type / hair_texture / ingredients / allergens / brand / is_authentic_verified
    //    onto the original seed products. Idempotent — only updates rows where the field is still NULL.
    const backfill = [
        // [match name LIKE, brand, scent_family, skin_type, hair_texture, ingredients, allergens, is_authentic, is_local]
        ['Dior Sauvage%',          'Dior',         'Fresh / Aromatic', null,            null, 'Bergamot, Ambroxan, Pepper, Lavender, Patchouli, Cedar', 'Contains alcohol denat., limonene, linalool', true,  false],
        ['Chanel No. 5%',          'Chanel',       'Floral Aldehyde',  null,            null, 'Aldehydes, Ylang-Ylang, Rose, Jasmine, Sandalwood, Vanilla', 'Contains alcohol denat., linalool, citronellol', true, false],
        ['Tom Ford Black Orchid%', 'Tom Ford',     'Oriental / Woody', null,            null, 'Black Truffle, Ylang-Ylang, Black Orchid, Patchouli, Incense', 'Contains alcohol denat., eugenol', true, false],
        ['La Mer Moisturizing%',   'La Mer',       null,                'Dry / Mature',  null, 'Miracle Broth™, Sea Kelp, Lime Tea, Vitamin E, Glycerin', 'Fragrance, may contain limonene', true, false],
        ['Estee Lauder Advanced%', 'Estée Lauder', null,                'All skin types', null, 'Bifida Ferment Lysate, Hyaluronic Acid, Caffeine, Tripeptide-32', 'Fragrance, denatured alcohol', true, false],
        ['CeraVe Hydrating%',      'CeraVe',       null,                'Dry / Sensitive',null,'Ceramides 1/3/6-II, Hyaluronic Acid, Glycerin, MVE Technology', 'Fragrance-free, paraben-free, non-comedogenic', true, false],
        ['Clinique For Men%',      'Clinique',     null,                'Oily / Combination', null, 'Salicylic Acid, Menthol, Soap-free surfactants', 'Fragrance-free', true, false],
        ['Lab Series Daily%',      'Lab Series',   null,                'All skin types', null, 'Caffeine, Ginseng, Hyaluronic Acid, Glycerin', 'Fragrance, may contain limonene', true, false],
        ['Kiehl\'s Facial Fuel%',  'Kiehl\'s',     null,                'Normal / Combination', null, 'Vitamins C & E, Caffeine, Chestnut extract', 'Fragrance', true, false],
        ['MAC Ruby Woo%',          'MAC',          null,                null,             null, 'Ricinus Communis (Castor) Seed Oil, Octyldodecanol, Carnauba Wax, Mica, Iron Oxides', 'Contains CI 15850, CI 15985, may contain carmine', true, false],
        ['Fenty Beauty Pro Filt%', 'Fenty Beauty', null,                'All skin types', null, 'Dimethicone, Trimethylsiloxysilicate, Glycerin, Mica, Iron Oxides', 'Fragrance-free, oil-free', true, false],
        ['Urban Decay Naked%',     'Urban Decay',  null,                null,             null, 'Mica, Talc, Synthetic Fluorphlogopite, Iron Oxides', 'Contains carmine in some shades', true, false],
        ['Olaplex No. 3%',         'Olaplex',      null,                null,             '4A/4B/4C/Relaxed/Coloured', 'Bis-Aminopropyl Diglycol Dimaleate (patented bond builder), Water, Cetearyl Alcohol', 'Phthalate-free, sulphate-free, paraben-free', true, false],
        ['Moroccan Oil Treatment%','Moroccanoil',  null,                null,             'All hair textures', 'Argan Oil, Linseed Extract, Vitamin E, Silicones', 'Fragrance, contains limonene, linalool', true, false],
        ['Kerastase Nutritive%',   'Kérastase',    null,                null,             'Dry / Damaged', 'Irisome, Gluco-lipids, Glycerin, Niacinamide', 'Fragrance, contains limonene', true, false],
        ['Sol de Janeiro Brazilian%','Sol de Janeiro', null,            'All skin types', null, 'Cupuaçu Butter, Açaí Oil, Coconut Oil, Brazil Nut Oil', 'Fragrance (Cheirosa 62), contains limonene, linalool', true, false],
        ['The Body Shop Body Butter%', 'The Body Shop', null,           'Dry',            null, 'Shea Butter, Cocoa Butter, Beeswax', 'Fragrance', true, false],
        ['Jo Malone Wood Sage%',   'Jo Malone',    'Fresh / Woody',     null,             null, 'Sea Salt, Sage, Grapefruit, Ambrette',          'Contains alcohol denat., limonene', true, false],
        ['Dyson Airwrap%',         'Dyson',        null,                null,             'All hair textures', null, null, true, false],
        ['Real Techniques Brush%', 'Real Techniques', null,             null,             null, null, null, true, false]
    ];
    for (const [pattern, brand, scent, skin, hair, ingredients, allergens, isAuth, isLocal] of backfill) {
        await client.query(`
            UPDATE products
            SET brand = COALESCE(brand, $2),
                scent_family = COALESCE(scent_family, $3),
                skin_type = COALESCE(skin_type, $4),
                hair_texture = COALESCE(hair_texture, $5),
                ingredients = COALESCE(ingredients, $6),
                allergens = COALESCE(allergens, $7),
                is_authentic_verified = CASE WHEN is_authentic_verified IS NULL OR is_authentic_verified = FALSE THEN $8 ELSE is_authentic_verified END,
                is_local_brand = CASE WHEN is_local_brand IS NULL OR is_local_brand = FALSE THEN $9 ELSE is_local_brand END
            WHERE name LIKE $1
        `, [pattern, brand, scent, skin, hair, ingredients, allergens, isAuth, isLocal]);
    }

    // Demo SKU inserts below only run with SEED_DEMO_DATA=true (off in production),
    // so deleted samples/local/natural-hair SKUs never reappear on deploy.
    if (process.env.SEED_DEMO_DATA !== 'true') return;

    // 2) Seed local Kenyan brand SKUs (skip if any already exist)
    const localCount = await client.query("SELECT COUNT(*) as count FROM products WHERE is_local_brand = TRUE");
    if (parseInt(localCount.rows[0].count) === 0) {
        const localImg = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&h=800&fit=crop';
        const locals = [
            // [name, description, price, original_price, discount, category, image_url, stock, brand, scent_family, skin_type, hair_texture, ingredients, allergens]
            ['Marini Naturals Curl Cream 200ml',     'Curl-defining cream for natural African hair. Slip, definition, no flakes. Made in Kenya.', 1850, 2200, 16, 'Hair Care', localImg, 50, 'Marini Naturals', null, null, '4A/4B/4C', 'Shea Butter, Castor Oil, Coconut Oil, Glycerin', 'Fragrance', true, true],
            ['Marini Naturals Leave-In Conditioner', 'Daily moisturising leave-in for type 4 hair. Lightweight, no buildup.', 1450, 1700, 15, 'Hair Care', localImg, 60, 'Marini Naturals', null, null, '4A/4B/4C', 'Aloe Vera, Argan Oil, Glycerin, Panthenol', 'Fragrance', true, true],
            ['Suzie Beauty Matte Lipstick — Nairobi Nights', 'Long-wear matte lipstick formulated for African skin tones. Made in Kenya.', 1200, 1500, 20, 'Makeup', localImg, 40, 'Suzie Beauty', null, null, null, 'Castor Oil, Carnauba Wax, Iron Oxides, Vitamin E', 'May contain carmine', true, true],
            ['Suzie Beauty Liquid Foundation — Med-Deep', 'Buildable medium-to-full coverage foundation. 10 shades for African skin tones.', 1850, 2200, 16, 'Makeup', localImg, 30, 'Suzie Beauty', null, 'All skin types', null, 'Water, Dimethicone, Glycerin, Iron Oxides, Mica', 'Fragrance-free', true, true],
            ['Pauline Cosmetics Shea Body Butter 250ml', 'Whipped shea body butter with avocado oil. Locally made, locally sourced.', 950, 1200, 21, 'Body Care', localImg, 70, 'Pauline Cosmetics', null, 'Dry', null, 'Shea Butter, Avocado Oil, Coconut Oil, Vitamin E', 'Fragrance', true, true],
            ['Pauline Cosmetics African Black Soap Bar', 'Traditional African black soap. Clears acne, evens tone, deeply cleanses.', 450, 600, 25, 'Body Care', localImg, 100, 'Pauline Cosmetics', null, 'Oily / Acne-prone', null, 'Plantain Skin Ash, Shea Butter, Palm Oil, Cocoa Pod', 'Sulphate-free, paraben-free', true, true],
            ['Huddah Cosmetics Liquid Matte Lip — Bossy', 'Iconic matte liquid lipstick by Huddah Monroe. 8 hours wear, full pigment.', 1450, 1800, 19, 'Makeup', localImg, 45, 'Huddah Cosmetics', null, null, null, 'Cyclopentasiloxane, Trimethylsiloxysilicate, Iron Oxides, Pigments', 'May contain carmine', true, true]
        ];
        for (const r of locals) {
            await client.query(`
                INSERT INTO products (name, description, price, original_price, discount, category, image_url, stock, brand, scent_family, skin_type, hair_texture, ingredients, allergens, is_authentic_verified, is_local_brand)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            `, r);
        }
        console.log('Local Kenyan brand SKUs seeded');
    }

    // 3) Seed natural-hair brand SKUs (skip if Cantu / Shea Moisture / etc. already exist)
    const naturalHairCount = await client.query("SELECT COUNT(*) as count FROM products WHERE brand IN ('Cantu','Shea Moisture','As I Am','Mielle','Aunt Jackie''s')");
    if (parseInt(naturalHairCount.rows[0].count) === 0) {
        const nhImg = 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&h=800&fit=crop';
        const naturals = [
            ['Cantu Shea Butter Leave-In Conditioning Repair Cream',     'Repairs damaged hair with shea butter. Cult-favourite for type 4 hair.', 950, 1200, 21, 'Hair Care', nhImg, 80, 'Cantu',         '4A/4B/4C', 'Shea Butter, Argan Oil, Olive Oil, Honey'],
            ['Cantu Coconut Curling Cream 340g',                          'Defines and moisturises curls without crunch. Pure coconut oil base.',   1100, 1400, 21, 'Hair Care', nhImg, 70, 'Cantu',         '3B/3C/4A/4B', 'Coconut Oil, Shea Butter, Glycerin'],
            ['Shea Moisture Jamaican Black Castor Oil Strengthen & Restore Shampoo', 'Strengthens damaged hair with Jamaican black castor oil.', 1450, 1700, 15, 'Hair Care', nhImg, 60, 'Shea Moisture', '4A/4B/4C/Relaxed', 'Jamaican Black Castor Oil, Shea Butter, Peppermint, Apple Cider Vinegar'],
            ['Shea Moisture Coconut & Hibiscus Curl Enhancing Smoothie',  'The original curl smoothie. Frizz control and shine for 3B–4A curls.', 1650, 1950, 15, 'Hair Care', nhImg, 55, 'Shea Moisture', '3B/3C/4A', 'Shea Butter, Coconut Oil, Hibiscus, Silk Protein'],
            ['As I Am Coconut CoWash Cleansing Conditioner 454g',         'No-suds cleansing conditioner for daily refresh. Detangles and softens.', 1850, 2200, 16, 'Hair Care', nhImg, 50, 'As I Am',       '3C/4A/4B/4C', 'Coconut Oil, Castor Oil, Phytosterols, Ceramides'],
            ['Mielle Rosemary Mint Scalp & Hair Strengthening Oil',       'Viral TikTok scalp oil. Rosemary + mint stimulates growth.',           1750, 2100, 17, 'Hair Care', nhImg, 90, 'Mielle',        'All natural hair', 'Rosemary, Mint, Biotin, Castor Oil, Argan Oil'],
            ['Aunt Jackie\'s Curl La La Defining Curl Custard',            'Maximum curl definition without flakes. Long-lasting hold.',           1250, 1500, 17, 'Hair Care', nhImg, 65, 'Aunt Jackie\'s','3B/3C/4A/4B', 'Marshmallow Root, Shea Butter, Flaxseed Extract']
        ];
        for (const [name, desc, price, op, disc, cat, img, stock, brand, hairTex, ingr] of naturals) {
            await client.query(`
                INSERT INTO products (name, description, price, original_price, discount, category, image_url, stock, brand, hair_texture, ingredients, allergens, is_authentic_verified)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
            `, [name, desc, price, op, disc, cat, img, stock, brand, hairTex, ingr, 'Sulphate-free, paraben-free']);
        }
        console.log('Natural-hair brand SKUs seeded');
    }

    // 4) Sample / trial-size SKUs (skip if any sample already exists)
    const sampleCount = await client.query("SELECT COUNT(*) as count FROM products WHERE is_sample = TRUE");
    if (parseInt(sampleCount.rows[0].count) === 0) {
        const sampleImg = 'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?w=800&h=800&fit=crop';
        const samples = [
            // [name, description, price, category, image_url, stock, brand, size]
            ['Dior Sauvage EDT — 10ml Decant',           'Try before you commit. 10ml decant of Dior Sauvage in a glass atomiser.', 1200, 'Perfumes',         sampleImg, 100, 'Dior',         '10ml'],
            ['Chanel No. 5 EDP — 5ml Decant',            'Iconic floral aldehyde in a 5ml glass decant.',                            1500, 'Perfumes',         sampleImg, 80,  'Chanel',       '5ml'],
            ['Tom Ford Black Orchid — 10ml Decant',      'Luxurious dark floral in a 10ml glass decant.',                            2200, 'Perfumes',         sampleImg, 60,  'Tom Ford',     '10ml'],
            ['La Mer Moisturizing Cream — 5ml Sample',   'Sample size of the legendary face cream. Test before investing in the full size.', 900, 'Women\'s Skincare', sampleImg, 50, 'La Mer', '5ml'],
            ['Sol de Janeiro Brazilian Bum Bum Cream — 25ml Travel', 'Travel-size cult body cream. Perfect for handbag or trying the scent.', 950, 'Body Care', sampleImg, 70, 'Sol de Janeiro', '25ml'],
            ['Estée Lauder Advanced Night Repair — 7ml Sample', 'Sample serum to test on your skin before committing to the full bottle.', 850, 'Women\'s Skincare', sampleImg, 60, 'Estée Lauder', '7ml']
        ];
        for (const [name, desc, price, cat, img, stock, brand, size] of samples) {
            await client.query(`
                INSERT INTO products (name, description, price, category, image_url, stock, brand, size, is_sample, is_authentic_verified)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE)
            `, [name, desc, price, cat, img, stock, brand, size]);
        }
        console.log('Trial-size sample SKUs seeded');
    }

    // 5) Shade variants for Fenty Foundation + MAC Ruby Woo (skip if variants exist for any product)
    const variantCount = await client.query("SELECT COUNT(*) as count FROM product_variants");
    if (parseInt(variantCount.rows[0].count) === 0) {
        const fenty = await client.query("SELECT id FROM products WHERE name LIKE 'Fenty Beauty Pro Filt%' LIMIT 1");
        if (fenty.rows[0]) {
            const fid = fenty.rows[0].id;
            // Curated 12 shades spanning Fenty's range (representative, not the full 50)
            const fentyShades = [
                ['110 Light Cool',         '#F1D2B0', 'cool',    20, 'FB-110'],
                ['150 Light-Med Neutral',  '#E2B58C', 'neutral', 25, 'FB-150'],
                ['220 Light-Med Warm',     '#D4A578', 'warm',    25, 'FB-220'],
                ['260 Medium Neutral',     '#B68458', 'neutral', 30, 'FB-260'],
                ['330 Med-Deep Warm',      '#9B6B45', 'warm',    30, 'FB-330'],
                ['380 Deep Neutral',       '#7F4E2E', 'neutral', 25, 'FB-380'],
                ['420 Deep Warm',          '#69391F', 'warm',    25, 'FB-420'],
                ['440 Deep Cool',          '#5C3119', 'cool',    20, 'FB-440'],
                ['470 Deep Neutral',       '#4E2814', 'neutral', 20, 'FB-470'],
                ['480 Rich Deep Cool',     '#3F1F0E', 'cool',    15, 'FB-480'],
                ['490 Rich Deep Neutral',  '#341809', 'neutral', 15, 'FB-490'],
                ['498 Deepest Neutral',    '#251006', 'neutral', 12, 'FB-498']
            ];
            for (const [name, hex, under, stock, sku] of fentyShades) {
                await client.query(`INSERT INTO product_variants (product_id, variant_name, shade_hex, undertone, stock, sku_suffix) VALUES ($1,$2,$3,$4,$5,$6)`,
                    [fid, name, hex, under, stock, sku]);
            }
        }

        const mac = await client.query("SELECT id FROM products WHERE name LIKE 'MAC Ruby Woo%' LIMIT 1");
        if (mac.rows[0]) {
            const mid = mac.rows[0].id;
            // MAC Ruby Woo is itself one shade; expose 4 sibling matte reds & pinks customers ask for
            const macShades = [
                ['Ruby Woo (Vivid Blue-Red)',  '#C5172E', 'cool',    30, 'MAC-RW'],
                ['Diva (Deep Burgundy)',        '#7B1431', 'cool',    20, 'MAC-DIVA'],
                ['Russian Red (True Red)',      '#A0142F', 'neutral', 25, 'MAC-RR'],
                ['Velvet Teddy (Deep Nude)',    '#A66D5C', 'warm',    35, 'MAC-VT'],
                ['Chili (Brick Red)',           '#963327', 'warm',    25, 'MAC-CHI']
            ];
            for (const [name, hex, under, stock, sku] of macShades) {
                await client.query(`INSERT INTO product_variants (product_id, variant_name, shade_hex, undertone, stock, sku_suffix) VALUES ($1,$2,$3,$4,$5,$6)`,
                    [mid, name, hex, under, stock, sku]);
            }
        }
        console.log('Shade variants seeded');
    }

    // 6) Bundles (skip if any bundle exists)
    const bundleCount = await client.query("SELECT COUNT(*) as count FROM bundles");
    if (parseInt(bundleCount.rows[0].count) === 0) {
        // Helper to insert a bundle and its items
        async function makeBundle(name, slug, description, bundlePrice, imageUrl, items) {
            const ins = await client.query(`INSERT INTO bundles (name, slug, description, bundle_price, image_url) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [name, slug, description, bundlePrice, imageUrl]);
            const bid = ins.rows[0].id;
            for (const [productNameLike, qty] of items) {
                const p = await client.query(`SELECT id FROM products WHERE name LIKE $1 LIMIT 1`, [productNameLike]);
                if (p.rows[0]) {
                    await client.query(`INSERT INTO bundle_items (bundle_id, product_id, quantity) VALUES ($1,$2,$3)`,
                        [bid, p.rows[0].id, qty]);
                }
            }
        }

        await makeBundle(
            'AM Skincare Routine — Combo Skin',
            'am-skincare-combo',
            'A complete morning routine for combination skin: cleanser, serum, moisturiser. Bundle saves ~15% vs buying individually.',
            18900,
            'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&h=800&fit=crop',
            [['CeraVe Hydrating%', 1], ['Estee Lauder Advanced%', 1]]
        );
        await makeBundle(
            'Bridal Glam Kit',
            'bridal-glam',
            'Everything for the big day: foundation, statement red lip, and a signature scent.',
            22500,
            'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&h=800&fit=crop',
            [['Fenty Beauty Pro Filt%', 1], ['MAC Ruby Woo%', 1], ['Chanel No. 5%', 1]]
        );
        await makeBundle(
            'Fragrance Discovery Trio',
            'fragrance-trio',
            'Three 10ml decants to find your signature scent. Dior Sauvage, Chanel No. 5, Tom Ford Black Orchid.',
            4400,
            'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=800&h=800&fit=crop',
            [['Dior Sauvage EDT — 10ml%', 1], ['Chanel No. 5 EDP — 5ml%', 1], ['Tom Ford Black Orchid — 10ml%', 1]]
        );
        await makeBundle(
            'Natural Hair Wash-Day Kit',
            'natural-hair-wash',
            'Shampoo, leave-in conditioner, and curl cream — the full wash-day routine for type 4 hair.',
            4500,
            'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=800&h=800&fit=crop',
            [['Shea Moisture Jamaican%', 1], ['Cantu Shea Butter Leave-In%', 1], ['Marini Naturals Curl Cream%', 1]]
        );
        console.log('Bundles seeded');
    }
}

async function seedAdminUser(client) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
        INSERT INTO users (name, email, phone, password, is_admin)
        VALUES ($1, $2, $3, $4, $5)
    `, ['Admin User', 'admin@creviabeauty.com', '+254745853914', hashedPassword, true]);
    console.log('Admin user created');
}

async function seedReviews(client) {
    const reviews = [
        ["James Mwangi", "james.mwangi@gmail.com", 5, "Amazing perfume collection! I ordered Dior Sauvage and it's 100% authentic.", 5, 5],
        ["Grace Wanjiku", "grace.w@yahoo.com", 5, "Best beauty store in Nairobi! The skincare products are genuine and affordable.", 5, 4],
        ["Peter Ochieng", "peter.ochieng@outlook.com", 4, "Good products and reasonable prices. The La Mer cream is fantastic!", 5, 3],
        ["Mary Njeri", "marynjeri254@gmail.com", 5, "I get all my makeup from CreviaBeauty. Great quality and fast delivery!", 5, 5],
        ["David Kimani", "d.kimani@gmail.com", 4, "Ordered skincare products for my wife - she loves them! Quality is excellent.", 4, 5],
        ["Sarah Akinyi", "sarahakinyi@hotmail.com", 5, "Asante sana CreviaBeauty! Found my signature perfume here.", 5, 5],
        ["Michael Otieno", "michael.o@gmail.com", 5, "The hair care products work wonders! My hair has never looked better.", 5, 4],
        ["Ann Wambui", "annwambui@gmail.com", 4, "Great body care products. The Brazilian Bum Bum Cream smells divine!", 4, 4]
    ];

    for (const r of reviews) {
        await client.query(`
            INSERT INTO reviews (customer_name, customer_email, rating, review_text, product_quality, delivery_rating, is_approved)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        `, r);
    }
    console.log('Sample reviews added to database');
}

async function seedPaymentSettings(client) {
    const settings = [
        ['mpesa_type', 'send_money'], // Options: send_money, paybill, till
        ['mpesa_phone', '0745853914'],
        ['mpesa_paybill_number', ''],
        ['mpesa_paybill_account', ''],
        ['mpesa_till_number', ''],
        ['bank_name', 'Equity Bank'],
        ['bank_account_name', 'CreviaBeauty Ltd'],
        ['bank_account_number', '1234567890'],
        ['bank_branch', 'Nairobi Branch'],
        ['cod_enabled', 'true'],
        ['mpesa_enabled', 'true'],
        ['bank_enabled', 'true']
    ];

    for (const [key, value] of settings) {
        await client.query(`
            INSERT INTO payment_settings (setting_key, setting_value)
            VALUES ($1, $2)
            ON CONFLICT (setting_key) DO NOTHING
        `, [key, value]);
    }
    console.log('Payment settings initialized');
}

async function seedCommissionTiers(client) {
    const tiers = [
        ['bronze', 0, 10.00],
        ['silver', 100000, 12.00],
        ['gold', 500000, 15.00],
        ['platinum', 1000000, 18.00]
    ];

    for (const [tierName, minSales, commissionRate] of tiers) {
        await client.query(`
            INSERT INTO commission_tiers (tier_name, min_sales, commission_rate)
            VALUES ($1, $2, $3)
            ON CONFLICT (tier_name) DO NOTHING
        `, [tierName, minSales, commissionRate]);
    }
    console.log('Commission tiers initialized');
}

async function seedPointsSettings(client) {
    const settings = [
        ['points_per_kes', '100'],           // 1 point per KES 100 spent
        ['referral_bonus', '500'],           // 500 points referral bonus
        ['points_to_kes_rate', '10'],        // 10 points = KES 1
        ['min_redeem_points', '1000'],       // Minimum 1000 points to redeem
        ['min_marketer_payout', '5000'],     // KES 5,000 minimum for marketer payouts
        ['min_points_withdrawal', '5000'],   // KES 5,000 minimum for points withdrawal
        ['points_enabled', 'true'],
        ['referrals_enabled', 'true']
    ];

    for (const [key, value] of settings) {
        await client.query(`
            INSERT INTO points_settings (setting_key, setting_value)
            VALUES ($1, $2)
            ON CONFLICT (setting_key) DO NOTHING
        `, [key, value]);
    }
    console.log('Points settings initialized');
}

async function seedHeroSlides(client) {
    // Mirror the original 9 hardcoded slides. Image picked from one product per category at seed time;
    // admins can change everything afterwards via /admin#hero-slides.
    // Problem-led copy ($100M Offers framing) — keep in sync with scripts/update-hero-copy.js
    const slides = [
        // [category, badge, title_prefix, title_highlight, title_suffix, description, link_text, extra_link_url, extra_link_text]
        ['Perfumes',          'BATCH-CODE VERIFIED',    'Never Wonder If It\'s', 'Fake',              'Again',        'Every bottle sourced direct and batch-code verifiable: Dior, Chanel, Tom Ford, Jo Malone. Authenticity guaranteed · Free delivery in Nairobi.', 'Shop Perfumes', '/quiz', 'Not sure where to start? Take the 5-question scent quiz.'],
        ["Women's Skincare",  'INGREDIENT-LED',         'Skincare That Matches', 'Your Skin,',        'Not The Hype', 'Full ingredient and allergen info on every product. From La Mer to CeraVe, pick what your skin actually needs. Authenticity guaranteed · Free delivery in Nairobi.', "Shop Women's Skincare", null, null],
        ["Men's Skincare",    'NO-OVERWHELM GROOMING',  'Look Sharp In',         'Two Steps,',        'Not Ten',      'Cleanse, hydrate, done. A focused grooming line without the ten-step overwhelm. Free delivery in Nairobi.', "Shop Men's Skincare", null, null],
        ['Makeup',            'SHADE-MATCHED FOR YOU',  'Foundation That Actually', 'Matches',        null,           'Foundations in 12 shades for African skin tones. Kenyan brands like Suzie Beauty alongside Fenty, MAC and Urban Decay. Free delivery in Nairobi.', 'Shop Makeup', null, null],
        ['Fragrances',        'FIND YOUR SIGNATURE',    'Find The Scent That Feels Like', 'You',      null,           'Five questions, one signature scent. Long-lasting designer fragrances, authenticity guaranteed.', 'Shop Fragrances', '/quiz', 'Take the 5-question scent quiz.'],
        ['Hair Care',         'TYPE 4 FRIENDLY',        'Wash Day Without The',  'Guesswork',         null,           "Filter by your texture: 4A, 4B, 4C. Cantu, Shea Moisture, Marini Naturals, Mielle and Aunt Jackie's. Free delivery in Nairobi.", 'Shop Hair Care', null, null],
        ['Body Care',         'BODY EDIT',              'The Glow That',         'Doesn\'t Wash Off', null,           "Whipped butters, bath rituals, and cult favourites like Sol de Janeiro's Bum Bum cream. Free delivery in Nairobi.", 'Shop Body Care', null, null],
        ['Beauty Tools',      'PRO TOOLS',              'Your Makeup Is Fine. Your', 'Tools',         'Aren\'t.',     'Dyson Airwrap, Real Techniques brushes: the kit pieces that change a routine. Authenticity guaranteed.', 'Shop Beauty Tools', null, null],
        ['Wigs',              'BEGINNER FRIENDLY',      'Salon Hair,',           'Zero',              'Salon Hours',  'Glueless, beginner-friendly styles, from everyday headband wigs to luxury HD lace. Human hair and synthetic. Free delivery in Nairobi.', 'Shop Wigs', null, null]
    ];

    // Pick one product image per category (first row) so the seeded slides have a sensible default image
    const imgRes = await client.query(`
        SELECT DISTINCT ON (category) category, image_url
        FROM products
        WHERE image_url IS NOT NULL AND image_url <> ''
        ORDER BY category, id
    `);
    const imageByCategory = {};
    for (const row of imgRes.rows) imageByCategory[row.category] = row.image_url;
    const fallback = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1600&h=900&fit=crop';

    for (let i = 0; i < slides.length; i++) {
        const [category, badge, prefix, highlight, suffix, description, linkText, extraUrl, extraText] = slides[i];
        await client.query(`
            INSERT INTO hero_slides
                (category, image_url, badge, title_prefix, title_highlight, title_suffix,
                 description, link_text, extra_link_url, extra_link_text, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [category, imageByCategory[category] || fallback, badge, prefix, highlight, suffix,
            description, linkText, extraUrl, extraText, i]);
    }
    console.log('Hero slides seeded');
}

async function seedArticles(client) {
    // The three articles that used to be hardcoded in public/blog.html, now DB-driven.
    const articles = [
        {
            slug: 'first-time-wig-buyer',
            title: 'Buying your first wig: a no-BS Nairobi guide',
            category: 'Wigs',
            hero_image_url: 'https://images.unsplash.com/photo-1634315775834-3e1ac73de6b6?w=1200',
            intro: 'If you\'re buying your first wig in Nairobi, you have three real choices: a synthetic headband wig (cheapest, easiest), a semi-human bob (mid-budget, looks more natural) or a human-hair closure unit (most expensive, most versatile).',
            meta_title: 'Buying Your First Wig in Nairobi: A No-BS Guide',
            meta_description: 'Headband, lace front, frontal, HD lace — what actually matters when you\'re starting out, and what to spend on later.',
            tags: 'wigs,beginner,nairobi',
            content: {
                sections: [
                    { heading: 'Start with a headband wig', paragraphs: ['Headband wigs slip on in 30 seconds — no glue, no lace, no skill required. They\'re forgiving while you learn how to handle a unit, and they\'re cheap enough (KES 2,500–4,500) that you won\'t cry if the cap gets stretched out.'] },
                    { heading: 'Upgrade to a closure when you\'re ready', paragraphs: ['A 4×4 closure wig (KES 16,000–22,000 in human hair) gives you a realistic parting and lasts 6–12 months with good care. Skip "lace front" until you\'ve practised laying lace once or twice.'] },
                    { heading: 'HD lace is the luxury tier, not the starting tier', paragraphs: ['HD lace melts into the scalp beautifully but it\'s also more delicate. Earn the right to wear it.'] }
                ],
                cta_text: 'Ready to start? Browse our wig collection — from everyday headband wigs to luxury HD lace units.',
                cta_link: '/products?category=Wigs',
                carousel: []
            },
            published_at: '2026-05-10'
        },
        {
            slug: 'natural-hair-wash-day',
            title: 'A Nairobi wash-day routine for 4C hair',
            category: 'Hair Care',
            hero_image_url: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=1200',
            intro: '4C hair needs moisture, gentle cleansing, and slip — in that order. Here\'s a routine using products available at CreviaBeauty.',
            meta_title: 'A Nairobi Wash-Day Routine for 4C Hair',
            meta_description: 'The exact 4-product routine for cleansing, deep conditioning, and styling 4C hair — using brands you can actually buy here.',
            tags: 'hair care,4c,wash day',
            content: {
                sections: [
                    { heading: 'Step 1 — Pre-poo and detangle', paragraphs: ['Section dry hair into four. Apply Mielle Rosemary Mint Hair Oil to the lengths and finger-detangle gently. Skip the brush.'] },
                    { heading: 'Step 2 — Cleanse', paragraphs: ['Use Shea Moisture Jamaican Black Castor Oil shampoo on the scalp only. Rinse with cool water — hot water roughs up the cuticle.'] },
                    { heading: 'Step 3 — Deep condition', paragraphs: ['Apply As I Am Coconut CoWash from mid-shaft to ends. Cover with a plastic cap for 20 minutes. Rinse with cool water.'] },
                    { heading: 'Step 4 — Leave-in and style', paragraphs: ['While damp, apply Cantu Shea Butter Leave-In, followed by Marini Naturals Curl Cream. Twist or braid into your style of choice.'] }
                ],
                cta_text: 'Every product in this routine is in stock — filter Hair Care by your texture.',
                cta_link: '/products?category=Hair%20Care',
                carousel: []
            },
            published_at: '2026-05-17'
        },
        {
            slug: 'top-fragrances-nairobi-weather',
            title: 'Top 5 fragrances for Nairobi weather',
            category: 'Fragrances',
            hero_image_url: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=1200',
            intro: 'Nairobi sits at altitude with low humidity and warm daytime temperatures. Heavy oriental perfumes can become cloying; light citrus can vanish too fast. The sweet spot is fresh-aromatic with a woody base.',
            meta_title: 'Top 5 Fragrances for Nairobi Weather',
            meta_description: 'Nairobi\'s climate is warm-dry. Some perfumes go off in this heat. Here are five that hold up.',
            tags: 'fragrances,perfume,nairobi',
            content: {
                sections: [
                    { heading: '1. Dior Sauvage EDT', paragraphs: ['Bergamot opening, ambroxan base. Holds 6–8 hours in dry heat. Office-safe.'] },
                    { heading: '2. Jo Malone Wood Sage & Sea Salt', paragraphs: ['Unisex, fresh, mineral. Perfect for daytime.'] },
                    { heading: '3. Chanel No. 5', paragraphs: ['The classic. Heavier — best for evening.'] },
                    { heading: '4. Tom Ford Black Orchid', paragraphs: ['Going-out scent. Sillage for days. Use sparingly.'] },
                    { heading: '5. Sol de Janeiro Cheirosa ʼ62 Body Mist', paragraphs: ['Layer over any perfume for warmth and skin-cling. Cult favourite for a reason.'] }
                ],
                cta_text: 'All five are authentic, batch-code verifiable, and in stock in our Perfumes collection.',
                cta_link: '/products?category=Perfumes',
                carousel: []
            },
            published_at: '2026-05-24'
        }
    ];

    for (const a of articles) {
        await client.query(`
            INSERT INTO articles (slug, title, category, hero_image_url, intro, meta_title, meta_description, tags, content, status, published_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'published',$10)
            ON CONFLICT (slug) DO NOTHING
        `, [a.slug, a.title, a.category, a.hero_image_url, a.intro, a.meta_title, a.meta_description, a.tags, JSON.stringify(a.content), a.published_at]);
    }
    console.log('Blog articles seeded');
}

// Initialize on module load. Tests can await db.ready() to be sure schema + seeds
// finished before issuing requests.
const initPromise = initializeDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    throw err;
});
db.ready = () => initPromise;

module.exports = db;
