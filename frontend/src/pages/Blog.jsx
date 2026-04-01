import React from 'react';
import { Link } from 'react-router-dom';

const BLOG_POSTS = [
  { id: '1', title: 'The Psychology of Gifting: Why We Give', excerpt: 'Discover the deep emotional roots of why we give presents to our loved ones, and how it strengthens human bonds.' },
  { id: '2', title: '5 Meaningful Anniversary Gifts That Aren\'t Cliches', excerpt: 'Skip the standard flowers and chocolates. Here are five deeply personal ways to celebrate your spouse.' },
  { id: '3', title: 'How AI Can Enhance Your Emotional Intelligence', excerpt: 'Technology isn\'t just about efficiency; explore how AI companions like WhyGift help us pause and reflect.' }
];

export default function Blog() {
  return (
    <div className="page-container">
      <div className="page-content">
        <h1>The WhyGift Blog</h1>
        <p className="page-subtitle">Thoughts, tips, and insights on the art of meaningful gifting.</p>
        <div className="blog-list">
          {BLOG_POSTS.map(post => (
            <div key={post.id} className="blog-card">
              <h2>{post.title}</h2>
              <p>{post.excerpt}</p>
              <Link to={`/blog/${post.id}`} className="read-more">Read Full Post →</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
