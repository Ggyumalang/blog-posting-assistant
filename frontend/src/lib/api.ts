const API_URL = 'http://localhost:8000/api/v1';

export const extractStyle = async (blog_url: string, user_id: string) => {
  const response = await fetch(`${API_URL}/style/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blog_url, user_id })
  });
  if (!response.ok) throw new Error('Failed to extract style');
  return response.json();
};

export const generatePost = async (image_url: string, user_id: string) => {
  const response = await fetch(`${API_URL}/post/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url, user_id })
  });
  if (!response.ok) throw new Error('Failed to generate post');
  return response.json();
};

export const submitFeedback = async (post_id: string, user_id: string, original_content: string, final_content: string) => {
  const response = await fetch(`${API_URL}/style/feedback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_id, user_id, original_content, final_content })
  });
  if (!response.ok) throw new Error('Failed to submit feedback');
  return response.json();
};
