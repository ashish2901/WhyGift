import React, { useState } from 'react';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="page-container">
      <div className="page-content contact-content">
        <div className="contact-info">
          <h1>Contact Us</h1>
          <p>We'd love to hear from you. Whether you have a question about features, pricing, or anything else, our team is ready to answer all your questions.</p>

          <div className="info-block">
            <h3>Address</h3>
            <p>PM Aspirant,<br />Advant Tower, Noida, Uttar Pradesh, India</p>
          </div>

          <div className="info-block">
            <h3>Phone</h3>
            <p>+91 9876543210</p>
          </div>

          <div className="info-block">
            <h3>Email</h3>
            <p>hello@whygift.com</p>
          </div>
        </div>

        <div className="contact-form-container">
          {submitted ? (
            <div className="success-message">
              <h3>Thank you!</h3>
              <p>We've received your message and will get back to you shortly.</p>
              <button className="secondary-btn" onClick={() => setSubmitted(false)} style={{ marginTop: '1rem' }}>Send another message</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="contact-form">
              <div className="form-group">
                <label>Name</label>
                <input type="text" required placeholder="Your Name" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  required 
                  placeholder="your.email@example.com" 
                  pattern="^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
                  title="Please enter a valid email address with an extension (e.g., .com)"
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input 
                  type="tel" 
                  placeholder="+1 (555) 000-0000" 
                  pattern="^(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$"
                  title="Please enter a valid phone number, like +91 9876543210 or (555) 123-4567"
                />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea rows="5" required placeholder="How can we help?"></textarea>
              </div>
              <button type="submit" className="start-btn">Send Message</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
