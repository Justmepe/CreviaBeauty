/**
 * Review Form JavaScript
 * Handles star rating and form submission
 */

// Star rating functionality
function setupStarRating(containerId, inputId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);

    if (!container || !input) return;

    const stars = container.querySelectorAll('.star');

    stars.forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            input.value = rating;

            stars.forEach((s, index) => {
                if (index < rating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        });

        star.addEventListener('mouseenter', () => {
            const rating = parseInt(star.dataset.rating);
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.classList.add('hover');
                } else {
                    s.classList.remove('hover');
                }
            });
        });

        star.addEventListener('mouseleave', () => {
            stars.forEach(s => s.classList.remove('hover'));
        });
    });
}

// Initialize review form
document.addEventListener('DOMContentLoaded', () => {
    // Setup star ratings
    setupStarRating('overall-rating', 'rating-value');
    setupStarRating('quality-rating', 'quality-value');
    setupStarRating('delivery-rating', 'delivery-value');

    // Form submission handler
    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const rating = parseInt(document.getElementById('rating-value').value);
            if (rating === 0) {
                alert('Please select an overall rating');
                return;
            }

            const reviewData = {
                customerName: document.getElementById('customer-name').value,
                customerEmail: document.getElementById('customer-email').value,
                rating: rating,
                productQuality: parseInt(document.getElementById('quality-value').value) || null,
                deliveryRating: parseInt(document.getElementById('delivery-value').value) || null,
                reviewText: document.getElementById('review-text').value
            };

            try {
                const response = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reviewData)
                });

                const data = await response.json();

                if (data.success) {
                    reviewForm.classList.add('hidden');
                    const message = document.getElementById('form-message');
                    if (message) {
                        message.classList.remove('hidden');
                        message.innerHTML = `
                            <div class="success-message">
                                <h3>Thank You!</h3>
                                <p>Your review has been submitted and will be visible after approval.</p>
                                <a href="/" class="btn">Back to Home</a>
                            </div>
                        `;
                    }
                } else {
                    alert(getErrorMessage(data, 'Failed to submit review'));
                }
            } catch (error) {
                console.error('Review submission error:', error);
                alert('Failed to submit review. Please try again.');
            }
        });
    }
});
