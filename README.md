# CreviaBeauty - Full Stack E-Commerce Application

A complete, production-ready beauty products e-commerce platform built with Node.js, Express, and SQLite.

## 🌟 Features

### Customer Features
- ✅ Browse products by category (Perfumes, Skincare, Makeup, Hair Care, Body Care)
- ✅ Search functionality
- ✅ Shopping cart with persistent storage
- ✅ User authentication (Register/Login)
- ✅ Checkout process with delivery details
- ✅ Contact form
- ✅ Responsive design (mobile-friendly)

### Admin Features
- ✅ Product management (Add/Edit/Delete)
- ✅ Order management
- ✅ View contact messages
- ✅ Upload product images

### Technical Features
- ✅ Session-based authentication
- ✅ Password hashing with bcrypt
- ✅ SQLite database
- ✅ Image upload with Multer
- ✅ RESTful API
- ✅ Server-side rendering

## 📁 Project Structure

```
creviabeauty-app/
├── public/                  # Frontend files
│   ├── css/
│   │   └── styles.css      # Main stylesheet
│   ├── js/
│   │   └── main.js         # Frontend JavaScript
│   ├── index.html          # Homepage
│   ├── products.html       # Products page
│   ├── cart.html           # Shopping cart
│   ├── contact.html        # Contact page
│   ├── login.html          # Login page
│   ├── register.html       # Registration page
│   └── admin.html          # Admin dashboard
├── uploads/                 # Product images storage
├── database.js             # Database setup & configuration
├── server.js               # Express server & API routes
├── package.json            # Dependencies
├── creviabeauty.db    # SQLite database (created on first run)
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Open Your Browser**
   ```
   http://localhost:3000
   ```

The server will automatically:
- Create the SQLite database
- Set up all required tables
- Insert sample products
- Create an admin user

### Admin Access
```
Email: admin@creviabeauty.com
Password: admin123
```

## 📦 Dependencies

```json
{
  "express": "^4.18.2",           // Web framework
  "express-session": "^1.17.3",   // Session management
  "bcryptjs": "^2.4.3",           // Password hashing
  "better-sqlite3": "^9.2.2",     // SQLite database
  "multer": "^1.4.5-lts.1"        // File uploads
}
```

## 🗄️ Database Schema

### Users Table
- id, name, email, phone, password (hashed), is_admin, created_at

### Products Table
- id, name, description, price, original_price, discount, category, image_url, stock, created_at

### Cart Table
- id, user_id, product_id, quantity, session_id, created_at

### Orders Table
- id, user_id, total, status, shipping_address, phone, created_at

### Order Items Table
- id, order_id, product_id, quantity, price

### Contacts Table
- id, name, email, phone, message, created_at

## 🔧 API Endpoints

### Authentication
- `POST /api/register` - Create new user account
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/user` - Get current user info

### Products
- `GET /api/products` - Get all products (with optional category/search filters)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Add product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Cart
- `GET /api/cart` - Get cart items
- `POST /api/cart` - Add item to cart
- `PUT /api/cart/:id` - Update cart item quantity
- `DELETE /api/cart/:id` - Remove item from cart

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get user orders
- `GET /api/admin/orders` - Get all orders (admin only)
- `PUT /api/admin/orders/:id` - Update order status (admin only)

### Contact
- `POST /api/contact` - Submit contact form
- `GET /api/contacts` - Get all contact messages (admin only)

## 🎨 Customization

### Update Branding
1. Edit `public/index.html` and other HTML files
2. Update company name in navigation and footer
3. Change colors in `public/css/styles.css` (CSS variables at top)

### Add More Products
1. Login as admin: http://localhost:3000/admin
2. Use the admin dashboard to add/edit/delete products
3. Or modify the sample data in `database.js`

### Change Contact Information
Update the contact details in:
- `public/index.html` (footer and top bar)
- `public/contact.html`
- `database.js` (admin user email)

## 🌐 Deployment

### Deploy to Production

1. **Set Environment Variables**
   ```bash
   export PORT=3000
   export NODE_ENV=production
   ```

2. **Use Process Manager** (e.g., PM2)
   ```bash
   npm install -g pm2
   pm2 start server.js --name creviabeauty
   pm2 save
   pm2 startup
   ```

3. **Set Up Reverse Proxy** (Nginx example)
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Deploy to Cloud Platforms

#### Heroku
```bash
# Install Heroku CLI
heroku create creviabeauty
git push heroku main
heroku open
```

#### Railway / Render / Vercel
- Connect your Git repository
- Set build command: `npm install`
- Set start command: `npm start`
- Deploy!

## 🔒 Security Notes

### Production Checklist
- [ ] Change admin password immediately
- [ ] Update session secret in `server.js`
- [ ] Set up HTTPS/SSL certificate
- [ ] Configure CORS if needed
- [ ] Set up database backups
- [ ] Add rate limiting for API endpoints
- [ ] Implement input validation
- [ ] Add CSRF protection

### Recommended Security Additions
```bash
npm install helmet express-rate-limit cors
```

Then in `server.js`:
```javascript
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

app.use(helmet());
app.use(cors());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);
```

## 📱 Mobile App Integration

The API is ready for mobile app integration. Just point your mobile app to:
```
http://your-server.com/api/
```

All endpoints return JSON and work with any frontend framework or mobile platform.

## 🐛 Troubleshooting

### Database Issues
```bash
# Delete and recreate database
rm creviabeauty.db
npm start
```

### Port Already in Use
```bash
# Change port in server.js or use environment variable
PORT=3001 npm start
```

### Image Upload Not Working
```bash
# Ensure uploads directory exists and has write permissions
mkdir uploads
chmod 755 uploads
```

## 📞 Support

For questions or issues:
- Email: info@creviabeauty.com
- Phone: +254 723 000 000

## 📄 License

This project is proprietary software for CreviaBeauty.

## 🎉 Credits

Built with ❤️ for CreviaBeauty
Using Node.js, Express, and modern web technologies

---

**Version:** 1.0.0
**Last Updated:** January 2026
**Author:** CreviaBeauty Development Team
