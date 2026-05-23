/**
 * Admin Panel JavaScript
 * Handles admin dashboard functionality
 */

// Utility function to escape HTML (XSS prevention)
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

let isEditing = false;

// Check admin access
async function checkAdminAccess() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();

        if (!data.loggedIn || !data.user.isAdmin) {
            document.getElementById('admin-check').innerHTML = `
                <div class="alert alert-error">
                    <h3>Access Denied</h3>
                    <p>You need admin privileges to access this page.</p>
                    <a href="/login" class="btn btn-primary" style="margin-top: 15px;">Login as Admin</a>
                </div>
            `;
            return;
        }

        document.getElementById('admin-check').classList.add('hidden');
        document.getElementById('admin-content').classList.remove('hidden');
        loadProducts();
    } catch (error) {
        document.getElementById('admin-check').innerHTML = '<p class="text-center">Failed to verify access. Please try again.</p>';
    }
}

// Tab switching
function showTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));

    document.querySelector(`[onclick="showTab('${tab}')"]`).classList.add('active');
    document.getElementById(`${tab}-tab`).classList.remove('hidden');

    if (tab === 'products') loadProducts();
    if (tab === 'orders') loadOrders();
    if (tab === 'reviews') loadReviews();
    if (tab === 'contacts') loadContacts();
}

// Load products
async function loadProducts() {
    const container = document.getElementById('products-table');
    try {
        const response = await fetch('/api/products');
        const result = await response.json();
        const products = result.data || result;

        if (products.length === 0) {
            container.innerHTML = '<p class="text-center">No products yet. Add your first product!</p>';
            return;
        }

        const rows = products.map(p => `
            <tr>
                <td data-label="Image">
                    ${p.image_url && !p.image_url.includes('/images/')
                        ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" onerror="this.src='/images/placeholder.png'">`
                        : '<span style="font-size: 2rem;">🪑</span>'
                    }
                </td>
                <td data-label="Name"><strong>${escapeHtml(p.name)}</strong><br><small style="color: #666;">${escapeHtml((p.description || '').substring(0, 50))}...</small></td>
                <td data-label="Category"><span class="category-badge">${escapeHtml(p.category || '-')}</span></td>
                <td data-label="Price"><strong style="color: var(--secondary);">KSh ${p.price.toLocaleString()}</strong></td>
                <td data-label="Stock"><span class="stock-badge ${p.stock < 10 ? 'low' : ''}">${p.stock} units</span></td>
                <td data-label="Actions">
                    <button onclick="editProduct(${p.id})" class="btn btn-small btn-outline">Edit</button>
                    <button onclick="deleteProduct(${p.id})" class="btn btn-small btn-danger">Delete</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Image</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = '<p class="text-center">Failed to load products.</p>';
    }
}

// Load orders
async function loadOrders() {
    const container = document.getElementById('orders-table');
    try {
        const response = await fetch('/api/admin/orders');
        const result = await response.json();
        const orders = result.data || result;

        if (orders.length === 0) {
            container.innerHTML = '<p class="text-center">No orders yet.</p>';
            return;
        }

        const rows = orders.map(o => `
            <tr>
                <td data-label="Order ID"><strong>#${o.id}</strong></td>
                <td data-label="Customer">${escapeHtml(o.user_name || 'Guest')}<br><small style="color: var(--text-light);">${escapeHtml(o.user_email || '')}</small></td>
                <td data-label="Total"><strong style="color: var(--success);">KSh ${o.total.toLocaleString()}</strong></td>
                <td data-label="Status"><span class="status-badge status-${o.status}">${escapeHtml(o.status)}</span></td>
                <td data-label="Date">${new Date(o.created_at).toLocaleDateString('en-KE', {day: 'numeric', month: 'short', year: 'numeric'})}</td>
                <td data-label="Phone">${escapeHtml(o.phone || '-')}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Phone</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = '<p class="text-center">Failed to load orders.</p>';
    }
}

// Load contacts
async function loadContacts() {
    const container = document.getElementById('contacts-table');
    try {
        const response = await fetch('/api/admin/contacts');
        const result = await response.json();
        const contacts = result.data || result;

        if (contacts.length === 0) {
            container.innerHTML = '<p class="text-center">No messages yet.</p>';
            return;
        }

        const rows = contacts.map(c => `
            <tr>
                <td data-label="Name"><strong>${escapeHtml(c.name)}</strong></td>
                <td data-label="Email"><a href="mailto:${escapeHtml(c.email)}" style="color: var(--secondary);">${escapeHtml(c.email)}</a></td>
                <td data-label="Phone">${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" style="color: var(--primary);">${escapeHtml(c.phone)}</a>` : '-'}</td>
                <td data-label="Message" style="max-width: 300px;"><span style="color: var(--text-light); font-style: italic;">"${escapeHtml(c.message.substring(0, 100))}${c.message.length > 100 ? '...' : ''}"</span></td>
                <td data-label="Date">${new Date(c.created_at).toLocaleDateString('en-KE', {day: 'numeric', month: 'short', year: 'numeric'})}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Message</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = '<p class="text-center">Failed to load messages.</p>';
    }
}

// Load reviews
async function loadReviews() {
    const container = document.getElementById('reviews-table');
    try {
        const response = await fetch('/api/admin/reviews');
        const result = await response.json();
        const reviews = result.data || result;

        if (reviews.length === 0) {
            container.innerHTML = '<p class="text-center">No reviews yet.</p>';
            return;
        }

        const rows = reviews.map(r => `
            <tr>
                <td data-label="Customer">
                    <strong>${escapeHtml(r.customer_name)}</strong>
                    ${r.customer_email ? `<br><small style="color: var(--text-light);">${escapeHtml(r.customer_email)}</small>` : ''}
                </td>
                <td data-label="Rating">
                    <span style="color: #f1c40f; font-size: 1.2rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                </td>
                <td data-label="Review" style="max-width: 250px;">
                    <span style="color: var(--text-light); font-style: italic;">"${escapeHtml((r.review_text || 'No comment').substring(0, 80))}${(r.review_text || '').length > 80 ? '...' : ''}"</span>
                </td>
                <td data-label="Quality">
                    ${r.product_quality ? `<span style="color: #f1c40f;">${'★'.repeat(r.product_quality)}</span>` : '-'}
                </td>
                <td data-label="Delivery">
                    ${r.delivery_rating ? `<span style="color: #f1c40f;">${'★'.repeat(r.delivery_rating)}</span>` : '-'}
                </td>
                <td data-label="Status">
                    <span class="status-badge status-${r.is_approved ? 'completed' : 'pending'}">
                        ${r.is_approved ? 'Approved' : 'Pending'}
                    </span>
                </td>
                <td data-label="Date">${new Date(r.created_at).toLocaleDateString('en-KE', {day: 'numeric', month: 'short', year: 'numeric'})}</td>
                <td data-label="Actions">
                    ${!r.is_approved
                        ? `<button onclick="approveReview(${r.id})" class="btn btn-small btn-success">Approve</button>`
                        : `<button onclick="declineReview(${r.id})" class="btn btn-small btn-outline">Decline</button>`
                    }
                    <button onclick="deleteReview(${r.id})" class="btn btn-small btn-danger">Delete</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Customer</th>
                        <th>Rating</th>
                        <th>Review</th>
                        <th>Quality</th>
                        <th>Delivery</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    } catch (error) {
        container.innerHTML = '<p class="text-center">Failed to load reviews.</p>';
    }
}

// Approve review
async function approveReview(id) {
    try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ isApproved: true })
        });

        if (response.ok) {
            showAlert('Review approved successfully', 'success');
            loadReviews();
        } else {
            const data = await response.json();
            showAlert(data.error?.message || 'Failed to approve review', 'error');
        }
    } catch (error) {
        showAlert('Failed to approve review', 'error');
    }
}

// Decline review (unapprove)
async function declineReview(id) {
    try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ isApproved: false })
        });

        if (response.ok) {
            showAlert('Review declined successfully', 'success');
            loadReviews();
        } else {
            const data = await response.json();
            showAlert(data.error?.message || 'Failed to decline review', 'error');
        }
    } catch (error) {
        showAlert('Failed to decline review', 'error');
    }
}

// Delete review
async function deleteReview(id) {
    if (!confirm('Are you sure you want to delete this review?')) return;

    try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        if (response.ok) {
            showAlert('Review deleted successfully', 'success');
            loadReviews();
        } else {
            const data = await response.json();
            showAlert(data.error?.message || 'Failed to delete review', 'error');
        }
    } catch (error) {
        showAlert('Failed to delete review', 'error');
    }
}

// Show add product modal
function showAddProductModal() {
    isEditing = false;
    document.getElementById('modal-title').textContent = 'Add Product';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('product-modal').classList.add('active');
}

// Edit product
async function editProduct(id) {
    try {
        const response = await fetch(`/api/products/${id}`);
        const product = await response.json();

        isEditing = true;
        document.getElementById('modal-title').textContent = 'Edit Product';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-stock').value = product.stock;

        if (product.image_url) {
            document.getElementById('image-preview').innerHTML = `<img src="${escapeHtml(product.image_url)}" style="max-width: 200px; border-radius: 8px;">`;
        }

        document.getElementById('product-modal').classList.add('active');
    } catch (error) {
        showAlert('Failed to load product', 'error');
    }
}

// Delete product
async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('Product deleted successfully', 'success');
            loadProducts();
        } else {
            showAlert('Failed to delete product', 'error');
        }
    } catch (error) {
        showAlert('Failed to delete product', 'error');
    }
}

// Close modal
function closeModal() {
    document.getElementById('product-modal').classList.remove('active');
}

// Initialize admin panel
document.addEventListener('DOMContentLoaded', () => {
    // Image preview handler
    const imageInput = document.getElementById('product-image');
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('image-preview').innerHTML = `<img src="${e.target.result}" style="max-width: 200px; border-radius: 8px;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Product form submit handler
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData();
            formData.append('name', document.getElementById('product-name').value);
            formData.append('description', document.getElementById('product-description').value);
            formData.append('price', document.getElementById('product-price').value);
            formData.append('category', document.getElementById('product-category').value);
            formData.append('stock', document.getElementById('product-stock').value);

            const imageFile = document.getElementById('product-image').files[0];
            if (imageFile) {
                formData.append('image', imageFile);
            }

            const productId = document.getElementById('product-id').value;
            const url = productId ? `/api/products/${productId}` : '/api/products';
            const method = productId ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method,
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    showAlert(productId ? 'Product updated successfully' : 'Product added successfully', 'success');
                    closeModal();
                    loadProducts();
                } else {
                    showAlert(data.error?.message || data.error || 'Failed to save product', 'error');
                }
            } catch (error) {
                showAlert('Failed to save product', 'error');
            }
        });
    }

    // Check admin access
    checkAdminAccess();
});
