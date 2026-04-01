import React from 'react';
import { useParams, Link } from 'react-router-dom';

const BLOG_CONTENT = {
  '1': {
    title: 'The Psychology of Gifting: Why We Give',
    content: 'Gifting is a universal human truth. Since the dawn of civilization, exchanging tokens of appreciation has been a cornerstone of social interaction. Whether it is an elaborate surprise or a simple handmade card, the psychology behind gifting is profound...\n\nIt establishes a connection, communicates unspoken emotions, and reaffirms social ties. Studies have shown that the act of giving actually activates regions of the brain associated with pleasure, social connection, and trust, creating a "warm glow" effect.\n\nAt WhyGift, we believe understanding this psychological aspect is the first step toward better giving. When you focus on the "why," the "what" naturally follows.'
  },
  '2': {
    title: '5 Meaningful Anniversary Gifts That Aren\'t Cliches',
    content: 'Anniversaries are milestones that deserve more than a generic box of chocolates. When selecting an anniversary gift, the goal is to reflect the journey you\'ve shared.\n\nHere are 5 ideas:\n1. A curated playlist of songs that defined your relationship years.\n2. A personalized map of where you first met.\n3. A "time capsule" letter to be opened in 10 years.\n4. Recreating your first date, down to the exact dessert.\n5. Taking a new class together, like pottery or a cooking course.\n\nThe most important detail? Making sure it speaks specifically to your shared experiences.'
  },
  '3': {
    title: 'How AI Can Enhance Your Emotional Intelligence',
    content: 'When we think of Artificial Intelligence, we often picture robots and data crunching. But AI is uniquely positioned to act as a mirror for human emotion.\n\nBy asking probing questions to understand context, tools like WhyGift force the user to slow down. The process of articulating "Why am I buying this?" acts as a meditative exercise, inherently boosting the giver\'s emotional intelligence and empathy towards the receiver.\n\nYou are no longer just browsing; you are actively reflecting on another human being. That is the true power of AI-assisted gifting.'
  }
};

export default function BlogPost() {
  const { id } = useParams();
  const post = BLOG_CONTENT[id];

  if (!post) {
    return (
      <div className="page-container">
        <div className="page-content">
          <h1>Post Not Found</h1>
          <Link to="/blog" className="read-more">← Back to Blog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container blog-post">
       <div className="page-content">
         <Link to="/blog" className="back-link">← Back to Blog</Link>
         <h1>{post.title}</h1>
         <div className="post-body">
           {post.content.split('\n\n').map((para, i) => (
             <p key={i}>{para}</p>
           ))}
         </div>
       </div>
    </div>
  );
}
